# RunPod endpoint setup

Studio submits every generation to a [RunPod serverless](https://docs.runpod.io/serverless/overview) endpoint running [ComfyUI](https://github.com/comfyanonymous/ComfyUI). One endpoint = one `RunpodConfig.endpoints` entry, keyed by model id (or by the video model's `id`, if you configure `video`).

There are two ways to get a working endpoint: the prebuilt worker image (fastest, if your graph only needs ComfyUI's base node set) or a custom image (when you need extra nodes — what `apps/demo`'s two endpoints use). The prebuilt walkthrough below uses FLUX.1-schnell as its example model; substitute your own graph and model files.

## Prebuilt image path

The easy path is RunPod's own [`runpod/worker-comfyui`](https://github.com/runpod-workers/worker-comfyui) serverless image. It bundles ComfyUI plus the base node set, so it works for any graph that doesn't need custom nodes.

1. On [runpod.io](https://www.runpod.io) → **Serverless** → **New Endpoint**, pick **Custom Source** → **Docker Image**.
2. Use `runpod/worker-comfyui` with a tag that matches the model you're serving — check the image's tags on Docker Hub for the current one built with support for your model (the tag naming has changed over time, so don't hardcode a specific version in your own docs or scripts; read it off Docker Hub at deploy time).
3. Attach your graph's model files to the endpoint's ComfyUI instance — either bake them into a derived image's `models/` tree, or mount a [RunPod network volume](https://docs.runpod.io/serverless/storage/network-volumes) pre-populated with them. For FLUX.1-schnell, that's:

| File | ComfyUI folder |
| --- | --- |
| `flux1-schnell.safetensors` | `models/unet/` (or `models/diffusion_models/` on newer ComfyUI) |
| `t5xxl_fp8_e4m3fn.safetensors` | `models/clip/` |
| `clip_l.safetensors` | `models/clip/` |
| `ae.safetensors` | `models/vae/` |

All four ship under Apache 2.0/permissive licenses (`black-forest-labs/FLUX.1-schnell` and its standard CLIP/VAE components).

4. Set the worker's return mode to **base64**, not S3/URL upload — see [Base64 output is required](#base64-output-is-required).
5. Note the endpoint id RunPod assigns; that's the value that goes in `RunpodConfig.endpoints[modelId]` (`RUNPOD_ENDPOINT_ID` in the demo's env).

### Graph format and NodeMap

Every workflow file you hand to Studio must be a ComfyUI graph in **API format** — the `/prompt`-style numbered-node shape the package's `runpod-client.ts` clones and patches, not the graph editor's `nodes`/`links` export format (in the ComfyUI editor: **Export (API)**).

You tell Studio which graph inputs to patch through the model's `NodeMap`: at minimum `prompt` and `seed`, optionally `aspectRatio` (a node/input that turns a ratio label into a resolution — usually a custom node), LoRA slots, and pose/reference toggles + images. See `NodeMap` in `packages/studio/src/config/types.ts` for the full set, and `apps/demo/studio.config.ts` for two worked examples (`workflows/krea2.json` with LoRA/pose/reference wiring, `workflows/ltx2-3.json` for image-to-video).

### Base64 output is required

`runpod/worker-comfyui` can return either base64 image data or S3-uploaded URLs, depending on its return-mode config. The package's post-process step (`postProcessImages` in `packages/studio/src/tasks/post-process.ts`) only re-uploads an image to your configured `StorageAdapter` — applying the watermark and PNG metadata along the way — when the RunPod output has `data` (base64). An image returned with no `data` (a bare `url`) passes through unchanged instead. If your endpoint is set to upload mode, generations will complete but skip watermarking/republishing. Set the worker to base64 output.

## Custom image path

Build your own image when the graph needs nodes `runpod/worker-comfyui` doesn't ship (custom samplers, upscalers, ControlNet preprocessors, etc.). This is what both of `apps/demo`'s endpoints do — its Krea 2 graph uses rgthree's Power Lora Loader/Seed plus the Krea 2 control/edit node pack, and its LTX 2.3 graph uses VHS video combine, KJNodes, and friends:

1. Start `FROM runpod/worker-comfyui:<base-tag>` (or ComfyUI's own base image) and `RUN` your custom node installs (`comfy node install …` or manual `git clone` into `custom_nodes/`).
2. Bake in or volume-mount the same kind of model-file table as above, sized to whatever checkpoint/LoRAs/ControlNets your graph references.
3. Keep the handler contract identical to the prebuilt image: accept `{ input: { workflow, images? } }` on `POST /run`, return base64 image/video data in `output`. The package's client doesn't care how the endpoint is built, only that it speaks this shape (see below).
4. Deploy it as a **Custom Source → Docker Image** serverless endpoint the same way as the prebuilt path.

## Endpoint settings

RunPod serverless endpoints have a few knobs worth setting deliberately:

- **GPU class** — pick the smallest tier with enough VRAM to load every model file at once (checkpoint + text encoders + VAE, plus headroom for the sampler's activations). For FLUX.1-schnell's four files above, a 24 GB card is a safe starting point; profile actual usage and step down if you have headroom. Undersizing shows up as CUDA OOM errors in the worker logs, not a RunPod-level error.
- **Scale-to-zero / active workers** — set min workers to `0` so idle endpoints cost nothing, and set an idle timeout (RunPod's "Idle Timeout") long enough to absorb bursts of consecutive requests without a cold start between every one, but short enough that low traffic doesn't pay for an idle GPU. A cold start reloads the checkpoint from disk, which adds real latency to the first request after idle — factor that into the timeouts below.
- **Execution timeout** — RunPod's own per-job timeout should exceed your real generation time plus a cold-start margin. The package layers its own ceiling on top regardless: `createGenerateImageTask` waits up to **10 minutes** for the webhook (`wait.createToken({ timeout: "10m" })` in `generate-image.ts`) and `createGenerateVideoTask` waits up to **20 minutes** (`generate-video.ts`) before giving up, failing the row, and refunding. Set RunPod's execution timeout comfortably under those so a stuck job fails on RunPod's side with a real error instead of silently running past the point the package has already given up and refunded.

## How the package talks to the endpoint

`packages/studio/src/tasks/runpod-client.ts` is the only code that calls RunPod. Two entry points, both used by the task layer (`generate-image.ts` / `generate-video.ts`), never called directly by route handlers:

- **`submitRun(runpod, modelId, workflow, input, webhookUrl)`** — image generation. Clones `workflow.graph`, writes `prompt`/`seed`/`aspectRatio`/LoRA-slot/pose-and-reference-toggle values into the nodes named in `workflow.nodes` (see `NodeMap`), then `POST`s to `https://api.runpod.ai/v2/<endpointId>/run` with:
  ```json
  { "input": { "images": [{ "name": "pose.png", "image": "<base64>" }], "workflow": { "...": "patched graph" } }, "webhook": "<token url>" }
  ```
  `images` is only included when a pose or reference image is present; `workflow` is always the full patched graph.
- **`submitVideoRun(runpod, modelId, workflow, input, webhookUrl)`** — image-to-video. Same envelope, but `images` always carries the source frame under the filename `source.png`, and the workflow's `sourceImage`/`framesNode` targets are patched with that filename and the frame count (`fps × durationSeconds`).
- **`getRunStatus(runpod, modelId, id)`** — `GET /v2/<endpointId>/status/<jobId>`, returned to the caller as-is (untyped `unknown` — each task casts it to its own status shape locally).

**Output expectations**: the task layer reads `status.status` (`IN_QUEUE` / `IN_PROGRESS` / `COMPLETED` / `FAILED` / `CANCELLED`) and, on `COMPLETED`, `status.output.images[]` (image path) or `status.output.videos[]` (video path), each shaped `{ data?, filename?, type?, url? }`. Only `data` (base64) is consumed — see [Base64 output is required](#base64-output-is-required).

**Polling**: every job is submitted with a Trigger.dev wait token as its `webhook` URL (`wait.createToken()` → `token.url`). The task then `wait.forToken(token)`s until either the webhook fires or the timeout above elapses. Either way, the webhook body itself is never trusted — the task always re-reads the authoritative status via `getRunStatus` afterward. If the webhook fired but that immediate re-read is still non-terminal (RunPod's status read can lag its own webhook by a moment), `createRunpodStatusHelpers` (`runpod-status.ts`) re-polls up to 5 times, 6 seconds apart, before giving up. If the job is still non-terminal after that — or the wait itself timed out — the row is failed and the charge refunded rather than polled indefinitely.

## Troubleshooting

- **`no RunPod endpoint for model "<id>"`** — `RunpodConfig.endpoints` has no entry for that model id (or for your `VideoModelSpec.id`). Check `studio.config.ts`.
- **Job completes but the image never appears / isn't watermarked** — the endpoint is returning URLs instead of base64. Fix the worker's return-mode setting (see [Base64 output is required](#base64-output-is-required)).
- **`runpod run failed: 4xx …`** — usually a bad `RUNPOD_API_KEY` or an endpoint id from the wrong RunPod account/team.
- **Generation always ends in `timed_out`** — either the endpoint is too slow for the token timeout (10m image / 20m video), or workers are scaled to zero with an idle timeout so short the first request never finishes queuing before RunPod's own execution timeout hits. Check the RunPod dashboard's request logs for the actual job, not just the Studio row.
- **ComfyUI validation error mentioning a missing node or model file** — the endpoint's ComfyUI instance is missing a model file your graph references, or a custom node it needs (see the custom image path).
- **CUDA out of memory** — GPU tier too small for the loaded models; see [Endpoint settings](#endpoint-settings).
