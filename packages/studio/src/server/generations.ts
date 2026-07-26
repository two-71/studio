// Route-facing generation queries for createStudioHandlers.
// Extracted from the host app's generation queries module (the pipeline-facing
// half of that file — attachRunpodJob/markCompleted/markFailed/etc. — stays
// host side; it's only ever called from trigger tasks, which are out of scope
// here). Every query runs against `config.db` with this module's own copy of
// the generation table.

import { runs, auth as triggerAuth } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import type { RunpodConfig, StudioConfig } from "../config/types";
import { createGenerationTable } from "../schema/generation";

// The host's real `generation` table already carries a FK to its own `user`
// table (built from this same factory). This package-local copy is
// only ever used for query building (select/insert/update against
// `config.db`), never for migrations, so the FK target just needs to satisfy
// the factory's type signature — drizzle only dereferences `.references()`
// thunks for drizzle-kit introspection, never at query time.
const placeholderUserTable = pgTable("user", { id: text("id").primaryKey() });
const generationTable = createGenerationTable(() => placeholderUserTable.id);

// Rows are created before enhancement/moderation/submit run, so at insert
// time `prompt` is the typed prompt and the job/moderation fields are empty;
// the background pipeline fills them in via attachRunpodJob (host-side).
export interface CreateGenerationInput {
  userId: string;
  requestId: string;
  modelId: string;
  prompt: string;
  seed: number;
  loras: string[];
  pose?: string;
  ratio: string;
  resolution: string;
  priceCoins: number;
  // Video rows only (default is an image row). Video skips the prompt
  // pipeline, so the route stamps queuedAt at insert.
  mediaType?: "image" | "video";
  sourceGenerationId?: string;
  durationSeconds?: number;
  title?: string;
  queuedAt?: Date;
}

// Inserts the batch in one round trip; rows come back in input order. Fires
// "created" once per batch through the notify hook (the package can't
// record a host's attribution event itself, so the host's notify()
// implementation does).
async function createGenerations(
  config: StudioConfig,
  inputs: CreateGenerationInput[]
) {
  const rows = await config.db
    .insert(generationTable)
    .values(inputs)
    .returning();
  const userId = inputs[0]?.userId;
  const firstId = rows[0]?.id;
  if (userId && firstId) {
    await config.notify?.({ type: "created", userId, generationId: firstId });
  }
  return rows;
}

async function listGenerations(config: StudioConfig, userId: string) {
  return await config.db
    .select()
    .from(generationTable)
    .where(
      and(eq(generationTable.userId, userId), isNull(generationTable.deletedAt))
    )
    .orderBy(desc(generationTable.createdAt));
}

// Ownership-scoped lookup by row id (a user only ever sees their own).
async function findGeneration(
  config: StudioConfig,
  userId: string,
  id: string
) {
  const [row] = await config.db
    .select()
    .from(generationTable)
    .where(and(eq(generationTable.userId, userId), eq(generationTable.id, id)));
  return row;
}

// Soft-deletes the given rows. Ownership is enforced in the WHERE clause, and
// pending rows are excluded so an in-flight run can't vanish mid-poll. Returns
// the ids that were actually deleted.
async function softDeleteGenerations(
  config: StudioConfig,
  userId: string,
  ids: string[]
): Promise<string[]> {
  const deleted = await config.db
    .update(generationTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(generationTable.userId, userId),
        inArray(generationTable.id, ids),
        ne(generationTable.status, "pending"),
        isNull(generationTable.deletedAt)
      )
    )
    .returning({ id: generationTable.id });
  return deleted.map((row) => row.id);
}

// The row fields a refund path needs, returned by the terminal UPDATE itself
// so the caller doesn't need a follow-up SELECT.
interface CancelWin {
  runpodJobId: string | null;
  modelId: string;
}

// Only-if-pending "cancelled" transition — the cancel-path sliver of the host
// module's setTerminal/markFailed (which also handles normal task-side
// completion/failure and isn't needed here).
async function markCancelledIfPending(
  config: StudioConfig,
  userId: string,
  id: string
): Promise<CancelWin | undefined> {
  const [updated] = await config.db
    .update(generationTable)
    .set({ status: "failed", error: "cancelled", resultUrls: [] })
    .where(
      and(
        eq(generationTable.userId, userId),
        eq(generationTable.id, id),
        eq(generationTable.status, "pending")
      )
    )
    .returning({
      runpodJobId: generationTable.runpodJobId,
      modelId: generationTable.modelId,
    });
  return updated;
}

// Cancels an in-flight RunPod job directly off `RunpodConfig` — a minimal,
// package-local rewrite of lib/ai/runpod.ts's cancelRun that doesn't need
// the host's model→endpoint registry lookup, only the config that's already
// on hand. RunPod treats cancelling a finished job as a no-op.
async function cancelRunpodJob(
  runpod: RunpodConfig,
  modelId: string,
  jobId: string
): Promise<void> {
  const endpointId = runpod.endpoints[modelId];
  if (!endpointId) {
    throw new Error(`no RunPod endpoint for model "${modelId}"`);
  }
  const response = await fetch(
    `https://api.runpod.ai/v2/${endpointId}/cancel/${jobId}`,
    { method: "POST", headers: { Authorization: `Bearer ${runpod.apiKey}` } }
  );
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`runpod cancel failed: ${response.status} ${bodyText}`);
  }
}

// Cancels one still-generating row: kills its Trigger.dev child run first (so
// the task can't attach/charge after the refund below), then marks the row
// failed and — only when that transition wins — refunds the charge and cancels
// the RunPod job.
async function cancelGeneration(
  config: StudioConfig,
  userId: string,
  id: string
): Promise<void> {
  try {
    for await (const run of runs.list({
      tag: [`gen_${id}`],
      taskIdentifier: ["generate-image", "generate-video"],
    })) {
      if (!(run.isCompleted || run.isCancelled)) {
        await runs.cancel(run.id);
      }
    }
  } catch (err) {
    console.error("trigger run cancel failed", { id, err });
  }

  // No win: finished concurrently — leave the terminal state alone; the
  // caller's soft-delete still removes the row. No job id: nothing was ever
  // charged or submitted.
  const won = await markCancelledIfPending(config, userId, id);
  if (!won?.runpodJobId) {
    return;
  }
  await config.billing.refund(userId, won.runpodJobId);
  try {
    await cancelRunpodJob(config.runpod, won.modelId, won.runpodJobId);
  } catch (err) {
    console.error("runpod cancel failed", { id, err });
  }
}

// Cancels the still-pending rows among `ids` (ownership enforced in the
// query); non-pending ids pass through untouched for the regular soft-delete.
async function cancelPendingGenerations(
  config: StudioConfig,
  userId: string,
  ids: string[]
): Promise<void> {
  const pending = await config.db
    .select({ id: generationTable.id })
    .from(generationTable)
    .where(
      and(
        eq(generationTable.userId, userId),
        inArray(generationTable.id, ids),
        eq(generationTable.status, "pending"),
        isNull(generationTable.deletedAt)
      )
    );
  await Promise.all(
    pending.map((row) => cancelGeneration(config, userId, row.id))
  );
}

// How long a minted realtime token can be used to subscribe to pending runs
// before the client must refetch the generations list for a fresh one.
const PUBLIC_TOKEN_EXPIRATION = "15m";

// Minting hits Trigger.dev's API, and the generations list is refetched every
// few seconds while anything is pending — so reuse a token per pending-request
// set instead of minting one per poll. The reuse window stays far inside the
// token's 15m expiry, and the client keeps only the first token per
// subscription anyway. Best-effort (per server instance).
const TOKEN_REUSE_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, { token: string; mintedAt: number }>();

// Present when the list has pending rows: the batches to subscribe to and a
// token scoped to their `req_<requestId>` tags, minted fresh on every fetch.
export interface RealtimeInfo {
  requestIds: string[];
  publicAccessToken: string;
}

// Mints a public token scoped to the `req_<requestId>` tags of still-pending
// rows so the client can (re)subscribe to their runs — including after a page
// reload. Null when nothing is pending. Doesn't need `config` (Trigger.dev
// auth is ambient via TRIGGER_SECRET_KEY, same as the rest of the SDK).
export async function pendingRealtimeInfo(
  rows: Array<{ status: string; requestId: string | null }>
): Promise<RealtimeInfo | null> {
  const requestIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.status === "pending" && row.requestId ? [row.requestId] : []
      )
    ),
  ];
  if (requestIds.length === 0) {
    return null;
  }

  const cacheKey = [...requestIds].sort().join(",");
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() - cached.mintedAt < TOKEN_REUSE_MS) {
    return { requestIds, publicAccessToken: cached.token };
  }
  const publicAccessToken = await triggerAuth.createPublicToken({
    scopes: { read: { tags: requestIds.map((id) => `req_${id}`) } },
    expirationTime: PUBLIC_TOKEN_EXPIRATION,
  });
  for (const [key, entry] of tokenCache) {
    if (Date.now() - entry.mintedAt >= TOKEN_REUSE_MS) {
      tokenCache.delete(key);
    }
  }
  tokenCache.set(cacheKey, { token: publicAccessToken, mintedAt: Date.now() });
  return { requestIds, publicAccessToken };
}

// Binds every query above to one config instance, so createStudioHandlers
// only has to thread `config` through once.
export function createGenerationQueries(config: StudioConfig) {
  return {
    createGenerations: (inputs: CreateGenerationInput[]) =>
      createGenerations(config, inputs),
    listGenerations: (userId: string) => listGenerations(config, userId),
    findGeneration: (userId: string, id: string) =>
      findGeneration(config, userId, id),
    softDeleteGenerations: (userId: string, ids: string[]) =>
      softDeleteGenerations(config, userId, ids),
    cancelPendingGenerations: (userId: string, ids: string[]) =>
      cancelPendingGenerations(config, userId, ids),
  };
}

export type GenerationQueries = ReturnType<typeof createGenerationQueries>;
