// Shared RunPod status handling for the generate-image/generate-video task
// factories: terminal-state detection, metrics shaping, the webhook-lag
// re-poll, and the race-safe fail+refund path. Only ever called from task
// run bodies (uses the task-scoped logger/metadata/wait). Moved from
// trigger/runpod-status.ts (spec §10 A2.3) as an internal package module —
// not part of the "./tasks" public entry point.

import { logger, metadata, wait } from "@trigger.dev/sdk";
import type { StudioConfig } from "../config/types";
import type { RunMetrics, TaskGenerationQueries } from "./generation-queries";
import { getRunStatus } from "./runpod-client";

export const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED"]);

// Fields common to every RunPod status payload; tasks extend this with their
// workflow-specific `output` shape.
export interface RunpodStatusBase {
  status?: string;
  error?: string;
  delayTime?: number;
  executionTime?: number;
  workerId?: string;
}

export function isTerminal(status: RunpodStatusBase): boolean {
  return (
    status.status === "COMPLETED" || TERMINAL_FAILURES.has(status.status ?? "")
  );
}

export function metricsOf(status: RunpodStatusBase): RunMetrics {
  return {
    runpodStatus: status.status,
    delayTimeMs: status.delayTime,
    executionTimeMs: status.executionTime,
    workerId: status.workerId,
  };
}

// Binds the status/fail helpers to one config + query set, so each task
// factory only has to thread them through once.
export function createRunpodStatusHelpers(
  config: StudioConfig,
  queries: TaskGenerationQueries
) {
  // Re-reads the authoritative status once the wait resolved. RunPod's status
  // read can lag its own webhook by a moment: when the webhook fired but the
  // read is still non-terminal, re-poll briefly instead of failing (and
  // refunding) a job that actually finished. The re-poll wait stays above
  // Trigger.dev's 5s checkpoint threshold so it suspends for free instead of
  // billing compute.
  async function readTerminalStatus<T extends RunpodStatusBase>(
    modelId: string,
    jobId: string,
    webhookFired: boolean
  ): Promise<T> {
    let status = (await getRunStatus(config.runpod, modelId, jobId)) as T;
    logger.info("runpod status", { jobId, ...metricsOf(status) });
    for (let i = 0; webhookFired && !isTerminal(status) && i < 5; i++) {
      logger.warn("webhook fired but status not terminal, re-polling", {
        jobId,
        attempt: i + 1,
        status: status.status,
      });
      await wait.for({ seconds: 6 });
      status = (await getRunStatus(config.runpod, modelId, jobId)) as T;
      logger.info("runpod status", { jobId, ...metricsOf(status) });
    }
    return status;
  }

  // Marks the row failed and, only if this call actually won that transition,
  // refunds the job's charge. Mirrors the pre-migration route's
  // markFailed-then-refund-if-won ordering so a poll/retry that loses the race
  // to a concurrent terminal write never double-refunds.
  async function failRun(
    ids: { userId: string; generationId: string },
    jobId: string,
    reason: string,
    metrics?: RunMetrics
  ): Promise<void> {
    logger.error("generation failed", {
      generationId: ids.generationId,
      jobId,
      reason,
      metrics,
    });
    metadata.set("step", "failed").set("failReason", reason);
    if (
      await queries.markFailed(ids.userId, ids.generationId, reason, metrics)
    ) {
      await config.billing.refund(ids.userId, jobId);
    }
    // Flushed after the row is failed/refunded so the client's refetch on this
    // terminal step sees the final row. Non-fatal: the run finishing delivers
    // the same signal moments later.
    await metadata
      .flush()
      .catch((err) => logger.warn("metadata flush failed", { err }));
  }

  return { readTerminalStatus, failRun };
}

export type RunpodStatusHelpers = ReturnType<typeof createRunpodStatusHelpers>;
