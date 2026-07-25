# Trigger.dev setup

Studio's generation pipeline runs as [Trigger.dev](https://trigger.dev) background tasks: a client `POST` to `/api/studio/generate/run` triggers `generate-request`, which fans out to `generate-image` (or `generate-video`), which itself triggers `notify-generation` and `generate-title` as sidecars. The package exports **task factories**, not tasks — your host app wires them into its own `trigger/` directory so Trigger.dev's task registry sees them at project scope.

## 1. Create a Trigger.dev project

If you don't already have one:

```sh
bun x trigger.dev@latest init
```

This creates a Trigger.dev project and writes a `trigger.config.ts`. Alternatively, create a project from the [Trigger.dev dashboard](https://cloud.trigger.dev) and copy its ref manually.

You need two values out of this:

- **Project ref** (`proj_...`) — goes in `trigger.config.ts`.
- **Secret key** (`tr_dev_...` / `tr_prod_...`, one per environment) — from the project's **API Keys** page, goes in your env as `TRIGGER_SECRET_KEY`.

## 2. Env vars

```sh
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=
```

`TRIGGER_PROJECT_REF` isn't a Trigger.dev SDK convention — it's just how `apps/demo/trigger.config.ts` reads the ref from the environment instead of hardcoding it, so the same config file works across dev/CI/deploy without editing.

## 3. `trigger.config.ts`

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./trigger"],
  maxDuration: 900,
  build: {
    // Native module the package's watermark step depends on; must load from
    // node_modules at runtime, not get bundled by Trigger.dev's esbuild step.
    external: ["@resvg/resvg-js"],
  },
});
```

- `dirs: ["./trigger"]` is the directory Trigger.dev scans for task files — this is what makes the thin re-export file below get picked up.
- `maxDuration: 900` caps actual task *compute* time (15 minutes). It doesn't cap how long a task can be suspended waiting on a RunPod webhook — `wait.forToken()` suspends the run for free, so the 10-minute (image) / 20-minute (video) RunPod wait windows described in [`runpod-setup.md`](./runpod-setup.md) aren't bounded by this number.
- `build.external: ["@resvg/resvg-js"]` is only required if your `StudioConfig.watermark` is set — the watermark step uses that native module internally, and Trigger.dev's bundler needs to be told not to bundle it. If you never configure `watermark`, you can drop this, but there's no harm leaving it in.

## 4. `trigger/studio.ts` — the factory pattern

The package exports `createStudioTasks(config)`, which builds all five tasks closed over your `StudioConfig`. Your host app's only job is to call it once and re-export the result so Trigger.dev's directory scan finds it:

```ts
// trigger/studio.ts
import { createStudioTasks } from "@two-71/studio/tasks";
import { studioConfig } from "@/studio.config";

export const {
  generateRequest,
  generateImage,
  generateVideo,
  generateTitle,
  notifyGeneration,
} = createStudioTasks(studioConfig);
```

That's the entire file — no other logic belongs here. The five task ids Trigger.dev registers are fixed by the package (`generate-request`, `generate-image`, `generate-video`, `generate-title`, `notify-generation`); route handlers trigger them by id string via `tasks.trigger(...)`, so there's no import cycle between your route handlers and this file.

If you configure `watermark` on your `StudioConfig`, also add `@resvg/resvg-js` to `serverExternalPackages` in `next.config.ts` (see the realtime section below) — it's a native module both Trigger.dev's bundler and Next's server bundler need to leave alone.

## 5. Dev vs. deploy

**Local development** — run the Trigger.dev dev server alongside your Next.js dev server (in a separate terminal); it's what actually executes the five tasks when you generate locally:

```sh
bun x trigger.dev@latest dev
```

**Deploying** — ship the current task versions to a Trigger.dev environment:

```sh
bun x trigger.dev@latest deploy
```

By default this deploys to `prod`. Pass `--env staging` or `--env preview` to target other environments (`preview` auto-detects the branch name from git; use `--branch <name>` to override it). Whichever environment you deploy to, the app's `TRIGGER_SECRET_KEY` needs to be the secret key **for that same environment** — a prod secret key won't see tasks deployed to staging, and vice versa.

Deploy your Trigger.dev tasks *before* (or as part of the same pipeline as) deploying the Next.js app that triggers them, so there's never a window where the app can call a task id that doesn't exist yet in that environment.

## 6. Realtime rewrite

If you use `@trigger.dev/react-hooks` to subscribe to run status from the browser (rather than polling your own API), the browser needs to reach Trigger.dev's realtime endpoint without talking to `api.trigger.dev` directly. Add this rewrite to `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@two-71/studio"],
  serverExternalPackages: ["@resvg/resvg-js"],
  async rewrites() {
    return [
      {
        source: "/api/realtime/:path*",
        destination: "https://api.trigger.dev/realtime/:path*",
      },
    ];
  },
};

export default nextConfig;
```

`transpilePackages: ["@two-71/studio"]` is required regardless of realtime — the package ships TypeScript source, not a prebuilt `dist`, so Next needs to transpile it like the rest of your app. `serverExternalPackages: ["@resvg/resvg-js"]` is only needed if you configure `watermark`, for the same native-module reason as the Trigger.dev `build.external` entry above.
