// Pipeline-facing generation queries: attach/complete/fail/queue/title,
// called only by the background tasks in this directory. This is the
// tasks-side twin of ../server/generations.ts's route-facing queries — same
// package-local generation-table technique (the FK target only
// needs to satisfy createGenerationTable's type signature for query
// building, never for migrations), kept as its own copy because these
// queries are pipeline-only and the two entry points ("./server", "./tasks")
// must stay independently importable.

import { and, eq, inArray } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import type { StudioConfig } from "../config/types";
import { createGenerationTable } from "../schema/generation";

const placeholderUserTable = pgTable("user", { id: text("id").primaryKey() });
const generationTable = createGenerationTable(() => placeholderUserTable.id);

// Attaches the submitted RunPod job and the pipeline's prompt outcome
// (enhancement + moderation) to a still-pending row. Guarding on "pending"
// keeps a concurrent terminal write (e.g. stall timeout) sticky.
export interface AttachRunpodJobInput {
  runpodJobId: string;
  prompt: string;
  originalPrompt?: string;
  moderationAction: "allow" | "rewrite";
  moderatedPrompt?: string;
  referenceImageUrl?: string;
  pose?: string;
}

async function attachRunpodJob(
  config: StudioConfig,
  userId: string,
  id: string,
  input: AttachRunpodJobInput
): Promise<boolean> {
  const updated = await config.db
    .update(generationTable)
    .set(input)
    .where(
      and(
        eq(generationTable.userId, userId),
        eq(generationTable.id, id),
        eq(generationTable.status, "pending")
      )
    )
    .returning({ id: generationTable.id });
  return updated.length > 0;
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

// RunPod-reported job metadata attached to a terminal write (both success and
// failure). All optional: internal failures (timeout, no_images) have none.
export interface RunMetrics {
  runpodStatus?: string;
  delayTimeMs?: number;
  executionTimeMs?: number;
  workerId?: string;
}

// The row fields a refund path needs, returned by the terminal UPDATE itself
// so winners don't need a follow-up SELECT.
export interface TerminalWin {
  runpodJobId: string | null;
  modelId: string;
}

// Terminal writes only transition a still-pending row. This makes the first
// terminal state win (sticky) and makes repeated polls idempotent — a
// completed run is never reopened and a timed-out run is never overwritten
// by a late success. Returns the row's job fields only for the call that
// actually won the transition (undefined otherwise), so the caller can gate
// side effects (e.g. a refund) on it: a poll that loses the race to a
// concurrent completion must not also refund.
async function setTerminal(
  config: StudioConfig,
  userId: string,
  id: string,
  patch: RunMetrics & {
    status: "completed" | "failed";
    resultUrls?: string[];
    error?: string;
  }
): Promise<TerminalWin | undefined> {
  const [updated] = await config.db
    .update(generationTable)
    .set({ resultUrls: [], error: null, ...patch })
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

function markCompleted(
  config: StudioConfig,
  userId: string,
  id: string,
  resultUrls: string[],
  metrics?: RunMetrics
): Promise<TerminalWin | undefined> {
  return setTerminal(config, userId, id, {
    status: "completed",
    resultUrls,
    ...metrics,
  });
}

function markFailed(
  config: StudioConfig,
  userId: string,
  id: string,
  error: string,
  metrics?: RunMetrics
): Promise<TerminalWin | undefined> {
  return setTerminal(config, userId, id, {
    status: "failed",
    error,
    ...metrics,
  });
}

// Stamps a batch's rows as queued once the orchestrator has batch-triggered
// their children — the card flips from "Preparing…" to "Queued…". Pending-only
// guard keeps a concurrently-failed row's terminal state untouched.
async function markManyQueued(
  config: StudioConfig,
  userId: string,
  ids: string[]
): Promise<void> {
  await config.db
    .update(generationTable)
    .set({ queuedAt: new Date() })
    .where(
      and(
        eq(generationTable.userId, userId),
        inArray(generationTable.id, ids),
        eq(generationTable.status, "pending")
      )
    );
}

// Fails every still-pending row of a batch with one error (e.g. a moderation
// block applies to the shared prompt, so it fails all of the click's rows).
async function markManyFailed(
  config: StudioConfig,
  userId: string,
  ids: string[],
  error: string
): Promise<void> {
  await config.db
    .update(generationTable)
    .set({ status: "failed", error, resultUrls: [] })
    .where(
      and(
        eq(generationTable.userId, userId),
        inArray(generationTable.id, ids),
        eq(generationTable.status, "pending")
      )
    );
}

// Sets the display title generated by the background pipeline on every row of
// the batch. Best-effort; a failure just leaves the model-name fallback.
async function setTitles(
  config: StudioConfig,
  userId: string,
  ids: string[],
  title: string
): Promise<void> {
  await config.db
    .update(generationTable)
    .set({ title })
    .where(
      and(eq(generationTable.userId, userId), inArray(generationTable.id, ids))
    );
}

// Binds every query above to one config instance, so createStudioTasks only
// has to thread `config` through once.
export function createTaskGenerationQueries(config: StudioConfig) {
  return {
    attachRunpodJob: (
      userId: string,
      id: string,
      input: AttachRunpodJobInput
    ) => attachRunpodJob(config, userId, id, input),
    findGeneration: (userId: string, id: string) =>
      findGeneration(config, userId, id),
    markCompleted: (
      userId: string,
      id: string,
      resultUrls: string[],
      metrics?: RunMetrics
    ) => markCompleted(config, userId, id, resultUrls, metrics),
    markFailed: (
      userId: string,
      id: string,
      error: string,
      metrics?: RunMetrics
    ) => markFailed(config, userId, id, error, metrics),
    markManyQueued: (userId: string, ids: string[]) =>
      markManyQueued(config, userId, ids),
    markManyFailed: (userId: string, ids: string[], error: string) =>
      markManyFailed(config, userId, ids, error),
    setTitles: (userId: string, ids: string[], title: string) =>
      setTitles(config, userId, ids, title),
  };
}

export type TaskGenerationQueries = ReturnType<
  typeof createTaskGenerationQueries
>;
