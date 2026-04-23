export type PublicGroup = {
  id: string;
  name: string;
  description: string;
  accountType: "participant" | "reviewer";
  authMode: "none" | "oidc";
  domainSuffix: string;
  autoCreateWorkspace: boolean;
};

export type Session = {
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
} | null;

export type Bootstrap = {
  setupRequired: boolean;
  groups: PublicGroup[];
  session: Session;
  currentIp: string;
  coderLoginUrl: string;
};

export type PersonRow = {
  id: string;
  groupId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "participant" | "reviewer" | "admin";
  groupName?: string;
  workspaceCount?: number;
  coderUsername?: string | null;
  lastLoginAt?: string | null;
};

export type WorkspaceRow = {
  id: string;
  coderWorkspaceId: string;
  name: string;
  status: string;
  templateName?: string | null;
  personName?: string;
  personEmail?: string;
  groupName?: string;
};
