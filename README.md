<!-- screenshot -->

<h3 align="center">Studio</h3>

<p align="center">
    Open-source AI image &amp; video generation studio for Next.js.
    <br />
    <a href="https://studio.271.dev"><strong>Try the demo »</strong></a>
    <br />
    <br />
    <a href="#introduction"><strong>Introduction</strong></a> ·
    <a href="#features"><strong>Features</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#self-hosting"><strong>Self-Hosting</strong></a> ·
    <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@two-71/studio">
    <img src="https://img.shields.io/npm/v/%40two-71%2Fstudio?logo=npm&color=cb3837&logoColor=fff" alt="npm version" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" />
  </a>
</p>

<br/>

## Introduction

Studio is a config-driven, self-hostable AI generation surface you install into your own Next.js app. Bring a ComfyUI workflow running on RunPod serverless plus your own auth, billing, moderation, and storage providers — Studio handles the rest: the generation pipeline (via Trigger.dev), realtime progress, and the gallery UI.

It's a library, not a hosted product: `bun add @two-71/studio`, wire it up with a single `StudioConfig` object, and mount `<Studio />`. See it live at [studio.271.dev](https://studio.271.dev).

## Features

- **Multi-model catalog** — text-to-image across any number of models, each with its own ComfyUI workflow, aspect ratios, and resolutions
- **Image-to-video** — animate any generated image with a video workflow
- **ComfyUI on RunPod serverless** — bring your exact workflow graph; Studio maps prompts, seeds, and controls onto its nodes
- **Realtime progress** — live pipeline steps streamed to the client via Trigger.dev realtime
- **Controls** — LoRAs, pose control images, and reference-image identity editing
- **Gallery** — lightbox, bulk select/delete, copy/download, optimistic cards
- **Prompt enhancement & titles** — optional LLM-backed prompt rewrite and result naming
- **Watermarking** — SVG badge, text, or diagonal watermark baked into outputs
- **Pluggable providers** — auth, billing (coins/credits), moderation, and storage are interfaces; sensible free/open defaults included
- **Theming** — light/dark/system with host-controlled branding

## Tech Stack

- [Next.js](https://nextjs.org/) – framework
- [TypeScript](https://www.typescriptlang.org/) – language
- [Tailwind](https://tailwindcss.com/) – CSS
- [Trigger.dev](https://trigger.dev/) – background tasks + realtime
- [RunPod](https://www.runpod.io/) – serverless ComfyUI inference
- [Drizzle](https://orm.drizzle.team/) – ORM
- [TanStack Query](https://tanstack.com/query) – data fetching
- [Zustand](https://zustand.docs.pmnd.rs/) – state
- [shadcn/ui](https://ui.shadcn.com/) – components
- [Cloudflare R2](https://developers.cloudflare.com/r2/) – storage (any S3-compatible bucket)

## Self-Hosting

Everything runs on your own accounts — your Next.js host, your RunPod endpoints, your Trigger.dev project, your bucket, your database.

- [`packages/studio/README.md`](./packages/studio/README.md) — install + full wiring guide for the `StudioConfig` object
- [`docs/runpod-setup.md`](./docs/runpod-setup.md) — stand up a serverless ComfyUI endpoint
- [`docs/trigger-setup.md`](./docs/trigger-setup.md) — background tasks + realtime
- [`docs/providers.md`](./docs/providers.md) — auth, billing, moderation, storage interfaces
- [`docs/deploy-vercel.md`](./docs/deploy-vercel.md) — production deployment

## What's in this repo

- [`packages/studio`](./packages/studio) — the `@two-71/studio` library
- [`apps/demo`](./apps/demo) — the reference app behind [studio.271.dev](https://studio.271.dev): guest mode (no signup, daily IP-based quota), a Krea 2 image model with LoRAs/pose/reference controls, and an LTX image-to-video model

## Quickstart

The fastest way to see Studio running locally is the demo app:

```sh
bun install
```

Then follow [`apps/demo/README.md`](./apps/demo/README.md) for env vars, database migrations, the Trigger.dev dev server, and standing up the RunPod endpoint.

## Contributing

- [Open an issue](https://github.com/two-71/studio/issues) if you believe you've encountered a bug.
- Make a [pull request](https://github.com/two-71/studio/pulls) to add new features, make quality-of-life improvements, or fix bugs.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full guide.

### Recommended Versions

| Package | Version |
| ------- | ------- |
| bun     | 1.2+    |
| node    | 20+     |

## License

[MIT](./LICENSE)
