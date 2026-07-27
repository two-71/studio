# Studio Demo

Reference Next.js app for `@two-71/studio` — the app behind
[studio.271.dev](https://studio.271.dev). It runs in **guest mode**: no
signup or login, every visitor gets a salted-IP guest identity
(`lib/guest.ts`) with a daily generation quota (`GUEST_DAILY_LIMIT`,
default 5 per UTC day), enforced through the package's billing seam so
over-quota requests get the native insufficient-funds error.

Two models are wired in `studio.config.ts`:

- **Krea 2** — text-to-image with two style LoRAs, preset depth-map pose
  control (`public/poses/`), and reference-image identity editing
  (`workflows/krea2.json`).
- **LTX 2.3** — image-to-video, 3s or 5s at 24 fps (`workflows/ltx2-3.json`).

An account-mode variant (better-auth email/password sessions) is preserved
as commented code — see the matching blocks in `studio.config.ts`,
`app/page.tsx`, `app/login/`, and `app/studio/*` if you want a
real-accounts example instead.

## Setup

1. **Env vars** — copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL` — a Postgres database.
   - `GUEST_DAILY_LIMIT` / `GUEST_SALT` — generations per IP per UTC day
     (default 5) and an optional salt for the IP hash.
   - `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` — `openssl rand -base64 32`
     for the secret. (Still required in guest mode — the guest identity is
     stored in better-auth's user table.)
   - `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` — from a Trigger.dev
     project (`bun x trigger.dev@latest init`, or reuse the ref in
     `trigger.config.ts`).
   - `RUNPOD_API_KEY` / `RUNPOD_ENDPOINT_ID` / `RUNPOD_VIDEO_ENDPOINT_ID` —
     RunPod serverless endpoints for the Krea 2 and LTX 2.3 graphs (see
     "RunPod endpoints" below).
   - `R2_*` — any S3-compatible bucket (Cloudflare R2, etc.) for generated
     images and videos.
   - `OPENAI_API_KEY` — optional, powers prompt enhancement and gallery
     titles (`gpt-5-mini`). Leave it unset and the enhance toggle stays
     hidden while titles fall back to a prompt excerpt.

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

   Visit `http://localhost:3000` — it redirects straight to `/studio`, no
   signup needed.

## RunPod endpoints

Both workflow files are ComfyUI graphs in **API format** (the
`/prompt`-style numbered-node shape the package's `runpod-client.ts` clones
and patches, not the graph editor's `nodes`/`links` export). Both need
**custom worker images** — they use nodes the prebuilt
`runpod/worker-comfyui` image doesn't ship (rgthree's Power Lora Loader and
Seed, the Krea 2 control/edit node pack, VHS video combine, KJNodes, and
friends) plus the Krea 2 / LTX 2.3 model weights on disk. See
[`docs/runpod-setup.md`](../../docs/runpod-setup.md) for how to build and
deploy a custom worker image, endpoint sizing, and the request/webhook
contract.

What `studio.config.ts` wires through each graph's `NodeMap`:

- **`krea2.json`** — prompt, seed, aspect ratio (`ResolutionSelector`),
  pose toggle + pose image, reference toggle + reference image (with an
  identity-edit LoRA that auto-enables alongside it), and two named LoRA
  slots on the power loader.
- **`ltx2-3.json`** — prompt, seed, source image, and a frame-count slider
  (fed through a +1 math node so the sampler sees the `8n+1` frame count
  LTX expects).

**Base64 output is required**: the worker can return base64 data or
S3-uploaded URLs depending on its return-mode config. The package's
post-process step only watermarks and re-uploads results to your own
storage when base64 `data` is present — set the worker to base64 output or
generations skip watermarking/republishing.

## What's here

- `studio.config.ts` — the `StudioConfig`: both models, RunPod endpoints,
  storage, the guest auth adapter, quota-as-billing (`guestBilling`),
  `allowAllModeration`.
- `lib/guest.ts` — salted-IP guest identity + daily quota constants.
- `app/api/studio/[...studio]/route.ts` — mounts `createStudioHandlers`.
- `app/api/auth/[...all]/route.ts` — better-auth's route handler (backs the
  guest user table; serves logins in account mode).
- `trigger/studio.ts` — re-exports `createStudioTasks(studioConfig)` so
  Trigger.dev's scanned `trigger/` dir picks up the five background tasks.
- `app/studio/page.tsx` + `app/studio/studio-client.tsx` —
  `deriveClientConfig` and the `<Studio />` client wrapper.
- `lib/db/schema.ts` — better-auth's tables + the package's `generation`
  table fragment (`createGenerationTable`).
- `workflows/` — the two ComfyUI graphs; `public/poses/` — preset depth
  maps for pose control.
