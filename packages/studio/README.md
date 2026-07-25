# @two-71/studio

An installable AI image/video generation surface for Next.js: a config-driven pipeline (RunPod/ComfyUI generation, Trigger.dev background tasks, Drizzle persistence) plus a `<Studio />` client shell. You supply the providers — auth, billing, moderation, storage — and the workflow JSON for your models; the package handles the rest.

See the [repo docs](https://github.com/two-71/studio) for the full setup guide (RunPod endpoint, Trigger.dev project, environment variables) and a working reference in `apps/demo`.

## Install

```sh
bun add @two-71/studio
```

Peer dependencies (install alongside): `next`, `react`, `react-dom`, `@trigger.dev/sdk`, `@trigger.dev/react-hooks`, `drizzle-orm`, `@tanstack/react-query`, `zod`.

The package ships TypeScript source, so your app must compile and scan it:

```ts
// next.config.ts
transpilePackages: ["@two-71/studio"],
```

```css
/* globals.css — Tailwind never scans node_modules on its own; without this
   the studio's utility classes (including responsive variants) are missing */
@source "../node_modules/@two-71/studio/src";
```

(Adjust the `@source` path relative to your CSS file's location.)

## Entry points

| Import | Contains |
| --- | --- |
| `@two-71/studio` | `StudioConfig` and related types, `deriveClientConfig`, `freeBilling`/`allowAllModeration` defaults |
| `@two-71/studio/server` | `createStudioHandlers` (the API route), `embedPngText`, `applyWatermarks` |
| `@two-71/studio/client` | `<Studio />`, `useStudioConfig`, `useStudioUser`, `copyImage`/`downloadImage`, `useMountEffect` |
| `@two-71/studio/tasks` | `createStudioTasks` (the five Trigger.dev tasks) and their payload schemas |
| `@two-71/studio/schema` | `createGenerationTable` (Drizzle table factory) |

## Wiring

All four pieces below are built from one `StudioConfig` object — assemble it once (e.g. in `studio.config.ts`) and reuse it everywhere. `StudioConfig` requires: `models`, `runpod`, `storage`, `auth`, `billing`, `moderation`, and `db` (your Drizzle instance); `video`, `prompts`, `promptRunner`, `watermark`, `branding`, and `notify` are optional.

**Database schema** — spread the generation table into your own schema:

```ts
// lib/db/schema.ts
import { createGenerationTable } from "@two-71/studio/schema";

export const generation = createGenerationTable(() => user.id);
```

**API routes** — mount the handlers behind a catch-all route:

```ts
// app/api/studio/[...studio]/route.ts
import { createStudioHandlers } from "@two-71/studio/server";
import { studioConfig } from "@/studio.config";

export const { GET, POST, DELETE } = createStudioHandlers(studioConfig);
```

**Background tasks** — re-export the tasks so Trigger.dev's directory scan picks up their ids:

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

**Client shell** — derive the client-safe config server-side and render `<Studio />` once; it owns the full UI (shell, gallery, generate controls) and every context descendants need. `onSignOut`/`imageLoader` are functions, so an async Server Component can't pass them directly — give `<Studio />` a thin `"use client"` wrapper for those:

```tsx
// app/studio/studio-client.tsx
"use client";
import type { StudioClientConfig } from "@two-71/studio";
import { Studio, type StudioUser } from "@two-71/studio/client";
import { signOut } from "@/lib/auth-client";

export function StudioClient({
  config,
  user,
}: {
  config: StudioClientConfig;
  user: StudioUser;
}) {
  return (
    <Studio
      config={config}
      loginUrl="/login"
      onSignOut={() => signOut()}
      user={user}
    />
  );
}
```

```tsx
// app/studio/page.tsx
import { deriveClientConfig } from "@two-71/studio";
import { studioConfig } from "@/studio.config";
import { StudioClient } from "./studio-client";

export default async function StudioPage() {
  const session = await getSession();
  const clientConfig = deriveClientConfig(studioConfig);

  return <StudioClient config={clientConfig} user={session.user} />;
}
```

`deriveClientConfig` strips workflow graphs and every provider/secret — never pass the full `StudioConfig` to the client. See `apps/demo/app/studio` for a working example.

## License

MIT
