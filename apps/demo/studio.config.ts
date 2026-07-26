// Demo StudioConfig (spec §3.1, §9.2, §10 B1.2): guest billing, open
// moderation, one SFW Krea 2 image model (with style loras + identity-edit
// reference support) and an LTX 2.3 image-to-video model, no prompts
// (enhance/title off — both fall back to their documented defaults per
// spec §4.4), no watermark spec, no notify hook.
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
  type VideoModelSpec,
} from "@two-71/studio";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { generation } from "@/lib/db/schema";
import {
  ensureGuestUser,
  GUEST_DAILY_LIMIT,
  guestFromHeaders,
} from "@/lib/guest";
import krea2Graph from "./workflows/krea2.json";
import ltx23Graph from "./workflows/ltx2-3.json";

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

// Official Krea 2 (turbo fp8) text-to-image with two SFW style loras,
// identity-edit reference support, and depth-map pose control (preset depth
// maps in public/poses). See the endpoint's Dockerfile for the exact model
// files.
const krea2: StudioModel = {
  id: "krea-2",
  name: "Krea 2",
  description: "Latest image generation model.",
  ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
  resolutions: ["Standard"],
  supportsReference: true,
  poses: [
    {
      id: "crossed-legs-on-floor",
      name: "Crossed Legs on Floor",
      controlImageUrl: "/poses/crossed-legs-on-floor.png",
    },
    {
      id: "sitting-on-stairs",
      name: "Sitting on Stairs",
      controlImageUrl: "/poses/sitting-on-stairs.png",
    },
  ],
  loras: [
    {
      id: "ultrareal",
      name: "UltraReal",
      triggerWords: "photo, amateur photography",
      slotKey: "lora_2",
    },
    {
      id: "phone-photography",
      name: "Phone Photography",
      triggerWords: "phone photo",
      slotKey: "lora_3",
    },
  ],
  workflow: {
    graph: krea2Graph,
    nodes: {
      prompt: { node: "4", input: "value" },
      seed: { node: "5", input: "seed" },
      aspectRatio: { node: "40", input: "aspect_ratio" },
      poseToggle: { node: "1", input: "value" },
      poseImage: { node: "11", input: "image" },
      referenceToggle: { node: "2", input: "value" },
      referenceImage: { node: "19", input: "image" },
      // Identity-edit lora rides in the same power-loader; enabled only
      // when a reference image is attached.
      referenceLoraToggle: { node: "9", input: "lora_1" },
      loras: {
        ultrareal: { node: "9", input: "lora_2" },
        "phone-photography": { node: "9", input: "lora_3" },
      },
    },
  },
};

// LTX 2.3 (distilled, split files) image-to-video, single pass, silent.
// The mxSlider frame-count node feeds a +1 math node so the sampler sees
// the 8n+1 frame count LTX expects.
const ltx23: VideoModelSpec = {
  id: "ltx-2-3",
  durations: [3, 5],
  fps: 24,
  workflow: {
    graph: ltx23Graph,
    nodes: {
      prompt: { node: "536", input: "text" },
      seed: { node: "524", input: "seed" },
      sourceImage: { node: "837", input: "image" },
      framesNode: { node: "796", input: "Xi" },
    },
  },
};

export const studioConfig: StudioConfig = {
  models: [krea2],
  video: ltx23,
  runpod: {
    apiKey: requireEnv("RUNPOD_API_KEY"),
    endpoints: {
      "krea-2": requireEnv("RUNPOD_ENDPOINT_ID"),
      "ltx-2-3": requireEnv("RUNPOD_VIDEO_ENDPOINT_ID"),
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
