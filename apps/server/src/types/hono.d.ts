import type { AppSession } from "../services/auth";

declare module "hono" {
  interface ContextVariableMap {
    session: AppSession | null;
  }
}
