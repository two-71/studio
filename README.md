# @two-71/studio

Studio is a config-driven, self-hostable AI image/video generation surface for Next.js. Bring your own billing, moderation, storage, and auth providers, and a ComfyUI workflow to run on RunPod serverless — Studio handles the generation pipeline (via Trigger.dev), realtime progress UI, and gallery.

It's a library, not a hosted product: install `@two-71/studio` into your own Next.js app and wire it up with a single `StudioConfig` object. `apps/demo` in this repo is a minimal reference app that does exactly that.

<!-- screenshot -->

## What's in this repo

- `packages/studio` — the `@two-71/studio` library. See [its README](./packages/studio/README.md) for install instructions and the full wiring guide.
- `apps/demo` — a minimal Next.js app that installs the package: free billing, open moderation, one SFW FLUX.1 Schnell image model, better-auth. See [`apps/demo/README.md`](./apps/demo/README.md) to run it end to end, including how to stand up the RunPod endpoint.

## Architecture

Studio ships as five entry points, each scoped to where it runs:

| Import | Runs in | Contains |
| --- | --- | --- |
| `@two-71/studio` | server or client | `StudioConfig` types, `deriveClientConfig`, the `freeBilling`/`allowAllModeration`/`r2Storage` provider defaults |
| `@two-71/studio/server` | server only | `createStudioHandlers` (mounts the API routes), `embedPngText`, `applyWatermarks` |
| `@two-71/studio/client` | client only | `<Studio />`, `useStudioConfig`, `useStudioUser`, `copyImage`/`downloadImage`, `useMountEffect` |
| `@two-71/studio/tasks` | Trigger.dev | `createStudioTasks` — the five background tasks (`generateRequest`, `generateImage`, `generateVideo`, `generateTitle`, `notifyGeneration`) and their payload schemas |
| `@two-71/studio/schema` | server only | `createGenerationTable`, a Drizzle table factory |

The generation flow: a client action hits a route from `createStudioHandlers`, which enqueues `generateRequest` on Trigger.dev. That task moderates the prompt, charges the user, and fans out to `generateImage` or `generateVideo`, which calls your RunPod endpoint, watermarks and stores the result, and reports realtime progress back to the client via Trigger.dev's realtime hooks. `generateTitle` and `notifyGeneration` run alongside for title generation and completion hooks.

## Quickstart

The fastest way to see Studio running is the reference demo app — it has its own database, auth, and a working RunPod workflow already wired in.

```sh
bun install
```

Then follow [`apps/demo/README.md`](./apps/demo/README.md) for env vars, database migrations, the Trigger.dev dev server, and standing up the RunPod endpoint.

## Config surface

Everything is assembled into one `StudioConfig` object, typically in a `studio.config.ts`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `models` | `StudioModel[]` | yes | Your model catalog: ratios, resolutions, LoRAs, poses, and each model's ComfyUI workflow graph + node map |
| `video` | `VideoModelSpec` | no | Image-to-video model: workflow, allowed durations, fps |
| `runpod` | `RunpodConfig` | yes | RunPod API key + a `modelId → endpoint id` map |
| `storage` | `StorageAdapter` | yes | `upload`/`getBase64`/`publicUrl`/`keyFromPublicUrl`; use `r2Storage()` for any S3-compatible bucket |
| `auth` | `AuthAdapter` | yes | `getSession(req)` — wrap your own auth (better-auth, etc.) |
| `billing` | `BillingProvider` | yes | Cost lookup, balance, idempotent charge/refund; use `freeBilling` to disable billing |
| `moderation` | `ModerationProvider` | yes | Prompt moderation hook; use `allowAllModeration` to disable it |
| `prompts` | `{ enhance?, title? }` | no | Prompt-model specs for enhance/title generation; omit a key to turn that feature off |
| `promptRunner` | `PromptRunner` | no | The actual `enhance`/`title` call implementations |
| `watermark` | `WatermarkSpec` | no | SVG badge / text / diagonal watermark applied to outputs |
| `branding` | `BrandingSpec` | no | Site name, logo, footer links |
| `notify` | `(event) => Promise<void>` | no | Hook for generation lifecycle events (created/completed/failed/moderation-blocked) |
| `db` | `DbClient` | yes | Your Drizzle (`node-postgres`) instance |

Full field-level types live in [`packages/studio/src/config/types.ts`](./packages/studio/src/config/types.ts).

### Provider defaults

The package ships three defaults so you can get a working demo running before writing any provider code:

- **`freeBilling`** — cost is always 0, balance is unlimited, charge/refund are no-ops. Drops the coin UI entirely.
- **`allowAllModeration`** — every prompt is allowed, nothing is rewritten or blocked.
- **`r2Storage(env)`** — a `StorageAdapter` for any S3-compatible bucket (Cloudflare R2, etc.), given an account id, credentials, bucket, and public URL.

Everything else — auth, real billing, real moderation, RunPod workflows — is yours to implement against the interfaces above.

## Development

```sh
bun install
bun run typecheck
bun run check
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full contribution guide.

## License

[MIT](./LICENSE)
