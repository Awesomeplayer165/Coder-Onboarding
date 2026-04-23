import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { getEnv } from "../env";

function key() {
  return createHash("sha256").update(getEnv().APP_ENCRYPTION_KEY).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: encrypted.toString("base64url")
  });
}

export function decryptSecret(payload: string) {
  const parsed = JSON.parse(payload) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parsed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function id() {
  return randomUUID();
}
