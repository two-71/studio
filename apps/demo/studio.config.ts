// Demo StudioConfig (spec §3.1, §9.2, §10 B1.2): free billing, open
// moderation, one SFW FLUX.1-schnell image model, no loras/poses/reference,
// no prompts (enhance/title off — both fall back to their documented
// defaults per spec §4.4), no watermark spec, no notify hook.
//
// No "server-only" import guard, matching the package's own handlers.ts: the
// same config module is imported by both Next route handlers and
// trigger/studio.ts, and Trigger.dev's esbuild bundler doesn't set the
// "react-server" condition server-only relies on.

import {
  type AuthAdapter,
  allowAllModeration,
  type BillingProvider,
  type DbClient,
  r2Storage,
  type StudioConfig,
  type StudioModel,
} from "@two-71/studio";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation } from "@/lib/db/schema";
import {
  ensureGuestUser,
  GUEST_DAILY_LIMIT,
  guestFromHeaders,
} from "@/lib/guest";
import fluxSchnellGraph from "./workflows/flux-schnell.json";

// Account mode (uncomment to restore better-auth logins — see the matching
// commented blocks in app/studio/page.tsx and app/studio/studio-client.tsx;
// also swap `billing` back to the package's `freeBilling`):
// import { freeBilling } from "@two-71/studio";
// import { auth } from "@/lib/auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Account mode: AuthAdapter wraps better-auth's session lookup (spec §4.5 —
// the package never bundles better-auth itself). `req.headers` carries the
// session cookie the same way a Server Component's `headers()` would.
// const authAdapter: AuthAdapter = {
//   async getSession(req) {
//     const session = await auth.api.getSession({ headers: req.headers });
//     return session ? { userId: session.user.id } : null;
//   },
// };

// Guest mode: no session — every request resolves to the salted-IP guest
// identity (lib/guest.ts), so the studio is usable with zero signup.
const guestAuthAdapter: AuthAdapter = {
  async getSession(req) {
    const guest = guestFromHeaders(req.headers);
    await ensureGuestUser(guest);
    return { userId: guest.id };
  },
};

// Guest rate limit, expressed as billing (1 coin per generation, balance =
// what's left of today's quota): staying on the package's billing seam means
// over-quota requests get the native insufficient-funds error and the header
// pill shows generations remaining — no custom middleware. `charge` is a
// no-op because the generation rows themselves are the ledger; that also
// means failed generations count against the quota, which is fine here.
const guestBilling: BillingProvider = {
  costFor: () => 1,
  videoCost: () => 1,
  async getBalance(userId) {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [row] = await db
      .select({ used: count() })
      .from(generation)
      .where(
        and(
          eq(generation.userId, userId),
          gte(generation.createdAt, startOfToday)
        )
      );
    return Math.max(0, GUEST_DAILY_LIMIT - (row?.used ?? 0));
  },
  charge: () => Promise.resolve("ok" as const),
  refund: () => Promise.resolve(),
  coinName: "generations",
};

// See README.md's "RunPod endpoint setup" for how this graph was authored
// and how it maps to `runpod/worker-comfyui`. Single ratio only: the
// vanilla worker image ships no custom resolution-selector node, so
// `EmptySD3LatentImage` is fixed at 1024x1024 and `NodeMap.aspectRatio` is
// left unmapped.
const fluxSchnell: StudioModel = {
  id: "flux-schnell",
  name: "FLUX.1 Schnell",
  description: "Fast open-weight text-to-image model (Apache 2.0).",
  ratios: ["1:1"],
  resolutions: ["Standard"],
  supportsReference: false,
  workflow: {
    graph: fluxSchnellGraph,
    nodes: {
      prompt: { node: "4", input: "text" },
      seed: { node: "7", input: "seed" },
    },
  },
};

export const studioConfig: StudioConfig = {
  models: [fluxSchnell],
  runpod: {
    apiKey: requireEnv("RUNPOD_API_KEY"),
    endpoints: {
      "flux-schnell": requireEnv("RUNPOD_ENDPOINT_ID"),
    },
  },
  storage: r2Storage({
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
    publicUrl: requireEnv("R2_PUBLIC_URL"),
  }),
  auth: guestAuthAdapter, // account mode: authAdapter
  billing: guestBilling, // account mode: freeBilling
  moderation: allowAllModeration,
  branding: {
    siteName: "2.71",
  },
  // The package's DbClient type is intentionally unparameterized (spec §7 —
  // see config/types.ts's DbClient comment); a host's own (larger-schema)
  // instance is narrowed down through `unknown` rather than `any`.
  db: db as unknown as DbClient,
};
