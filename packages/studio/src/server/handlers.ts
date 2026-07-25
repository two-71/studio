// createStudioHandlers (spec §5): the four route bodies from
// app/api/{generate/run,generate/video,generations,balance}/route.ts,
// rewritten as closures over `config` and mounted by the host behind one
// catch-all (app/api/studio/[...studio]/route.ts). Response shapes are
// byte-identical to the routes they replace.
//
// No "server-only" import guard here (unlike the rest of this file's peers,
// which is what spec/task language would otherwise suggest): this package's
// "./server" entry point is also reached by trigger tasks today (the host
// app's post-process module imports applyWatermarks/embedPngText from it),
// and Trigger.dev's esbuild bundler doesn't set the "react-server" condition
// server-only's guard relies on — it resolves to the unconditionally-throwing
// branch there and would crash task bundling. studio.config.ts documents the
// same tradeoff for the same reason.

import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { RATIO_KEYS, type StudioConfig } from "../config/types";
import {
  type CreateGenerationInput,
  createGenerationQueries,
  type GenerationQueries,
  pendingRealtimeInfo,
} from "./generations";

// Generic bookkeeping constants, not model/workflow data — kept as package
// literals rather than a config surface (not listed in spec §4).
const MAX_SEED = 1_125_899_906_842_624;
const MAX_CONTROL_IMAGE_BYTES = 7 * 1024 * 1024;
// The shared byte cap compared against base64 length (4 chars per 3 bytes).
const MAX_CONTROL_IMAGE_BASE64_CHARS =
  Math.ceil(MAX_CONTROL_IMAGE_BYTES / 3) * 4;
const RESOLUTION_TIERS = ["Standard", "High", "Ultra"] as const;

export interface StudioRouteHandlers {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
  DELETE: (req: Request) => Promise<Response>;
}

function routePath(req: Request): string {
  const { pathname } = new URL(req.url);
  const marker = "/api/studio/";
  const idx = pathname.indexOf(marker);
  return idx === -1 ? pathname : pathname.slice(idx + marker.length);
}

// --- POST generate/run -------------------------------------------------------

function buildGenerateRunSchema(config: StudioConfig) {
  const modelIds = new Set(config.models.map((model) => model.id));
  // posePreset stores the pose's controlImageUrl (today a /public path,
  // spec §13 flag — the client sends the same value it renders as the
  // thumbnail/control image, not the PoseSpec id).
  const posePaths = new Set(
    config.models
      .flatMap((model) => model.poses ?? [])
      .map((pose) => pose.controlImageUrl)
  );
  return z.object({
    modelIds: z
      .array(
        z
          .string()
          .refine((id) => modelIds.has(id), { message: "unknown model" })
      )
      .min(1),
    prompt: z.string().min(1),
    enhance: z.boolean().default(false),
    seed: z.number().int().min(-1).max(MAX_SEED).optional(),
    ratio: z.enum(RATIO_KEYS).default("1:1"),
    resolutionTier: z.enum(RESOLUTION_TIERS).default("Standard"),
    poseImage: z.string().min(1).optional(),
    referenceImage: z.string().min(1).optional(),
    loras: z.array(z.string()).default([]),
    posePreset: z
      .string()
      .refine((path) => posePaths.has(path), { message: "unknown pose preset" })
      .optional(),
  });
}

// Persists a control input image (already validated base64) to storage
// inside the control generation's folder — alongside where its outputs will
// land. The "generate-request" task fetches the bytes by key (too large to
// carry through a Trigger.dev payload), and the same object later serves as
// the row's display copy.
async function uploadControlImage(
  config: StudioConfig,
  generationId: string,
  name: "reference" | "pose",
  base64: string
): Promise<string> {
  const key = `${generationId}/${name}.png`;
  await config.storage.upload(key, Buffer.from(base64, "base64"), "image/png");
  return key;
}

async function handleGenerateRun(
  config: StudioConfig,
  queries: GenerationQueries,
  req: Request
): Promise<Response> {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = session.userId;

  const parsed = buildGenerateRunSchema(config).safeParse(await req.json());
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const input = parsed.data;

  // Reject oversized control images before persisting anything — they'd be
  // refused by RunPod's body-size limit anyway.
  const oversized = [input.referenceImage, input.poseImage].some(
    (image) =>
      image !== undefined && image.length > MAX_CONTROL_IMAGE_BASE64_CHARS
  );
  if (oversized) {
    return Response.json({ error: "image_too_large" }, { status: 413 });
  }

  const totalCost = input.modelIds.reduce(
    (sum, modelId) => sum + config.billing.costFor(modelId),
    0
  );

  // Affordability gate before creating pollable rows. The authoritative charge
  // happens per row (keyed by its RunPod job id) so a refund can target it.
  // A null balance means unlimited (free-mode config) — skip the check.
  const balance = await config.billing.getBalance(userId);
  if (balance !== null && balance < totalCost) {
    return Response.json(
      { error: "insufficient_funds", topUpUrl: config.billing.topUpUrl },
      { status: 402 }
    );
  }

  // Resolve seeds before insert so the exact value sent to the workflow is the
  // one persisted — a run is always reproducible from its row. A pinned seed
  // applies to every model; otherwise each row gets its own.
  const pinnedSeed =
    input.seed === undefined || input.seed === -1 ? undefined : input.seed;
  const requestId = crypto.randomUUID();

  // One row per model, created (in a single insert) before any slow work so
  // the response can return the ids immediately. Loras/pose only apply to
  // models whose catalog entry declares them (data-driven generalization of
  // the single-CONTROL_MODEL_ID gate the route used before every model in
  // the catalog carried its own capability flags).
  const inputs: CreateGenerationInput[] = input.modelIds.map((modelId) => {
    const model = config.models.find((m) => m.id === modelId);
    return {
      userId,
      requestId,
      modelId,
      prompt: input.prompt,
      seed: pinnedSeed ?? Math.floor(Math.random() * MAX_SEED),
      loras: (model?.loras?.length ?? 0) > 0 ? input.loras : [],
      pose: (model?.poses?.length ?? 0) > 0 ? input.posePreset : undefined,
      ratio: input.ratio,
      resolution: input.resolutionTier,
      priceCoins: config.billing.costFor(modelId),
    };
  });
  const rows = await queries.createGenerations(inputs);
  const generations = inputs.map((row, index) => ({
    generationId: rows[index]?.id ?? "",
    modelId: row.modelId,
    seed: row.seed,
    priceCoins: row.priceCoins,
    createdAt: rows[index]?.createdAt.toISOString() ?? "",
  }));

  // Control images only apply to the model(s) whose workflow branches on
  // them; stage them once into that model's generation folder so inputs and
  // outputs share a prefix.
  const poseControlId = generations.find((row) => {
    const model = config.models.find((m) => m.id === row.modelId);
    return (model?.poses?.length ?? 0) > 0;
  })?.generationId;
  const referenceControlId = generations.find((row) => {
    const model = config.models.find((m) => m.id === row.modelId);
    return model?.supportsReference;
  })?.generationId;

  const [poseImageKey, referenceImageKey] = await Promise.all([
    poseControlId && input.poseImage && !input.posePreset
      ? uploadControlImage(config, poseControlId, "pose", input.poseImage)
      : undefined,
    referenceControlId && input.referenceImage
      ? uploadControlImage(
          config,
          referenceControlId,
          "reference",
          input.referenceImage
        )
      : undefined,
  ]);

  const tag = `req_${requestId}`;
  const payload = {
    requestId,
    userId,
    prompt: input.prompt,
    enhance: input.enhance,
    ratio: input.ratio,
    loras: input.loras,
    posePreset: input.posePreset,
    poseImageKey,
    referenceImageKey,
    generations,
    traceHeaders: {},
  };

  // Triggered by task id string, not a task import — avoids a handler↔task
  // import cycle (spec §6) and keeps this package's "./server" entry free of
  // "./tasks" imports.
  await tasks.trigger("generate-request", payload, { tags: [tag] });

  // No realtime token here — the client gets one from GET .../generations,
  // which mints a fresh token scoped to every still-pending request. That
  // makes reloads and multiple in-flight batches work the same as the happy
  // path.
  return Response.json({
    generations: generations.map((row) => row.generationId),
    requestId,
  });
}

// --- POST generate/video -----------------------------------------------------

const PNG_SUFFIX = /\.png$/;

// Turns the source row's public result URL back into its storage keys: the
// clean (unwatermarked) copy first, then the public copy for legacy rows that
// predate the clean sibling.
function sourceImageKeys(
  config: StudioConfig,
  resultUrl: string
): string[] | undefined {
  const key = config.storage.keyFromPublicUrl(resultUrl);
  if (!key?.endsWith(".png")) {
    return;
  }
  return [key.replace(PNG_SUFFIX, ".clean.png"), key];
}

function buildGenerateVideoSchema(durations: number[]) {
  const allowed = new Set(durations);
  return z.object({
    // The completed image generation the video animates.
    generationId: z.uuid(),
    // Motion prompt, sent to the workflow as-is (no enhance/moderate pipeline).
    prompt: z.string().min(1),
    duration: z
      .number()
      .int()
      .refine((d) => allowed.has(d)),
  });
}

// Starts one image-to-video generation from a completed image row. Inserts
// the video row (already "queued" — there is no prompt pipeline) and triggers
// the generate-video task directly; no orchestrator.
async function handleGenerateVideo(
  config: StudioConfig,
  queries: GenerationQueries,
  req: Request
): Promise<Response> {
  const video = config.video;
  if (!video) {
    return Response.json({ error: "video_not_configured" }, { status: 404 });
  }

  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = session.userId;

  const parsed = buildGenerateVideoSchema(video.durations).safeParse(
    await req.json()
  );
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const input = parsed.data;

  const source = await queries.findGeneration(userId, input.generationId);
  const resultUrl = source?.resultUrls[0];
  if (
    !(source && resultUrl) ||
    source.deletedAt ||
    source.status !== "completed" ||
    source.mediaType !== "image"
  ) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }
  const keys = sourceImageKeys(config, resultUrl);
  if (!keys) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }

  const priceCoins = config.billing.videoCost(input.duration);
  // A null balance means unlimited (free-mode config) — skip the check.
  const balance = await config.billing.getBalance(userId);
  if (balance !== null && balance < priceCoins) {
    return Response.json(
      { error: "insufficient_funds", topUpUrl: config.billing.topUpUrl },
      { status: 402 }
    );
  }

  const requestId = crypto.randomUUID();
  const [row] = await queries.createGenerations([
    {
      userId,
      requestId,
      modelId: video.id,
      mediaType: "video",
      sourceGenerationId: source.id,
      durationSeconds: input.duration,
      prompt: input.prompt,
      title: source.title ? `${source.title} (Video)` : "Video",
      seed: Math.floor(Math.random() * MAX_SEED),
      loras: [],
      ratio: source.ratio,
      resolution: "Standard",
      priceCoins,
      queuedAt: new Date(),
    },
  ]);
  if (!row) {
    return new Response("insert failed", { status: 500 });
  }

  const payload = {
    requestId,
    generationId: row.id,
    userId,
    modelId: video.id,
    prompt: input.prompt,
    seed: row.seed ?? -1,
    priceCoins,
    durationSeconds: input.duration,
    sourceImageKeys: keys,
    createdAt: row.createdAt.toISOString(),
  };

  await tasks.trigger("generate-video", payload, {
    tags: [`req_${requestId}`, `gen_${row.id}`],
  });
  try {
    await tasks.trigger("generate-title", {
      userId,
      generationIds: [row.id],
      prompt: input.prompt,
      traceHeaders: {},
    });
  } catch (err) {
    // Title generation is a best-effort sidecar and must never fail an
    // otherwise-started video generation.
    console.error("generate-title trigger failed", {
      err,
      generationId: row.id,
    });
  }

  return Response.json({ generationId: row.id, requestId });
}

// --- GET/DELETE generations ---------------------------------------------------

const deleteGenerationsSchema = z.object({
  ids: z.array(z.uuid()).min(1),
});

// The current user's generation history, newest first. Hydrates the Studio
// gallery on load. When rows are still pending, the response also carries a
// realtime token scoped to their `req_<requestId>` tags so the client can
// (re)subscribe — including after a page reload.
async function handleListGenerations(
  config: StudioConfig,
  queries: GenerationQueries,
  req: Request
): Promise<Response> {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const generations = await queries.listGenerations(session.userId);
  const realtime = await pendingRealtimeInfo(generations);
  return Response.json({ generations, realtime });
}

// Soft-deletes the given generations. Still-pending rows are cancelled first
// (run killed, charge refunded, row marked failed) so the soft-delete's
// pending-status guard then lets them through. Ownership guards live in the
// queries themselves, so ids belonging to other users are silently ignored.
async function handleDeleteGenerations(
  config: StudioConfig,
  queries: GenerationQueries,
  req: Request
): Promise<Response> {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const parsed = deleteGenerationsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  await queries.cancelPendingGenerations(session.userId, parsed.data.ids);
  const deletedIds = await queries.softDeleteGenerations(
    session.userId,
    parsed.data.ids
  );
  return Response.json({ deletedIds });
}

// --- GET balance --------------------------------------------------------------

async function handleGetBalance(
  config: StudioConfig,
  req: Request
): Promise<Response> {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const balance = await config.billing.getBalance(session.userId);
  return Response.json({ balance });
}

// --- route table ----------------------------------------------------------

export function createStudioHandlers(
  config: StudioConfig
): StudioRouteHandlers {
  const queries = createGenerationQueries(config);

  return {
    GET: async (req) => {
      const path = routePath(req);
      if (path === "generations") {
        return await handleListGenerations(config, queries, req);
      }
      if (path === "balance") {
        return await handleGetBalance(config, req);
      }
      return new Response("not found", { status: 404 });
    },
    POST: async (req) => {
      const path = routePath(req);
      if (path === "generate/run") {
        return await handleGenerateRun(config, queries, req);
      }
      if (path === "generate/video") {
        return await handleGenerateVideo(config, queries, req);
      }
      return new Response("not found", { status: 404 });
    },
    DELETE: async (req) => {
      const path = routePath(req);
      if (path === "generations") {
        return await handleDeleteGenerations(config, queries, req);
      }
      return new Response("not found", { status: 404 });
    },
  };
}
