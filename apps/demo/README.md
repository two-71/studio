# Studio Demo

Minimal reference Next.js app for `@two-71/studio`: free billing
(`freeBilling`), open moderation (`allowAllModeration`), one SFW FLUX.1
Schnell image model, minimal email/password auth via better-auth. See
`studio.config.ts` for the full wiring and "RunPod endpoint setup" below for
how the FLUX.1 Schnell RunPod workflow was authored.

## Setup

1. **Env vars** — copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL` — a Postgres database.
   - `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` — `openssl rand -base64 32` for the secret.
   - `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` — from a Trigger.dev project (`npx trigger.dev@latest init`, or reuse `TRIGGER_PROJECT_REF` in `trigger.config.ts`).
   - `RUNPOD_API_KEY` / `RUNPOD_ENDPOINT_ID` — a RunPod serverless endpoint running the FLUX.1 Schnell ComfyUI graph in `workflows/flux-schnell.json` (see "RunPod endpoint setup" below for the exact setup — the easy path is the prebuilt `runpod/worker-comfyui` image).
   - `R2_*` — any S3-compatible bucket (Cloudflare R2, etc.) for generated images.

2. **Database migrations**

   ```sh
   bun x drizzle-kit generate
   bun x drizzle-kit migrate
   ```

3. **Trigger.dev dev server** (runs the generation pipeline in the background)

   ```sh
   bun x trigger.dev@latest dev
   ```

4. **Run the app**

   ```sh
   bun run dev
   ```

   Visit `http://localhost:3000`, sign up, and generate an image from
   `/studio`.

## RunPod endpoint setup

`workflows/flux-schnell.json` is a standard FLUX.1-schnell ComfyUI graph in
**API format** (the `/prompt`-style numbered-node shape `runpod-client.ts`
clones and patches, not the UI's `nodes`/`links` export format):
`UNETLoader(flux1-schnell.safetensors)` → `DualCLIPLoader(t5xxl_fp8_e4m3fn.safetensors, clip_l.safetensors, type=flux)` →
`CLIPTextEncode` (positive) → `ConditioningZeroOut` (negative, schnell needs
no real negative/CFG since cfg=1.0) → `EmptySD3LatentImage(1024×1024,
batch=1)` → `KSampler(steps=4, cfg=1.0, sampler=euler, scheduler=simple)` →
`VAEDecode` → `SaveImage`, with `VAELoader(ae.safetensors)` feeding
`VAEDecode`.

Only `prompt` (node `4`, input `text`) and `seed` (node `7`, input `seed`)
are wired through `NodeMap` — no `aspectRatio` target, because that field
expects a single node/input that turns a ratio label directly into a
resolution, which requires a custom node the vanilla `runpod/worker-comfyui`
image doesn't ship. Adding one just for the demo would contradict the
"prebuilt worker image is the easy path" goal, so this graph fixes
`EmptySD3LatentImage` to 1024×1024 instead — which is why `fluxSchnell.ratios`
in `studio.config.ts` is `["1:1"]` only.

**Deploying the endpoint**: the easy path is the prebuilt
`runpod/worker-comfyui` serverless image (flux1-schnell variant/tag) — it
already bundles ComfyUI plus the base node set this graph uses, no custom
nodes needed. The endpoint's ComfyUI instance needs these model files on
disk:

| File | ComfyUI folder |
| --- | --- |
| `flux1-schnell.safetensors` | `models/unet/` (or `models/diffusion_models/` on newer ComfyUI) |
| `t5xxl_fp8_e4m3fn.safetensors` | `models/clip/` |
| `clip_l.safetensors` | `models/clip/` |
| `ae.safetensors` | `models/vae/` |

All four ship under Apache 2.0/permissive weight licenses
(`black-forest-labs/FLUX.1-schnell` and its standard CLIP/VAE components) —
no gated-license friction for an open repo.

**Base64 output is required**: `runpod/worker-comfyui` can return either
base64 image data or S3-uploaded URLs depending on its return-mode config.
The package's `post-process.ts` only re-uploads an image to the package's
own storage when `img.data` (base64) is present — an image returned with no
`data` passes through unchanged instead of landing in R2. Set the worker's
return mode to base64, not S3/URL upload, or generations won't get
watermarked/republished the way this demo expects.

## What's here

- `studio.config.ts` — the `StudioConfig` (spec §4): models, RunPod endpoint,
  storage, auth adapter, `freeBilling`, `allowAllModeration`.
- `app/api/studio/[...studio]/route.ts` — mounts `createStudioHandlers`.
- `app/api/auth/[...all]/route.ts` — better-auth's route handler.
- `trigger/studio.ts` — re-exports `createStudioTasks(studioConfig)` so
  Trigger.dev's scanned `trigger/` dir picks up the five background tasks.
- `app/studio/page.tsx` + `app/studio/studio-client.tsx` — session guard,
  `deriveClientConfig`, and the `<Studio />` client wrapper. The package's
  `./client` entry owns the full shell/gallery/controls tree, so this app
  only supplies the `onSignOut`/`loginUrl` function props that can't cross
  the server/client boundary (see `studio-client.tsx`).
- `lib/db/schema.ts` — better-auth's tables + the package's `generation`
  table fragment (`createGenerationTable`).
