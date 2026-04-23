# Security Policy

## Supported Versions

Security updates are provided for the current `main` branch until stable release branches are created.

## Reporting a Vulnerability

Please report vulnerabilities privately to the repository maintainers. Do not open public issues for suspected vulnerabilities involving authentication, authorization, credential storage, OIDC validation, Coder tokens, or workspace access.

Reports should include:

- Affected version or commit.
- Steps to reproduce.
- Impact and affected data or permissions.
- Any suggested mitigation.

Maintainers should acknowledge reports promptly, investigate in private, and publish a fix with an advisory when appropriate.

## Operational Guidance

- Rotate `APP_SESSION_SECRET`, `APP_ENCRYPTION_KEY`, and `CODER_SESSION_TOKEN` if they are exposed.
- Use HTTPS in production.
- Keep OIDC client secrets and group passwords configured only through trusted Admin sessions.
- Grant app Admin access sparingly.
- Use Coder workspace ACLs for Reviewer visibility instead of broad Coder administrator roles.
