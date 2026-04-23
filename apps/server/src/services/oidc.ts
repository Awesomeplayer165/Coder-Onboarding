import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db/client";
import { groups, oidcStates } from "../db/schema";
import { getEnv } from "../env";
import { randomToken } from "./crypto";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint?: string;
  allowedEmailDomain?: string;
  hostedDomainClaim?: string;
};

export type OidcClaims = {
  sub: string;
  iss: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  hd?: string;
  [key: string]: unknown;
};

function base64url(input: Buffer) {
  return input.toString("base64url");
}

export async function createOidcStart(groupId: string, config: OidcConfig, redirectTo = "/") {
  const state = randomToken(32);
  const nonce = randomToken(32);
  const codeVerifier = randomToken(48);
  const challenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const callbackUrl = `${getEnv().APP_BASE_URL.replace(/\/+$/, "")}/api/oidc/callback`;

  await db.insert(oidcStates).values({
    groupId,
    state,
    nonce,
    codeVerifier,
    redirectTo,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

export async function redeemOidcCode(input: {
  state: string;
  code: string;
  loadConfig: (groupId: string) => Promise<OidcConfig>;
}) {
  const [stateRow] = await db.select().from(oidcStates).where(eq(oidcStates.state, input.state)).limit(1);
  if (!stateRow || stateRow.expiresAt < new Date()) throw new Error("OIDC state expired or invalid.");

  const [group] = await db.select().from(groups).where(eq(groups.id, stateRow.groupId)).limit(1);
  if (!group) throw new Error("OIDC group no longer exists.");

  const config = await input.loadConfig(group.id);
  const callbackUrl = `${getEnv().APP_BASE_URL.replace(/\/+$/, "")}/api/oidc/callback`;

  const tokenResponse = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: callbackUrl,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: stateRow.codeVerifier
    })
  });

  if (!tokenResponse.ok) throw new Error("OIDC token exchange failed.");
  const tokenJson = (await tokenResponse.json()) as { id_token?: string; access_token?: string };
  if (!tokenJson.id_token) throw new Error("OIDC provider did not return an ID token.");

  const jwks = createRemoteJWKSet(new URL(config.jwksUri));
  const verified = await jwtVerify(tokenJson.id_token, jwks, {
    issuer: config.issuer,
    audience: config.clientId
  });

  const claims = verified.payload as OidcClaims;
  if (claims.nonce !== stateRow.nonce) throw new Error("OIDC nonce mismatch.");
  if (!claims.sub) throw new Error("OIDC subject is missing.");
  if (claims.email && claims.email_verified === false) throw new Error("OIDC email must be verified.");

  const domain = config.allowedEmailDomain?.toLowerCase().replace(/^@/, "");
  if (domain) {
    const emailDomain = claims.email?.split("@")[1]?.toLowerCase();
    const hostedDomainClaim = config.hostedDomainClaim ?? "hd";
    const hostedDomain = typeof claims[hostedDomainClaim] === "string" ? String(claims[hostedDomainClaim]).toLowerCase() : undefined;
    if (emailDomain !== domain && hostedDomain !== domain) {
      throw new Error("OIDC account is not in the configured domain.");
    }
  }

  await db.delete(oidcStates).where(eq(oidcStates.id, stateRow.id));
  return { claims, group, redirectTo: stateRow.redirectTo };
}
