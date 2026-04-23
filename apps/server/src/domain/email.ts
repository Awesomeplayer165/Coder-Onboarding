import { usernamePart } from "./names";

export type EmailMode = "first.last" | "firstlast" | "f.lastname" | "custom";

export function sanitizeDomain(domain: string) {
  return domain.trim().replace(/^@+/, "").toLowerCase();
}

export function emailOptions(firstName: string, lastName: string, domain: string) {
  const first = usernamePart(firstName);
  const last = usernamePart(lastName);
  const suffix = sanitizeDomain(domain);

  return {
    "first.last": `${first}.${last}@${suffix}`,
    firstlast: `${first}${last}@${suffix}`,
    "f.lastname": `${first.slice(0, 1)}.${last}@${suffix}`
  };
}

export function deriveEmail(input: {
  firstName: string;
  lastName: string;
  domain: string;
  mode: EmailMode;
  customEmail?: string;
}) {
  if (input.mode === "custom") {
    const custom = input.customEmail?.trim().toLowerCase();
    if (!custom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom)) {
      throw new Error("Enter a valid personal email address.");
    }
    return custom;
  }

  return emailOptions(input.firstName, input.lastName, input.domain)[input.mode];
}

export function coderUsernameFromEmail(email: string) {
  return email
    .toLowerCase()
    .split("@")[0]!
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function coderLoginUrl(coderUrl: string) {
  const url = new URL(coderUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/login`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
