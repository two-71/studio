"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  RatioKey,
  ResolutionKey,
  StudioClientModel,
} from "../../config/types";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { useStudioHttp } from "../studio-http-context";
import type { StudioResult } from "../types";

export const GENERATIONS_QUERY_KEY = ["studio-generations"] as const;

const MS_PER_SECOND = 1000;
// Fallback for pending rows the realtime subscription can't cover (legacy
// rows with no requestId): plain fast polling.
const LEGACY_FALLBACK_POLL_MS = 5000;
// Safety net while a realtime subscription is active: catches an expired
// token (runs pending past its 15m lifetime) or a silently dropped socket.
const REALTIME_SAFETY_POLL_MS = 60_000;

// The persisted generation row as serialized by the API (timestamps are ISO
// strings over the wire).
export interface GenerationRow {
  id: string;
  /** Null while the background pipeline hasn't submitted the job yet. */
  runpodJobId: string | null;
  /** Orchestrator batch id (runs tagged `req_<requestId>`); null on legacy rows. */
  requestId: string | null;
  /** Set once the orchestrator batch-triggered the children; null while the
   * prompt pipeline runs, and forever on legacy/failed-early rows. */
  queuedAt: string | null;
  modelId: string;
  mediaType: "image" | "video";
  /** Video rows: the completed image generation the video animates. */
  sourceGenerationId: string | null;
  /** Video rows: requested clip length in seconds. */
  durationSeconds: number | null;
  prompt: string;
  title: string | null;
  priceCoins: number;
  ratio: RatioKey;
  resolution: ResolutionKey;
  status: "pending" | "completed" | "failed";
  resultUrls: string[];
  error: string | null;
  seed: number | null;
  loras: string[];
  originalPrompt: string | null;
  referenceImageUrl: string | null;
  pose: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_MAP = {
  pending: "pending",
  completed: "done",
  failed: "error",
} as const;

// A pending row walks the pipeline: no queuedAt yet — prompt work
// (enhance/moderate) still running, "Preparing…"; queued but no job id —
// children triggered, waiting for a worker, "Queued…"; job id attached —
// "Generating…".
function statusOf(row: GenerationRow): StudioResult["status"] {
  if (row.status === "pending" && !row.runpodJobId) {
    return row.queuedAt ? "queued" : "preparing";
  }
  return STATUS_MAP[row.status];
}

// Maps a stored row to the card view model the gallery/lightbox render. Price
// is derived from the model catalog, not stored, so it stays in sync; title
// falls back to the model name when none was generated.
export function toResult(
  row: GenerationRow,
  models: StudioClientModel[]
): StudioResult {
  const model = models.find((m) => m.id === row.modelId);
  const startedAt = new Date(row.createdAt).getTime();
  const elapsed =
    (new Date(row.updatedAt).getTime() - startedAt) / MS_PER_SECOND;

  return {
    id: row.id,
    runpodJobId: row.runpodJobId ?? undefined,
    modelId: row.modelId,
    title: row.title ?? model?.name ?? row.modelId,
    time: row.status === "completed" ? `${elapsed.toFixed(1)}s` : "",
    // Catalog price when the model is still listed; otherwise the stored
    // per-row price (video rows, retired models).
    coins: model?.coinCost ?? row.priceCoins,
    ratio: row.ratio,
    resolution: row.resolution,
    src: row.resultUrls[0] ?? "",
    prompt: row.prompt,
    status: statusOf(row),
    errorCode: row.error ?? undefined,
    startedAt,
    seed: row.seed ?? undefined,
    loras: row.loras,
    enhanced: row.originalPrompt !== null,
    referenceImageUrl: row.referenceImageUrl ?? undefined,
    pose: row.pose ?? undefined,
    mediaType: row.mediaType,
    sourceGenerationId: row.sourceGenerationId ?? undefined,
    durationSeconds: row.durationSeconds ?? undefined,
  };
}

// Present when the list has pending rows: the batches to subscribe to and a
// token scoped to their `req_<requestId>` tags, minted fresh on every fetch.
export interface RealtimeInfo {
  requestIds: string[];
  publicAccessToken: string;
}

export interface GenerationsData {
  results: StudioResult[];
  realtime: RealtimeInfo | null;
}

// Pipeline order for the in-flight statuses; a live step only overrides a
// DB-derived status when it's further along, so a stale refetch (or a stale
// overlay entry) can never bounce a card's label backward.
const LIVE_RANK = {
  preparing: 0,
  queued: 1,
  pending: 2,
  finishing: 3,
} as const;

function isInFlight(
  status: StudioResult["status"]
): status is keyof typeof LIVE_RANK {
  return status !== undefined && status in LIVE_RANK;
}

// The generation list with the realtime metadata steps overlaid: in-flight
// cards take whichever status is furthest along; terminal rows ignore the
// overlay entirely.
export function useLiveResults(): StudioResult[] {
  const { data } = useGenerations();
  const liveSteps = useStudioStore((s) => s.liveSteps);
  const results = data?.results ?? [];
  return results.map((result) => {
    const live = liveSteps[result.id];
    if (
      live &&
      isInFlight(live) &&
      isInFlight(result.status) &&
      LIVE_RANK[live] > LIVE_RANK[result.status]
    ) {
      return { ...result, status: live };
    }
    return result;
  });
}

// The user's generation history, newest first. Source of truth for the
// gallery; pending rows are resumed by the realtime subscriptions the
// response's `realtime` info drives (see <GenerationRealtime>), which
// invalidate this query as runs finish — so this also survives a reload.
export function useGenerations() {
  const http = useStudioHttp();
  const config = useStudioConfig();
  return useQuery({
    queryKey: GENERATIONS_QUERY_KEY,
    queryFn: async (): Promise<GenerationsData> => {
      const { generations, realtime } = await http.get("generations").json<{
        generations: GenerationRow[];
        realtime: RealtimeInfo | null;
      }>();
      return {
        results: generations.map((row) => toResult(row, config.models)),
        realtime,
      };
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasPending = data?.results.some(
        (result) =>
          result.status === "pending" ||
          result.status === "preparing" ||
          result.status === "queued"
      );
      if (!hasPending) {
        return false;
      }
      return data?.realtime ? REALTIME_SAFETY_POLL_MS : LEGACY_FALLBACK_POLL_MS;
    },
  });
}
