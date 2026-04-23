CREATE TYPE "public"."account_type" AS ENUM('participant', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."auth_mode" AS ENUM('none', 'oidc');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."person_role" AS ENUM('participant', 'reviewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."workspace_action" AS ENUM('start', 'stop', 'delete');--> statement-breakpoint
CREATE TABLE "admin_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"granted_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_person_id" uuid,
	"action" varchar(160) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"account_type" "account_type" DEFAULT 'participant' NOT NULL,
	"auth_mode" "auth_mode" DEFAULT 'none' NOT NULL,
	"domain_suffix" varchar(255) NOT NULL,
	"shared_password_encrypted" text NOT NULL,
	"oidc_config_encrypted" text,
	"ipv4_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_create_workspace" boolean DEFAULT false NOT NULL,
	"coder_template_id" varchar(80),
	"coder_template_name" varchar(160),
	"coder_template_preset_id" varchar(80),
	"coder_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"conflict_person_id" uuid,
	"conflict_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by_person_id" uuid,
	"status" varchar(40) DEFAULT 'preview' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"state" varchar(160) NOT NULL,
	"nonce" varchar(160) NOT NULL,
	"code_verifier" varchar(160) NOT NULL,
	"redirect_to" text DEFAULT '/' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) DEFAULT 'Default organization' NOT NULL,
	"parent_domain" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"normalized_name" varchar(260) NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_locked" boolean DEFAULT true NOT NULL,
	"role" "person_role" DEFAULT 'participant' NOT NULL,
	"password_encrypted" text NOT NULL,
	"oidc_subject" varchar(255),
	"oidc_issuer" varchar(512),
	"coder_user_id" varchar(80),
	"coder_username" varchar(160),
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"csrf_token" varchar(120) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"workspace_record_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "workspace_action" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"created_by_person_id" uuid,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"coder_workspace_id" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(80) DEFAULT 'unknown' NOT NULL,
	"template_name" varchar(160),
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_granted_by_person_id_people_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_conflict_person_id_people_id_fk" FOREIGN KEY ("conflict_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_states" ADD CONSTRAINT "oidc_states_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_job_items" ADD CONSTRAINT "workspace_job_items_job_id_workspace_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."workspace_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_job_items" ADD CONSTRAINT "workspace_job_items_workspace_record_id_workspace_records_id_fk" FOREIGN KEY ("workspace_record_id") REFERENCES "public"."workspace_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_jobs" ADD CONSTRAINT "workspace_jobs_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_records" ADD CONSTRAINT "workspace_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_records" ADD CONSTRAINT "workspace_records_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_grants_email_idx" ON "admin_grants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "groups_org_idx" ON "groups" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_org_idx" ON "groups" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "people_email_idx" ON "people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "people_group_idx" ON "people" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "people_normalized_name_idx" ON "people" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "people_oidc_identity_idx" ON "people" USING btree ("oidc_issuer","oidc_subject");--> statement-breakpoint
CREATE INDEX "sessions_person_idx" ON "sessions" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_records_coder_id_idx" ON "workspace_records" USING btree ("coder_workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_records_person_idx" ON "workspace_records" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "workspace_records_group_idx" ON "workspace_records" USING btree ("group_id");