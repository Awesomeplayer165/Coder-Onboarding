# Contributing

Thanks for helping improve Coder Onboarding Tool.

## Development

Use Bun and Docker Compose:

```sh
bun install
docker compose up -d postgres
bun run db:migrate
bun run dev:all
```

Before opening a pull request, run:

```sh
bun run typecheck
bun test
```

## Pull Requests

Pull requests should include:

- A clear description of the problem and solution.
- Tests for new or changed behavior.
- Screenshots or short recordings for significant UI changes.
- Notes about migrations, security-sensitive changes, or Coder API behavior.

## Style

- Prefer small, direct modules with clear boundaries.
- Keep secrets out of logs.
- Avoid adding comments that restate the code.
- Use the existing UI components and domain services before adding new patterns.
