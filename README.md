# Coder Onboarding Tool

Coder Onboarding Tool is a Docker-first web app for organizations that need a lightweight, self-hosted onboarding and management layer in front of a Coder deployment.

It lets configured groups create or retrieve Coder credentials, open the Coder login page, and optionally receive a default workspace. Elevated reviewers authenticate through OIDC in this app, receive normal Coder credentials, and can be granted shared access to managed workspaces without requiring Coder Premium roles.

## Features

- Participant onboarding with first/last name matching, fuzzy duplicate detection, email choice, and copy-ready Coder credentials.
- Reviewer/Admin OIDC sign-in inside this app using per-group OIDC settings.
- Admin dashboard for groups, people, imports, Coder sync, workspace operations, and audit history.
- Per-group domain suffix, shared password, optional IPv4 allowlist, optional auto-workspace template, and optional OIDC config.
- Batch CSV imports with conflict highlighting and merge-first duplicate handling.
- Batch Coder workspace start, stop, and delete operations.
- Docker Compose production mode with Postgres.

## Production With Docker

1. Copy the example environment file:

   ```sh
   cp .env.example .env
   ```

2. Edit `.env` and set:

   - `APP_BASE_URL`
   - `APP_SESSION_SECRET`
   - `APP_ENCRYPTION_KEY`
   - `INITIAL_SETUP_TOKEN`
   - `CODER_URL`
   - `CODER_SESSION_TOKEN`

3. Start the app:

   ```sh
   docker compose up -d --build
   ```

4. Open the app at `http://localhost:3007`.

The first-run setup wizard is protected by `INITIAL_SETUP_TOKEN`. Group domains, group passwords, OIDC configuration, template choices, and IPv4 allowlists are configured in the Admin UI, not environment variables.

## Local Development

Install dependencies:

```sh
bun install
```

Start Postgres:

```sh
docker compose up -d postgres
```

Run migrations:

```sh
bun run db:migrate
```

Start the server and web app in development mode:

```sh
bun run dev:all
```

The API runs on the configured `PORT` and the Vite dev server proxies API requests during local development.

## Coder Permissions

This project uses ordinary Coder users for both Participants and Reviewers. Reviewer visibility is granted by Coder workspace ACL sharing on managed workspaces. It intentionally avoids assigning Coder Template Admin because that role can manage all templates in addition to viewing workspaces.

The Coder API token configured in `CODER_SESSION_TOKEN` must be able to create users, list templates, create workspaces, patch workspace ACLs, and create workspace builds for start/stop/delete actions.

## Security Model

- OIDC is handled by this app and configured per group.
- Coder users still sign in to Coder with email/password credentials shown in the app.
- Passwords and OIDC secrets are encrypted before storage.
- No email delivery is implemented.
- Backend routes are implementation details for the web UI and are not a supported public API.

## License

This project is licensed under GPL-2.0-only. See [LICENSE](LICENSE).
