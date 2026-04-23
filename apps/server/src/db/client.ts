import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../env";
import * as schema from "./schema";

const env = getEnv();

function databaseUrlForRuntime() {
  const url = new URL(env.DATABASE_URL);
  const runningInDocker = process.env.CODER_ONBOARDING_DOCKER === "true" || process.env.HOSTNAME?.length === 12;
  if (env.NODE_ENV === "development" && !runningInDocker && url.hostname === "postgres") {
    url.hostname = "localhost";
    return url.toString();
  }
  return env.DATABASE_URL;
}

const client = postgres(databaseUrlForRuntime(), {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
