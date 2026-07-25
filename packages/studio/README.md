# @two-71/studio

An installable AI image/video generation surface for Next.js: a config-driven pipeline (RunPod/ComfyUI generation, Trigger.dev background tasks, Drizzle persistence) plus a `<Studio />` client shell. You supply the providers — auth, billing, moderation, storage — and the workflow JSON for your models; the package handles the rest.

See the [repo docs](https://github.com/two-71/studio) for the full setup guide (RunPod endpoint, Trigger.dev project, environment variables) and a working reference in `apps/demo`.

## Install

```sh
bun add @two-71/studio
```

Peer dependencies (install alongside): `next`, `react`, `react-dom`, `@trigger.dev/sdk`, `@trigger.dev/react-hooks`, `drizzle-orm`, `@tanstack/react-query`, `zod`.

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

**Client shell** — derive the client-safe config server-side and render `<Studio />` once, above your own UI:

```tsx
// app/studio/page.tsx
import { deriveClientConfig } from "@two-71/studio";
import { Studio } from "@two-71/studio/client";
import { studioConfig } from "@/studio.config";

export default async function StudioPage() {
  const session = await getSession();
  const clientConfig = deriveClientConfig(studioConfig);

  return (
    <Studio config={clientConfig} user={session.user}>
      <StudioContent />
    </Studio>
  );
}
```

`deriveClientConfig` strips workflow graphs and every provider/secret — never pass the full `StudioConfig` to the client. Inside `<Studio />`, descendants call `useStudioConfig()` / `useStudioUser()` and hit the mounted routes directly (`/api/studio/generate/run`, `/api/studio/generate/video`, `/api/studio/generations`, `/api/studio/balance`) — see `apps/demo/components/studio-content.tsx` for a minimal example.

## License

MIT
