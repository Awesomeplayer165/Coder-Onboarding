import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  adminGrants,
  auditEvents,
  groups,
  importRows,
  imports,
  organizations,
  people,
  workspaceJobItems,
  workspaceJobs,
  workspaceRecords
} from "../db/schema";
import { getEnv } from "../env";
import { coder } from "../services/coder";
import { createSession, attachSession, destroySession, requireAdmin, requireCsrf, type AppSession } from "../services/auth";
import { decryptSecret, encryptSecret } from "../services/crypto";
import { audit } from "../services/audit";
import { addAdminSocket, broadcastAdminUpdate, removeAdminSocket } from "../services/live";
import { createOidcStart, redeemOidcCode, type OidcConfig } from "../services/oidc";
import { deriveEmail, emailOptions, coderLoginUrl } from "../domain/email";
import { findNameMatches, isConfidentAutocomplete, type FuzzyCandidate } from "../domain/fuzzy";
import { cleanPersonName, normalizedFullName, personDisplayName } from "../domain/names";
import { parsePeopleCsv } from "../domain/csv";
import { ipv4Allowed } from "../domain/ip";
import { runWorkspaceJob } from "../jobs/workspace-jobs";

function jsonError(error: unknown, status = 400) {
  return { error: error instanceof Error ? error.message : String(error), status };
}

async function singletonOrganization() {
  const [org] = await db.select().from(organizations).limit(1);
  return org ?? null;
}

async function requireGroupAllowed(groupId: string, ip: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) throw new Error("Group not found.");
  if (!ipv4Allowed(ip, group.ipv4Allowlist)) {
    throw new Error("This group is not available from your current IPv4 address.");
  }
  return group;
}

function publicGroup(group: typeof groups.$inferSelect) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    accountType: group.accountType,
    authMode: group.authMode,
    domainSuffix: group.domainSuffix,
    autoCreateWorkspace: group.autoCreateWorkspace
  };
}

function safePerson(person: typeof people.$inferSelect) {
  return {
    id: person.id,
    groupId: person.groupId,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    role: person.role,
    coderUserId: person.coderUserId,
    coderUsername: person.coderUsername,
    lastLoginAt: person.lastLoginAt,
    createdAt: person.createdAt
  };
}

async function createOrSyncCoderUser(person: typeof people.$inferSelect) {
  const password = decryptSecret(person.passwordEncrypted);
  const coderUser = await coder.ensureUser({
    email: person.email,
    password,
    firstName: person.firstName,
    lastName: person.lastName,
    coderUsername: person.coderUsername
  });

  await db
    .update(people)
    .set({ coderUserId: coderUser.id, coderUsername: coderUser.username, updatedAt: new Date(), lastLoginAt: new Date() })
    .where(eq(people.id, person.id));

  return { coderUser, password };
}

async function maybeCreateDefaultWorkspace(person: typeof people.$inferSelect, group: typeof groups.$inferSelect) {
  if (!group.autoCreateWorkspace || !group.coderTemplateId) return null;
  const coderUser = person.coderUsername ?? person.coderUserId;
  if (!coderUser) return null;

  const known = await db
    .select()
    .from(workspaceRecords)
    .where(and(eq(workspaceRecords.personId, person.id), eq(workspaceRecords.name, "main")))
    .limit(1);
	  if (known[0]) return known[0];

  const existingCoderWorkspace = await coder.getWorkspaceByUserAndName(coderUser, "main");
  if (existingCoderWorkspace) {
    const [record] = await db
      .insert(workspaceRecords)
      .values({
        personId: person.id,
        groupId: group.id,
        coderWorkspaceId: existingCoderWorkspace.id,
        name: existingCoderWorkspace.name,
        status: existingCoderWorkspace.latest_build?.status ?? "unknown",
        templateName: existingCoderWorkspace.template_display_name ?? existingCoderWorkspace.template_name ?? group.coderTemplateName
      })
      .onConflictDoUpdate({
        target: workspaceRecords.coderWorkspaceId,
        set: {
          personId: person.id,
          groupId: group.id,
          status: existingCoderWorkspace.latest_build?.status ?? "unknown",
          templateName: existingCoderWorkspace.template_display_name ?? existingCoderWorkspace.template_name ?? group.coderTemplateName,
          lastSyncedAt: new Date()
        }
      })
      .returning();
    return record ?? null;
  }

  const workspace = await coder.createWorkspace({
    user: coderUser,
    name: "main",
    templateId: group.coderTemplateId,
    templateVersionPresetId: group.coderTemplatePresetId,
    parameters: group.coderParameters
  });

	  const [record] = await db
    .insert(workspaceRecords)
    .values({
      personId: person.id,
      groupId: group.id,
      coderWorkspaceId: workspace.id,
      name: workspace.name,
      status: workspace.latest_build?.status ?? "created",
      templateName: group.coderTemplateName
	    })
	    .returning();
  broadcastAdminUpdate("workspace.created", { personId: person.id, groupId: group.id });
  return record ?? null;
}

async function deletePersonEverywhere(person: typeof people.$inferSelect) {
  const localWorkspaces = await db.select().from(workspaceRecords).where(eq(workspaceRecords.personId, person.id));
  const coderWorkspaces = person.coderUsername ? await coder.listWorkspaces(person.coderUsername).catch(() => []) : [];
  const workspaceIds = new Set(localWorkspaces.map((workspace) => workspace.coderWorkspaceId));
  for (const workspace of coderWorkspaces) {
    if (
      workspace.owner_id === person.coderUserId ||
      workspace.owner_name === person.coderUsername ||
      workspace.owner_name === person.email ||
      localWorkspaces.some((local) => local.coderWorkspaceId === workspace.id)
    ) {
      workspaceIds.add(workspace.id);
    }
  }
  for (const workspaceId of workspaceIds) {
    await coder.createWorkspaceBuild(workspaceId, "delete").catch(() => undefined);
  }

  const coderIdentifier = person.coderUserId ?? person.coderUsername ?? person.email;
  if (coderIdentifier) {
    await coder.deleteUser(coderIdentifier).catch(async (error) => {
      if (person.coderUsername && person.coderUsername !== coderIdentifier) {
        await coder.deleteUser(person.coderUsername);
        return;
      }
      throw error;
    });
  }

  await db.delete(workspaceRecords).where(eq(workspaceRecords.personId, person.id));
  await db.delete(people).where(eq(people.id, person.id));
}

async function credentialResponse(personId: string) {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) throw new Error("Person not found.");
  const [group] = await db.select().from(groups).where(eq(groups.id, person.groupId)).limit(1);
  if (!group) throw new Error("Group not found.");
  const synced = await createOrSyncCoderUser(person);
  const refreshed = { ...person, coderUserId: synced.coderUser.id, coderUsername: synced.coderUser.username };
  await maybeCreateDefaultWorkspace(refreshed, group);
  return {
    person: safePerson(refreshed),
    credentials: {
      email: person.email,
      password: synced.password,
      coderLoginUrl: coderLoginUrl(getEnv().CODER_URL)
    }
  };
}

async function shareManagedWorkspacesWithReviewer(reviewer: typeof people.$inferSelect) {
  if (!reviewer.coderUserId) return;
  const managed = await db.select().from(workspaceRecords).where(eq(workspaceRecords.groupId, reviewer.groupId));
  for (const workspace of managed) {
    await coder.shareWorkspaceWithUser(workspace.coderWorkspaceId, reviewer.coderUserId, "read").catch(() => undefined);
  }
}

const setupSchema = z.object({
  token: z.string(),
  organizationName: z.string().min(1).default("Default organization"),
  parentDomain: z.string().optional(),
  participantGroupName: z.string().min(1).default("Participant"),
  reviewerGroupName: z.string().min(1).default("Reviewer"),
  defaultDomain: z.string().min(1),
  sharedPassword: z.string().min(8),
  firstAdminEmail: z.string().email()
});

const groupSaveSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  accountType: z.enum(["participant", "reviewer"]),
  authMode: z.enum(["none", "oidc"]),
  domainSuffix: z.string().min(1),
  sharedPassword: z.string().min(8),
  ipv4Allowlist: z.array(z.string()).default([]),
  autoCreateWorkspace: z.boolean().default(false),
  coderTemplateId: z.string().optional().nullable(),
  coderTemplateName: z.string().optional().nullable(),
  coderTemplatePresetId: z.string().optional().nullable(),
  coderParameters: z.record(z.string(), z.string()).default({}),
  oidcConfig: z
    .object({
      issuer: z.string().url(),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      authorizationEndpoint: z.string().url(),
      tokenEndpoint: z.string().url(),
      jwksUri: z.string().url(),
      userinfoEndpoint: z.string().url().optional(),
      allowedEmailDomain: z.string().optional(),
      hostedDomainClaim: z.string().optional()
    })
    .optional()
    .nullable()
});

const lookupSchema = z.object({
  groupId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1)
});

const registerSchema = z.object({
  groupId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  emailMode: z.enum(["first.last", "firstlast", "f.lastname", "custom"]),
  customEmail: z.string().optional()
});

const adminCreatePersonSchema = z.object({
  groupId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["participant", "reviewer", "admin"]).default("participant"),
  emailMode: z.enum(["first.last", "firstlast", "f.lastname", "custom"]).default("first.last"),
  customEmail: z.string().optional(),
  createInCoderNow: z.boolean().default(false)
});

export function buildApp() {
  const app = new Hono();
  app.use("*", attachSession);
  app.use("/api/admin/*", async (c, next) => {
    const denied = requireCsrf(c);
    if (denied) return denied;
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/admin/live", (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    return streamSSE(c, async (stream) => {
      const socket = {
        send: (message: string) => {
          void stream.writeSSE({ data: message });
        }
      };
      addAdminSocket(socket);
      await stream.writeSSE({ data: JSON.stringify({ type: "admin.ready", at: new Date().toISOString() }) });
      stream.onAbort(() => removeAdminSocket(socket));
      while (!stream.aborted) {
        await stream.sleep(25000);
        await stream.writeSSE({ event: "ping", data: new Date().toISOString() });
      }
    });
  });

  app.get("/api/bootstrap", async (c) => {
    const org = await singletonOrganization();
    const rows = org ? await db.select().from(groups).where(eq(groups.organizationId, org.id)).orderBy(groups.createdAt) : [];
    const session = c.get("session") as AppSession | null;
    return c.json({
      setupRequired: !org,
      groups: rows.map(publicGroup),
      session,
      currentIp: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? "127.0.0.1",
      coderLoginUrl: coder.loginUrl()
    });
  });

  app.post("/api/setup", async (c) => {
    try {
      const input = setupSchema.parse(await c.req.json());
      if (input.token !== getEnv().INITIAL_SETUP_TOKEN) return c.json({ error: "Invalid setup token." }, 403);
      const existing = await singletonOrganization();
      if (existing) return c.json({ error: "Setup has already been completed." }, 409);

      const [org] = await db
        .insert(organizations)
        .values({ name: input.organizationName, parentDomain: input.parentDomain })
        .returning();
      if (!org) throw new Error("Failed to create organization.");

      const encryptedPassword = encryptSecret(input.sharedPassword);
      await db.insert(groups).values([
        {
          organizationId: org.id,
          name: input.participantGroupName,
          description: "Basic access with name-based onboarding.",
          accountType: "participant",
          authMode: "none",
          domainSuffix: input.defaultDomain,
          sharedPasswordEncrypted: encryptedPassword
        },
        {
          organizationId: org.id,
          name: input.reviewerGroupName,
          description: "OIDC sign-in with shared workspace visibility.",
          accountType: "reviewer",
          authMode: "oidc",
          domainSuffix: input.defaultDomain,
          sharedPasswordEncrypted: encryptedPassword
        }
      ]);
      await db.insert(adminGrants).values({ email: input.firstAdminEmail.toLowerCase() });
      const [reviewerGroup] = await db.select().from(groups).where(and(eq(groups.organizationId, org.id), eq(groups.name, input.reviewerGroupName))).limit(1);
      if (!reviewerGroup) throw new Error("Reviewer group was not created.");
      const adminName = cleanPersonName("Initial", "Admin");
      const [adminPerson] = await db
        .insert(people)
        .values({
          organizationId: org.id,
          groupId: reviewerGroup.id,
          firstName: adminName.firstName,
          lastName: adminName.lastName,
          normalizedName: normalizedFullName(adminName.firstName, adminName.lastName),
          email: input.firstAdminEmail.toLowerCase(),
          role: "admin",
          passwordEncrypted: encryptedPassword
        })
        .returning();
      if (!adminPerson) throw new Error("Initial Admin was not created.");
      await createSession(c, adminPerson.id);
      await audit({ action: "setup.completed", targetType: "organization", targetId: org.id });
      broadcastAdminUpdate("setup.completed", { organizationId: org.id });
      return c.json({ ok: true });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/session", async (c) => c.json(c.get("session") ?? null));

  app.post("/api/session/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });

  app.post("/api/onboarding/lookup", async (c) => {
    try {
      const input = lookupSchema.parse(await c.req.json());
      const group = await requireGroupAllowed(input.groupId, c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1");
      const rows = await db.select().from(people).where(eq(people.groupId, group.id));
      const candidates: FuzzyCandidate[] = rows.map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        lastLoginAt: person.lastLoginAt
      }));
      return c.json({
        group: publicGroup(group),
        matches: findNameMatches(input.firstName, input.lastName, candidates),
        emailOptions: emailOptions(input.firstName, input.lastName, group.domainSuffix)
      });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/onboarding/suggest", async (c) => {
    const groupId = c.req.query("groupId");
    const query = c.req.query("q") ?? "";
    if (!groupId) return c.json({ suggestions: [] });
    await requireGroupAllowed(groupId, c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1");
    const rows = await db.select().from(people).where(eq(people.groupId, groupId));
    const suggestions = rows
      .filter((person) => isConfidentAutocomplete(query, person))
      .slice(0, 4)
      .map((person) => ({
        id: person.id,
        name: personDisplayName(person.firstName, person.lastName),
        lastLoginAt: person.lastLoginAt
      }));
    return c.json({ suggestions });
  });

  app.post("/api/onboarding/register", async (c) => {
    try {
      const input = registerSchema.parse(await c.req.json());
      const group = await requireGroupAllowed(input.groupId, c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1");
      const cleaned = cleanPersonName(input.firstName, input.lastName);
      const existingPeople = await db.select().from(people).where(eq(people.organizationId, group.organizationId));
      const existingPersonMatches = findNameMatches(
        cleaned.firstName,
        cleaned.lastName,
        existingPeople.map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          lastLoginAt: person.lastLoginAt
        }))
      );
      if (existingPersonMatches.some((match) => match.score >= 90)) {
        return c.json({ error: "A similar person already exists. Talk to an admin if this is you." }, 409);
      }
      const email = deriveEmail({
        firstName: cleaned.firstName,
        lastName: cleaned.lastName,
        domain: group.domainSuffix,
        mode: input.emailMode,
        ...(input.customEmail ? { customEmail: input.customEmail } : {})
      }).toLowerCase();
      const existingLocal = await db.select().from(people).where(eq(people.email, email)).limit(1);
      if (existingLocal[0]) return c.json({ error: "That email is already in use." }, 409);
      const existingCoder = await coder.findUserByEmail(email);
      if (existingCoder) return c.json({ error: "That email already exists in Coder. Talk to an admin if it belongs to you." }, 409);

      const [person] = await db
        .insert(people)
        .values({
          organizationId: group.organizationId,
          groupId: group.id,
          firstName: cleaned.firstName,
          lastName: cleaned.lastName,
          normalizedName: normalizedFullName(cleaned.firstName, cleaned.lastName),
          email,
          role: group.accountType,
          passwordEncrypted: group.sharedPasswordEncrypted
        })
        .returning();
      if (!person) throw new Error("Could not create account.");
      await audit({ action: "person.created", targetType: "person", targetId: person.id, metadata: { groupId: group.id } });
      broadcastAdminUpdate("person.created", { personId: person.id, groupId: group.id });
      return c.json(await credentialResponse(person.id));
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.post("/api/onboarding/claim", async (c) => {
    try {
      const input = z.object({ groupId: z.string().uuid(), personId: z.string().uuid() }).parse(await c.req.json());
      const group = await requireGroupAllowed(input.groupId, c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1");
      const [person] = await db.select().from(people).where(eq(people.id, input.personId)).limit(1);
      if (!person || person.groupId !== group.id) return c.json({ error: "Person not found in this group." }, 404);
      return c.json(await credentialResponse(input.personId));
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/oidc/:groupId/start", async (c) => {
    try {
      const group = await requireGroupAllowed(c.req.param("groupId"), c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1");
      if (!group.oidcConfigEncrypted) throw new Error("This group does not have OIDC configured.");
      const config = JSON.parse(decryptSecret(group.oidcConfigEncrypted)) as OidcConfig;
      return c.redirect(await createOidcStart(group.id, config, c.req.query("redirectTo") ?? "/"));
    } catch (error) {
      return c.redirect(`/?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  });

  app.get("/api/oidc/callback", async (c) => {
    try {
      const state = c.req.query("state");
      const code = c.req.query("code");
      if (!state || !code) throw new Error("OIDC callback is missing state or code.");
      const result = await redeemOidcCode({
        state,
        code,
        loadConfig: async (groupId) => {
          const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
          if (!group?.oidcConfigEncrypted) throw new Error("OIDC config is missing.");
          return JSON.parse(decryptSecret(group.oidcConfigEncrypted)) as OidcConfig;
        }
      });
      const group = result.group;
      const claims = result.claims;
      const email =
        claims.email?.toLowerCase() ??
        deriveEmail({
          firstName: claims.given_name ?? "reviewer",
          lastName: claims.family_name ?? String(claims.sub).slice(0, 8),
          domain: group.domainSuffix,
          mode: "first.last"
        });
      const [grant] = await db.select().from(adminGrants).where(eq(adminGrants.email, email)).limit(1);
      const rawFirstName = claims.given_name ?? claims.name?.split(" ")[0] ?? email.split("@")[0]!;
      const rawLastName = claims.family_name ?? (claims.name?.split(" ").slice(1).join(" ") || "Reviewer");
      const cleaned = cleanPersonName(rawFirstName, rawLastName);

      let [person] = await db
        .select()
        .from(people)
        .where(and(eq(people.oidcIssuer, claims.iss), eq(people.oidcSubject, claims.sub)))
        .limit(1);
      if (!person) {
        const byEmail = await db.select().from(people).where(eq(people.email, email)).limit(1);
        person = byEmail[0];
      }
      if (!person) {
        [person] = await db
          .insert(people)
          .values({
            organizationId: group.organizationId,
            groupId: group.id,
            firstName: cleaned.firstName,
            lastName: cleaned.lastName,
            normalizedName: normalizedFullName(cleaned.firstName, cleaned.lastName),
            email,
            role: grant ? "admin" : "reviewer",
            oidcIssuer: claims.iss,
            oidcSubject: claims.sub,
            passwordEncrypted: group.sharedPasswordEncrypted
          })
          .returning();
      } else {
        await db
          .update(people)
          .set({
            oidcIssuer: claims.iss,
            oidcSubject: claims.sub,
            role: grant ? "admin" : person.role === "admin" ? "admin" : "reviewer",
            lastLoginAt: new Date()
          })
          .where(eq(people.id, person.id));
      }
      if (!person) throw new Error("Could not create OIDC user.");
      try {
        const synced = await createOrSyncCoderUser(person);
        await shareManagedWorkspacesWithReviewer({ ...person, coderUserId: synced.coderUser.id, coderUsername: synced.coderUser.username });
      } catch (syncError) {
        const isAppAdmin = grant || person.role === "admin";
        await audit({
          actorPersonId: person.id,
          action: "coder.oidc_sync_failed",
          targetType: "person",
          targetId: person.id,
          metadata: { error: syncError instanceof Error ? syncError.message : String(syncError) }
        });
        if (!isAppAdmin) throw syncError;
      }
      broadcastAdminUpdate("person.signed_in", { personId: person.id, groupId: person.groupId });
      await createSession(c, person.id);
      return c.redirect(result.redirectTo);
    } catch (error) {
      return c.redirect(`/?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  });

  app.get("/api/admin/groups", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    const rows = await db.select().from(groups).orderBy(groups.createdAt);
    return c.json({
      groups: rows.map((group) => ({
        ...publicGroup(group),
        sharedPassword: decryptSecret(group.sharedPasswordEncrypted),
        ipv4Allowlist: group.ipv4Allowlist,
        coderTemplateId: group.coderTemplateId,
        coderTemplateName: group.coderTemplateName,
        coderTemplatePresetId: group.coderTemplatePresetId,
        coderParameters: group.coderParameters,
        oidcConfigured: Boolean(group.oidcConfigEncrypted),
        oidcConfig: group.oidcConfigEncrypted
          ? {
              ...(JSON.parse(decryptSecret(group.oidcConfigEncrypted)) as OidcConfig),
              clientSecret: "********"
            }
          : null
      }))
    });
  });

  app.post("/api/admin/groups", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = groupSaveSchema.extend({ id: z.string().uuid().optional() }).parse(await c.req.json());
      const org = await singletonOrganization();
      if (!org) throw new Error("Setup is required.");
      const [existingGroup] = input.id ? await db.select().from(groups).where(eq(groups.id, input.id)).limit(1) : [];
      let oidcConfigEncrypted: string | null = existingGroup?.oidcConfigEncrypted ?? null;
      if (input.oidcConfig === null) {
        oidcConfigEncrypted = null;
      } else if (input.oidcConfig) {
        const config = { ...input.oidcConfig };
        if (config.clientSecret === "********" && existingGroup?.oidcConfigEncrypted) {
          config.clientSecret = (JSON.parse(decryptSecret(existingGroup.oidcConfigEncrypted)) as OidcConfig).clientSecret;
        }
        oidcConfigEncrypted = encryptSecret(JSON.stringify(config));
      }
      const values = {
        organizationId: org.id,
        name: input.name,
        description: input.description,
        accountType: input.accountType,
        authMode: input.authMode,
        domainSuffix: input.domainSuffix,
        sharedPasswordEncrypted: encryptSecret(input.sharedPassword),
        ipv4Allowlist: input.ipv4Allowlist,
        autoCreateWorkspace: input.autoCreateWorkspace,
        coderTemplateId: input.coderTemplateId,
        coderTemplateName: input.coderTemplateName,
        coderTemplatePresetId: input.coderTemplatePresetId,
        coderParameters: input.coderParameters,
        oidcConfigEncrypted,
        updatedAt: new Date()
      };
      const [group] = input.id
        ? await db.update(groups).set(values).where(eq(groups.id, input.id)).returning()
        : await db.insert(groups).values(values).returning();
      await audit({
        actorPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null,
        action: "group.saved",
        targetType: "group",
        targetId: group?.id ?? null
      });
      broadcastAdminUpdate("group.saved", { groupId: group?.id });
      return c.json({ group });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/admin/templates", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      return c.json({ templates: await coder.listTemplates() });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/admin/people", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    const rows = await db
      .select({
        person: people,
        groupName: groups.name,
        workspaceCount: sql<number>`count(${workspaceRecords.id})`.mapWith(Number)
      })
      .from(people)
      .leftJoin(groups, eq(groups.id, people.groupId))
      .leftJoin(workspaceRecords, eq(workspaceRecords.personId, people.id))
      .groupBy(people.id, groups.name)
      .orderBy(people.lastName, people.firstName);
    return c.json({
      people: rows.map((row) => ({ ...safePerson(row.person), groupName: row.groupName, workspaceCount: row.workspaceCount }))
    });
  });

  app.post("/api/admin/people", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = adminCreatePersonSchema.parse(await c.req.json());
      const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
      if (!group) throw new Error("Group not found.");
      const cleaned = cleanPersonName(input.firstName, input.lastName);
      const email = deriveEmail({
        firstName: cleaned.firstName,
        lastName: cleaned.lastName,
        domain: group.domainSuffix,
        mode: input.emailMode,
        ...(input.customEmail ? { customEmail: input.customEmail } : {})
      }).toLowerCase();
      const existingLocal = await db.select().from(people).where(eq(people.email, email)).limit(1);
      if (existingLocal[0]) return c.json({ error: "That email is already in use." }, 409);
      const [person] = await db
        .insert(people)
        .values({
          organizationId: group.organizationId,
          groupId: group.id,
          firstName: cleaned.firstName,
          lastName: cleaned.lastName,
          normalizedName: normalizedFullName(cleaned.firstName, cleaned.lastName),
          email,
          role: input.role,
          passwordEncrypted: group.sharedPasswordEncrypted
        })
        .returning();
      if (!person) throw new Error("Could not create account.");
      if (input.createInCoderNow) await credentialResponse(person.id);
      await audit({
        actorPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null,
        action: "person.admin_created",
        targetType: "person",
        targetId: person.id,
        metadata: { groupId: group.id, role: input.role }
      });
      broadcastAdminUpdate("person.created", { personId: person.id, groupId: group.id });
      return c.json({ person: safePerson(person) });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/admin/workspaces", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    const rows = await db
      .select({
        workspace: workspaceRecords,
        firstName: people.firstName,
        lastName: people.lastName,
        email: people.email,
        groupName: groups.name
      })
      .from(workspaceRecords)
      .leftJoin(people, eq(people.id, workspaceRecords.personId))
      .leftJoin(groups, eq(groups.id, workspaceRecords.groupId))
      .orderBy(desc(workspaceRecords.createdAt));
    return c.json({
      workspaces: rows.map((row) => ({
        ...row.workspace,
        personName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
        personEmail: row.email,
        groupName: row.groupName
      }))
    });
  });

  app.post("/api/admin/workspaces/batch", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = z
        .object({ action: z.enum(["start", "stop", "delete"]), workspaceIds: z.array(z.string().uuid()).min(1) })
        .parse(await c.req.json());
      const [job] = await db
        .insert(workspaceJobs)
        .values({
          action: input.action,
          totalItems: input.workspaceIds.length,
          createdByPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null
        })
        .returning();
      if (!job) throw new Error("Could not enqueue workspace job.");
      await db.insert(workspaceJobItems).values(input.workspaceIds.map((workspaceRecordId) => ({ jobId: job.id, workspaceRecordId })));
      runWorkspaceJob(job.id).catch(() => undefined);
      broadcastAdminUpdate("workspace.job.queued", { jobId: job.id, action: input.action });
      return c.json({ job });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/admin/jobs/:id", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    const [job] = await db.select().from(workspaceJobs).where(eq(workspaceJobs.id, c.req.param("id"))).limit(1);
    const items = await db.select().from(workspaceJobItems).where(eq(workspaceJobItems.jobId, c.req.param("id")));
    return c.json({ job, items });
  });

  app.post("/api/admin/imports/preview", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = z.object({ groupId: z.string().uuid(), csv: z.string().min(1) }).parse(await c.req.json());
      const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
      if (!group) throw new Error("Group not found.");
      const rows = parsePeopleCsv(input.csv);
      const existing = await db.select().from(people).where(eq(people.organizationId, group.organizationId));
      const candidates: FuzzyCandidate[] = existing.map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        lastLoginAt: person.lastLoginAt
      }));
      const [preview] = await db
        .insert(imports)
        .values({ groupId: input.groupId, createdByPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null })
        .returning();
      if (!preview) throw new Error("Could not create import preview.");
      const withConflicts = rows.map((row) => {
        const [match] = findNameMatches(row.firstName, row.lastName, candidates);
        return { ...row, conflictPersonId: match?.id, conflictScore: match?.score ?? 0 };
      });
      await db.insert(importRows).values(withConflicts.map((row) => ({ importId: preview.id, ...row })));
      return c.json({ importId: preview.id, rows: withConflicts, conflictCount: withConflicts.filter((row) => row.conflictPersonId).length });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.post("/api/admin/imports/:id/confirm", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const [preview] = await db.select().from(imports).where(eq(imports.id, c.req.param("id"))).limit(1);
      if (!preview) throw new Error("Import not found.");
      const [group] = await db.select().from(groups).where(eq(groups.id, preview.groupId)).limit(1);
      if (!group) throw new Error("Group not found.");
      const rows = await db.select().from(importRows).where(eq(importRows.importId, preview.id));
      const toCreate = rows.filter((row) => !row.conflictPersonId);
      for (const row of toCreate) {
        const email = deriveEmail({ firstName: row.firstName, lastName: row.lastName, domain: group.domainSuffix, mode: "first.last" });
        await db
          .insert(people)
          .values({
            organizationId: group.organizationId,
            groupId: group.id,
            firstName: row.firstName,
            lastName: row.lastName,
            normalizedName: normalizedFullName(row.firstName, row.lastName),
            email,
            role: group.accountType,
            passwordEncrypted: group.sharedPasswordEncrypted
          })
          .onConflictDoNothing();
      }
      await db.update(imports).set({ status: "confirmed" }).where(eq(imports.id, preview.id));
      await audit({
        actorPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null,
        action: "import.confirmed",
        targetType: "import",
        targetId: preview.id
      });
      broadcastAdminUpdate("import.confirmed", { importId: preview.id });
      return c.json({ created: toCreate.length, merged: rows.length - toCreate.length });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.post("/api/admin/people/roles", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = z.object({ personIds: z.array(z.string().uuid()), role: z.enum(["participant", "reviewer", "admin"]) }).parse(await c.req.json());
      await db.update(people).set({ role: input.role, updatedAt: new Date() }).where(inArray(people.id, input.personIds));
      await audit({
        actorPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null,
        action: "people.roles.updated",
        targetType: "person",
        metadata: input
      });
      broadcastAdminUpdate("people.roles.updated", { count: input.personIds.length, role: input.role });
      return c.json({ ok: true });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.post("/api/admin/people/delete", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = z.object({ personIds: z.array(z.string().uuid()).min(1) }).parse(await c.req.json());
      const rows = await db.select().from(people).where(inArray(people.id, input.personIds));
      for (const person of rows) {
        await deletePersonEverywhere(person);
      }
      await audit({
        actorPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null,
        action: "people.deleted",
        targetType: "person",
        metadata: input
      });
      broadcastAdminUpdate("people.deleted", { count: rows.length });
      return c.json({ deleted: rows.length });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.post("/api/admin/workspaces/create-for-people", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const input = z
        .object({
          personIds: z.array(z.string().uuid()).min(1),
          templateId: z.string().min(1),
          templateName: z.string().optional().default("Template"),
          name: z.string().min(1).max(48).default("main")
        })
        .parse(await c.req.json());
      const rows = await db.select().from(people).where(inArray(people.id, input.personIds));
      let created = 0;
      for (const person of rows) {
        const [group] = await db.select().from(groups).where(eq(groups.id, person.groupId)).limit(1);
        if (!group) continue;
        const { coderUser } = await createOrSyncCoderUser(person);
        const coderUserRef = coderUser.username ?? coderUser.id;
        const existing = await coder.getWorkspaceByUserAndName(coderUserRef, input.name);
        const workspace =
          existing ??
          (await coder.createWorkspace({
            user: coderUserRef,
            name: input.name,
            templateId: input.templateId,
            parameters: group.coderParameters
          }));
        await db
          .insert(workspaceRecords)
          .values({
            personId: person.id,
            groupId: person.groupId,
            coderWorkspaceId: workspace.id,
            name: workspace.name,
            status: workspace.latest_build?.status ?? (existing ? "unknown" : "created"),
            templateName: workspace.template_display_name ?? workspace.template_name ?? input.templateName
          })
          .onConflictDoUpdate({
            target: workspaceRecords.coderWorkspaceId,
            set: {
              personId: person.id,
              groupId: person.groupId,
              status: workspace.latest_build?.status ?? "unknown",
              templateName: workspace.template_display_name ?? workspace.template_name ?? input.templateName,
              lastSyncedAt: new Date()
            }
          });
        created += existing ? 0 : 1;
      }
      await audit({
        actorPersonId: (c.get("session") as AppSession | null)?.person?.id ?? null,
        action: "workspaces.created_for_people",
        targetType: "workspace",
        metadata: { personIds: input.personIds, templateId: input.templateId, name: input.name, created }
      });
      broadcastAdminUpdate("workspaces.created_for_people", { count: rows.length, created });
      return c.json({ affected: rows.length, created });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/api/admin/audit", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100);
    return c.json({ events: rows });
  });

  app.post("/api/admin/coder/sync", async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    try {
      const allPeople = await db.select().from(people);
      let syncedUsers = 0;
      for (const person of allPeople) {
        await createOrSyncCoderUser(person);
        syncedUsers += 1;
      }
      broadcastAdminUpdate("coder.synced", { syncedUsers });
      return c.json({ syncedUsers });
    } catch (error) {
      const e = jsonError(error);
      return c.json({ error: e.error }, e.status as 400);
    }
  });

  app.get("/assets/*", serveStatic({ root: "./apps/web/dist" }));
  app.get("/*", serveStatic({ path: "./apps/web/dist/index.html" }));

  return app;
}
