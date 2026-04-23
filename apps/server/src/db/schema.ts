import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const accountType = pgEnum("account_type", ["participant", "reviewer"]);
export const authMode = pgEnum("auth_mode", ["none", "oidc"]);
export const personRole = pgEnum("person_role", ["participant", "reviewer", "admin"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed"]);
export const workspaceAction = pgEnum("workspace_action", ["start", "stop", "delete"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull().default("Default organization"),
  parentDomain: varchar("parent_domain", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").notNull().default(""),
    accountType: accountType("account_type").notNull().default("participant"),
    authMode: authMode("auth_mode").notNull().default("none"),
    domainSuffix: varchar("domain_suffix", { length: 255 }).notNull(),
    sharedPasswordEncrypted: text("shared_password_encrypted").notNull(),
    oidcConfigEncrypted: text("oidc_config_encrypted"),
    ipv4Allowlist: jsonb("ipv4_allowlist").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    autoCreateWorkspace: boolean("auto_create_workspace").notNull().default(false),
    coderTemplateId: varchar("coder_template_id", { length: 80 }),
    coderTemplateName: varchar("coder_template_name", { length: 160 }),
    coderTemplatePresetId: varchar("coder_template_preset_id", { length: 80 }),
    coderParameters: jsonb("coder_parameters").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("groups_org_idx").on(table.organizationId), uniqueIndex("groups_name_org_idx").on(table.organizationId, table.name)]
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "restrict" }),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 260 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    emailLocked: boolean("email_locked").notNull().default(true),
    role: personRole("role").notNull().default("participant"),
    passwordEncrypted: text("password_encrypted").notNull(),
    oidcSubject: varchar("oidc_subject", { length: 255 }),
    oidcIssuer: varchar("oidc_issuer", { length: 512 }),
    coderUserId: varchar("coder_user_id", { length: 80 }),
    coderUsername: varchar("coder_username", { length: 160 }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("people_email_idx").on(table.email),
    index("people_group_idx").on(table.groupId),
    index("people_normalized_name_idx").on(table.normalizedName),
    uniqueIndex("people_oidc_identity_idx").on(table.oidcIssuer, table.oidcSubject)
  ]
);

export const adminGrants = pgTable(
  "admin_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    grantedByPersonId: uuid("granted_by_person_id").references(() => people.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("admin_grants_email_idx").on(table.email)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => people.id, { onDelete: "cascade" }),
    csrfToken: varchar("csrf_token", { length: 120 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("sessions_person_idx").on(table.personId)]
);

export const oidcStates = pgTable("oidc_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  state: varchar("state", { length: 160 }).notNull().unique(),
  nonce: varchar("nonce", { length: 160 }).notNull(),
  codeVerifier: varchar("code_verifier", { length: 160 }).notNull(),
  redirectTo: text("redirect_to").notNull().default("/"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const workspaceRecords = pgTable(
  "workspace_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    coderWorkspaceId: varchar("coder_workspace_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 80 }).notNull().default("unknown"),
    templateName: varchar("template_name", { length: 160 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("workspace_records_coder_id_idx").on(table.coderWorkspaceId),
    index("workspace_records_person_idx").on(table.personId),
    index("workspace_records_group_idx").on(table.groupId)
  ]
);

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  createdByPersonId: uuid("created_by_person_id").references(() => people.id, { onDelete: "set null" }),
  status: varchar("status", { length: 40 }).notNull().default("preview"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const importRows = pgTable("import_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  importId: uuid("import_id").notNull().references(() => imports.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  conflictPersonId: uuid("conflict_person_id").references(() => people.id, { onDelete: "set null" }),
  conflictScore: integer("conflict_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const workspaceJobs = pgTable("workspace_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: workspaceAction("action").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  createdByPersonId: uuid("created_by_person_id").references(() => people.id, { onDelete: "set null" }),
  totalItems: integer("total_items").notNull().default(0),
  completedItems: integer("completed_items").notNull().default(0),
  failedItems: integer("failed_items").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const workspaceJobItems = pgTable("workspace_job_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => workspaceJobs.id, { onDelete: "cascade" }),
  workspaceRecordId: uuid("workspace_record_id").notNull().references(() => workspaceRecords.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("queued"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorPersonId: uuid("actor_person_id").references(() => people.id, { onDelete: "set null" }),
    action: varchar("action", { length: 160 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: varchar("target_id", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("audit_events_created_idx").on(table.createdAt)]
);

export const groupRelations = relations(groups, ({ many, one }) => ({
  organization: one(organizations, { fields: [groups.organizationId], references: [organizations.id] }),
  people: many(people)
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  group: one(groups, { fields: [people.groupId], references: [groups.id] }),
  workspaces: many(workspaceRecords)
}));
