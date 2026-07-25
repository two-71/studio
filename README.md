# @two-71/studio

Studio is an installable AI image/video generation surface — a Next.js package plus a reference demo app — built around a pluggable provider interface for billing, moderation, and storage. Bring your own RunPod/ComfyUI workflow, auth, and payment provider; the package handles the generation pipeline, realtime status updates, and gallery UI. This repo is under active development; full setup docs, provider guides, and a hosted demo write-up will land here as the package stabilizes.

## Packages

- `packages/studio` — the `@two-71/studio` library (`.`, `./server`, `./client`, `./tasks`, `./schema` entry points).
- `apps/demo` — a minimal reference Next.js app that installs the package.

## Development

```sh
bun install
bun run typecheck
bun run check
```

See `CONTRIBUTING.md` for contribution guidelines.
