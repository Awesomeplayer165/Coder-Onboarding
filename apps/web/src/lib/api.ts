import type { Bootstrap } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

let csrfToken = "";

export function setCsrf(token?: string) {
  csrfToken = token ?? "";
}

export async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...init.headers
    }
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(json?.error ?? "Request failed", response.status);
  return json as T;
}

export async function loadBootstrap() {
  const bootstrap = await api<Bootstrap>("/api/bootstrap");
  setCsrf(bootstrap.session?.csrfToken);
  return bootstrap;
}
