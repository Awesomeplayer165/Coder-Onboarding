import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db/client";
import { buildApp } from "./http/app";
import { getEnv } from "./env";

const env = getEnv();
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

await migrate(db, { migrationsFolder });

const app = buildApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    console.log(`Coder Onboarding Tool listening on http://localhost:${info.port}`);
  }
);
