import { getEnv } from "../env";
import { coderLoginUrl, coderUsernameFromEmail } from "../domain/email";

export type CoderUser = {
  id: string;
  email: string;
  username: string;
  name?: string;
  last_seen_at?: string | null;
};

export type CoderTemplate = {
  id: string;
  name: string;
  display_name?: string;
  active_version_id?: string;
  deprecated?: boolean;
};

export type CoderWorkspace = {
  id: string;
  name: string;
  owner_id?: string;
  owner_name?: string;
  template_display_name?: string;
  template_name?: string;
  latest_build?: {
    status?: string;
    transition?: "start" | "stop" | "delete";
  };
};

export class CoderApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
  }
}

export class CoderClient {
  private baseUrl = getEnv().CODER_URL.replace(/\/+$/, "");
  private token = getEnv().CODER_SESSION_TOKEN;

  loginUrl() {
    return coderLoginUrl(this.baseUrl);
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}/api/v2${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Coder-Session-Token": this.token,
        ...init.headers
      }
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("json") ? await response.json().catch(() => null) : await response.text();
      throw new CoderApiError(`Coder API request failed: ${response.status}`, response.status, body);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json().catch(() => undefined)) as T;
  }

  async listTemplates() {
    const result = await this.request<CoderTemplate[] | { templates: CoderTemplate[] }>("/templates");
    return Array.isArray(result) ? result : result.templates;
  }

  async findUserByEmail(email: string) {
    const result = await this.request<{ users: CoderUser[] }>(`/users?q=${encodeURIComponent(email)}`);
    return result.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getUser(user: string) {
    try {
      return await this.request<CoderUser>(`/users/${encodeURIComponent(user)}`);
    } catch (error) {
      if (error instanceof CoderApiError && error.status === 404) return null;
      throw error;
    }
  }

  async createUser(input: { email: string; password: string; firstName: string; lastName: string }) {
    const username = coderUsernameFromEmail(input.email);
    return this.request<CoderUser>("/users", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        login_type: "password",
        name: `${input.firstName} ${input.lastName}`.trim(),
        password: input.password,
        username,
        user_status: "active",
        service_account: false,
        organization_ids: getEnv().CODER_ORGANIZATION_ID ? [getEnv().CODER_ORGANIZATION_ID] : undefined
      })
    });
  }

  async ensureUser(input: { email: string; password: string; firstName: string; lastName: string; coderUsername?: string | null }) {
    const existing = await this.findUserByEmail(input.email);
    if (existing) return existing;
    if (input.coderUsername) {
      const byUsername = await this.getUser(input.coderUsername);
      if (byUsername) return byUsername;
    }
    return this.createUser(input);
  }

  async listWorkspaces(query?: string) {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
    const result = await this.request<{ workspaces: CoderWorkspace[] } | CoderWorkspace[]>(`/workspaces${suffix}`);
    return Array.isArray(result) ? result : result.workspaces;
  }

  async getWorkspaceByUserAndName(user: string, workspaceName: string) {
    try {
      return await this.request<CoderWorkspace>(`/users/${encodeURIComponent(user)}/workspace/${encodeURIComponent(workspaceName)}`);
    } catch (error) {
      if (error instanceof CoderApiError && error.status === 404) return null;
      throw error;
    }
  }

  async createWorkspace(input: {
    user: string;
    name: string;
    templateId: string;
    templateVersionPresetId?: string | null;
    parameters?: Record<string, string>;
  }) {
    const richParameterValues = Object.entries(input.parameters ?? {}).map(([name, value]) => ({ name, value }));
    return this.request<CoderWorkspace>(`/users/${encodeURIComponent(input.user)}/workspaces`, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        template_id: input.templateId,
        template_version_preset_id: input.templateVersionPresetId || undefined,
        rich_parameter_values: richParameterValues
      })
    });
  }

  async shareWorkspaceWithUser(workspaceId: string, coderUserId: string, role: "read" | "admin" = "read") {
    return this.request(`/workspaces/${workspaceId}/acl`, {
      method: "PATCH",
      body: JSON.stringify({
        user_roles: {
          [coderUserId]: role
        },
        group_roles: {}
      })
    });
  }

  async createWorkspaceBuild(workspaceId: string, transition: "start" | "stop" | "delete") {
    return this.request(`/workspaces/${workspaceId}/builds`, {
      method: "POST",
      body: JSON.stringify({
        transition,
        reason: "dashboard"
      })
    });
  }

  async deleteUser(user: string) {
    return this.request(`/users/${encodeURIComponent(user)}`, {
      method: "DELETE"
    });
  }
}

export const coder = new CoderClient();
