# Contributing

Thanks for your interest in contributing to `@two-71/studio`.

## Dev setup

This is a bun workspace monorepo. Use `bun` for everything — never `npm` or `yarn`.

```sh
bun install
bun run typecheck   # tsc --noEmit across every workspace
bun run check       # ultracite check (Biome lint + format)
bun run fix         # ultracite fix --unsafe, auto-fixes what it can
```

Run `bun run typecheck` and `bun run check` before opening a PR — both run in CI and a PR won't merge with either failing.

To run the reference demo app locally, see [`apps/demo/README.md`](./apps/demo/README.md).

## Repo layout

```
packages/studio/   the @two-71/studio library
  src/config/       StudioConfig types + provider defaults (freeBilling, allowAllModeration, r2Storage)
  src/server/       createStudioHandlers, watermarking, PNG metadata
  src/client/       <Studio />, hooks, client-side actions
  src/tasks/        the five Trigger.dev background tasks
  src/schema/       Drizzle table factory

apps/demo/          minimal reference Next.js app that installs the package
```

## PR expectations

- Keep changes scoped and focused; explain the "why" in your PR description.
- Open an issue to discuss non-trivial changes before starting work.
- Update docs (README, package README, or `apps/demo/README.md`) if you change behavior or config.
- No NSFW/adult content anywhere in code, comments, docs, sample assets, or workflow JSON — this is a hard rule for the repo, checked in the PR template.

By contributing, you agree your contributions will be licensed under this project's MIT license.

## Code style

Formatting and linting are enforced by [Biome](https://biomejs.dev/) via [Ultracite](https://github.com/haydenbleasel/ultracite) (`bun run check` / `bun run fix`) — don't hand-format around it.

One project-specific convention: raw `useEffect` is avoided. For one-time mount/unmount sync, use `useMountEffect` from `@two-71/studio/client` instead of importing `useEffect` directly.

## CI

Every PR and push to `main` runs (`.github/workflows/ci.yml`):

1. `bun install --frozen-lockfile`
2. `bun run typecheck`
3. `bun x ultracite check`
4. `bun run --filter='./apps/demo' build` — a production build of the demo app with dummy env values (no real credentials needed; the build only needs the config modules to load without throwing).
