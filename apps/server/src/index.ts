import { serve } from "@hono/node-server";
import { buildApp } from "./http/app";
import { getEnv } from "./env";

const env = getEnv();
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
