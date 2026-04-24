import { and, eq, gt } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { db } from "../db/client";
import { adminGrants, people, sessions } from "../db/schema";
import { isProduction } from "../env";
import { randomToken } from "./crypto";

export type AppSession = {
  id: string;
  csrfToken: string;
  person: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "participant" | "reviewer" | "admin";
    groupId: string;
    isAdmin: boolean;
  } | null;
};

export async function createSession(c: Context, personId?: string) {
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  const [session] = await db
    .insert(sessions)
    .values({ personId, csrfToken, expiresAt })
    .returning({ id: sessions.id, csrfToken: sessions.csrfToken });

  if (!session) throw new Error("Failed to create session.");

  setCookie(c, "cot_session", session.id, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "Lax",
    path: "/",
    expires: expiresAt
  });

  return session;
}

export async function destroySession(c: Context) {
  const id = getCookie(c, "cot_session");
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  deleteCookie(c, "cot_session", { path: "/" });
}

export async function readSession(c: Context): Promise<AppSession | null> {
  const id = getCookie(c, "cot_session");
  if (!id) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;
  if (!session.personId) {
    return { id: session.id, csrfToken: session.csrfToken, person: null };
  }

  const [person] = await db.select().from(people).where(eq(people.id, session.personId)).limit(1);
  if (!person) return { id: session.id, csrfToken: session.csrfToken, person: null };

  const [grant] = await db
    .select()
    .from(adminGrants)
    .where(eq(adminGrants.email, person.email.toLowerCase()))
    .limit(1);
  const isAdmin = person.role === "admin" || Boolean(grant);
  const isInitialAdminPlaceholder = isAdmin && person.firstName === "Initial" && person.lastName === "Admin";

  return {
    id: session.id,
    csrfToken: session.csrfToken,
    person: {
      id: person.id,
      email: person.email,
      firstName: isInitialAdminPlaceholder ? "Admin" : person.firstName,
      lastName: isInitialAdminPlaceholder ? "" : person.lastName,
      role: person.role,
      groupId: person.groupId,
      isAdmin
    }
  };
}

export const attachSession: MiddlewareHandler = async (c, next) => {
  c.set("session", await readSession(c));
  await next();
};

export function requireAdmin(c: Context) {
  const session = c.get("session") as AppSession | null;
  if (!session?.person?.isAdmin) {
    return c.json({ error: "Admin access is required." }, 403);
  }
  return null;
}

export function requireCsrf(c: Context) {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return null;
  const session = c.get("session") as AppSession | null;
  const provided = c.req.header("x-csrf-token");
  if (session && provided !== session.csrfToken) {
    return c.json({ error: "Invalid CSRF token." }, 403);
  }
  return null;
}
