# Deploying to Vercel

This walks through deploying `apps/demo` (or any host app built the same way — installing `@two-71/studio` and following its `studio.config.ts` shape) to [Vercel](https://vercel.com).

## 1. Env var matrix

Set these in the Vercel project's **Settings → Environment Variables** (mirrors `apps/demo/.env.example`):

| Var | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Drizzle + better-auth). See [Postgres options](#2-postgres) below. |
| `BETTER_AUTH_SECRET` | better-auth session secret — generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Your app's public URL (e.g. `https://your-app.vercel.app`); `http://localhost:3000` locally. |
| `TRIGGER_SECRET_KEY` | Trigger.dev secret key **for the environment you're deploying to** — a prod deploy needs the prod key, not the dev one. |
| `TRIGGER_PROJECT_REF` | Your Trigger.dev project ref (`proj_...`). |
| `RUNPOD_API_KEY` | RunPod API key. |
| `RUNPOD_ENDPOINT_ID` | The RunPod serverless endpoint id running your ComfyUI graph — see [`runpod-setup.md`](./runpod-setup.md). |
| `R2_ACCOUNT_ID` | Cloudflare account id (or your S3-compatible provider's equivalent). |
| `R2_ACCESS_KEY_ID` | Bucket access key id. |
| `R2_SECRET_ACCESS_KEY` | Bucket secret access key. |
| `R2_BUCKET` | Bucket name. |
| `R2_PUBLIC_URL` | Public base URL generated image/video URLs are served from. |

Set each var for every Vercel environment you use (Production / Preview / Development) with the values appropriate to that environment — in particular, `TRIGGER_SECRET_KEY` and `RUNPOD_ENDPOINT_ID` are very likely to differ between Preview and Production.

## 2. Postgres

`apps/demo` connects with `drizzle-orm/node-postgres` over a plain `pg.Pool` (`lib/db/index.ts`) — any standard Postgres connection string works: [Neon](https://neon.tech), [Supabase](https://supabase.com), [Vercel Postgres](https://vercel.com/storage/postgres), or a self-hosted instance.

One thing to plan for: Vercel Functions are short-lived and can run many concurrent invocations, and a `pg.Pool` opens real TCP connections per instance — on serverless this can exhaust your database's connection limit under load. Use your provider's **pooled** connection string if it offers one (e.g. Neon's pooled endpoint, or a PgBouncer in front of a self-hosted instance) rather than a direct connection string.

Run migrations against whichever database `DATABASE_URL` points to, before or as part of your deploy:

```sh
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

## 3. R2 / S3 bucket

Generated images and videos are uploaded through the `StorageAdapter` — `r2Storage()` (`@two-71/studio`) works against Cloudflare R2 or any other S3-compatible endpoint.

For Cloudflare R2:

1. Create a bucket in the Cloudflare dashboard.
2. Create an **R2 API token** scoped to that bucket (Object Read & Write) — its access key id/secret go in `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`.
3. Enable public access on the bucket (a custom domain, or R2's `r2.dev` public bucket URL) and set that as `R2_PUBLIC_URL` — this is the base URL generated media is served from and must be publicly reachable by anyone viewing a generation.
4. `R2_ACCOUNT_ID` is your Cloudflare account id, visible in the dashboard URL or the R2 overview page.

Any other S3-compatible provider works the same way: bucket, access key pair with read/write, and a public base URL.

## 4. Deploy the Trigger.dev tasks

The generation pipeline runs as Trigger.dev tasks, deployed independently of the Next.js app (see [`trigger-setup.md`](./trigger-setup.md)). Deploy the tasks before or as part of the same pipeline as the app deploy, targeting the same environment the app's `TRIGGER_SECRET_KEY` points at:

```sh
bun x trigger.dev@latest deploy
```

Add `--env staging` (or `--env preview`, which auto-detects the branch) if you're deploying a non-production Vercel environment. If you wire this into CI (e.g. GitHub Actions), Trigger.dev's deploy step needs a `TRIGGER_ACCESS_TOKEN` (a personal access token, distinct from `TRIGGER_SECRET_KEY`) rather than the runtime secret key.

## 5. Realtime rewrite

If your host app uses `@trigger.dev/react-hooks` to subscribe to generation status from the browser, add the realtime proxy rewrite to `next.config.ts` before deploying — without it, the browser has no path to Trigger.dev's realtime endpoint:

```ts
async rewrites() {
  return [
    {
      source: "/api/realtime/:path*",
      destination: "https://api.trigger.dev/realtime/:path*",
    },
  ];
},
```

See [`trigger-setup.md`](./trigger-setup.md#6-realtime-rewrite) for the full `next.config.ts` this belongs in, including the `transpilePackages`/`serverExternalPackages` entries the package itself needs.

## 6. Deploy order

Putting it together, a full deploy looks like:

1. Apply Postgres migrations (`bun x drizzle-kit migrate`) against the target database.
2. Deploy Trigger.dev tasks for the target environment (`bun x trigger.dev@latest deploy [--env ...]`).
3. Deploy the Next.js app to Vercel, with all the env vars above set for that environment.

Steps 1–2 should land before step 3 goes live, so the app is never pointed at a database schema or task version that isn't there yet.
