import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3007),
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url().default("http://localhost:3007"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3007"),
  APP_SESSION_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(32),
  INITIAL_SETUP_TOKEN: z.string().min(12),
  CODER_URL: z.string().url(),
  CODER_SESSION_TOKEN: z.string().min(1),
  CODER_ORGANIZATION_ID: z.string().optional().default("")
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv() {
  if (!cached) {
    cached = schema.parse(process.env);
  }
  return cached;
}

export function isProduction() {
  return getEnv().NODE_ENV === "production";
}
