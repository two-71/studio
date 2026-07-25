"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { useState } from "react";
import { useInvalidateBalance } from "../hooks/use-balance";
import { GENERATIONS_QUERY_KEY } from "../hooks/use-generations";
import { useStudioStore } from "../store/studio-store";
import type { StudioResult } from "../types";
import { useMountEffect } from "../use-mount-effect";

interface GenerationRealtimeProps {
  requestId: string;
  accessToken: string;
}

// The tasks flush `step` metadata before their notify/trace tail, so the
// metadata turns terminal seconds ahead of the run record itself. Detect
// terminal from either signal — whichever propagates first fires the refetch.
const TERMINAL_STEPS = new Set(["completed", "failed", "skipped"]);

function isTerminalRun(run: {
  isCompleted: boolean;
  isCancelled: boolean;
  metadata?: Record<string, unknown>;
}) {
  return (
    run.isCompleted ||
    run.isCancelled ||
    TERMINAL_STEPS.has(String(run.metadata?.step))
  );
}

// Maps a task's `step` metadata to the card status it should display live.
// "completed" stays on "finishing" so the label doesn't bounce backward while
// the terminal refetch is in flight; "failed"/"skipped" are unmapped — their
// entry is removed and the DB-derived status takes over.
const STEP_TO_STATUS: Record<string, NonNullable<StudioResult["status"]>> = {
  "downloading-inputs": "queued",
  submitting: "queued",
  generating: "pending",
  "post-processing": "finishing",
  completed: "finishing",
};

// Refetches the generations list + balance once. Mounted (and remounted, via
// a `key`) per newly-terminal run id instead of reacting to one via useEffect
// — the key-based-remount pattern from .agents/USE_EFFECT.md.
function InvalidateOnMount() {
  const queryClient = useQueryClient();
  const invalidateBalance = useInvalidateBalance();
  useMountEffect(() => {
    queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY });
    invalidateBalance();
  });
  return null;
}

// Writes one run's live step into the store; keyed by `${runId}:${step}` so a
// step change remounts it (old entry's cleanup runs first, then the new mount
// — same commit). Unmounting the whole subscription clears its entries.
function SyncLiveStep({
  generationId,
  status,
}: {
  generationId: string;
  status: NonNullable<StudioResult["status"]>;
}) {
  const setLiveStep = useStudioStore((s) => s.setLiveStep);
  const removeLiveStep = useStudioStore((s) => s.removeLiveStep);
  useMountEffect(() => {
    setLiveStep(generationId, status);
    return () => removeLiveStep(generationId);
  });
  return null;
}

// Headless. Subscribes to every run tagged `req_<requestId>` and:
// - mirrors each child run's `step` metadata into the store as a live status
//   overlay (Preparing → Queued → Generating → Finishing without waiting for
//   a refetch; the run's `generationId` metadata maps it to its card);
// - refreshes the generations list + balance on refetch-worthy transitions:
//   terminal step/state (row done/failed; the orchestrator completing also
//   flips its rows to "Queued…" via their queuedAt stamp), or a child's
//   runpodJobId metadata appearing (the task attaches the id to the DB before
//   setting the metadata, so the refetch always sees it).
// Mounted once per pending request (keyed by requestId in the parent); once
// the invalidated refetch shows no pending row left for the request, the
// parent unmounts it.
export function GenerationRealtime({
  requestId,
  accessToken,
}: GenerationRealtimeProps) {
  // Each list refetch mints a fresh token; keep the first one so refetches
  // don't tear down and re-open the subscription. A remount (new requestId
  // key) captures the then-current token.
  const [token] = useState(accessToken);

  const { runs } = useRealtimeRunsWithTag(`req_${requestId}`, {
    accessToken: token,
    // Routes the subscription through the /api/realtime rewrite (the hook
    // appends /realtime/v1/... itself) instead of hitting api.trigger.dev.
    // Guarded: this renders during SSR (hydrated pending rows), where the
    // subscription never starts and window doesn't exist.
    baseURL:
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}/api`,
    skipColumns: ["payload", "output"],
  });

  // One key per transition already observed — keys only ever get added, so
  // each mounts its invalidation exactly once. A run turning terminal via
  // metadata and later via isCompleted shares one key, so it fires once.
  const invalidateKeys = runs.flatMap((run) => [
    ...(run.metadata?.runpodJobId ? [`${run.id}:job`] : []),
    ...(isTerminalRun(run) ? [run.id] : []),
  ]);

  const liveSteps = runs.flatMap((run) => {
    const generationId = run.metadata?.generationId;
    const status = STEP_TO_STATUS[String(run.metadata?.step)];
    return typeof generationId === "string" && status
      ? [{ key: `${run.id}:${run.metadata?.step}`, generationId, status }]
      : [];
  });

  return (
    <>
      {invalidateKeys.map((key) => (
        <InvalidateOnMount key={key} />
      ))}
      {liveSteps.map((step) => (
        <SyncLiveStep
          generationId={step.generationId}
          key={step.key}
          status={step.status}
        />
      ))}
    </>
  );
}
