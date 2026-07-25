import type { RatioKey, ResolutionKey } from "../config/types";

export interface StudioResult {
  id: string;
  /** Backend job id — present once the background pipeline submitted the run. */
  runpodJobId?: string;
  modelId?: string;
  title: string;
  /** Measured generation duration, e.g. "25.8s". Empty while pending. */
  time: string;
  /** Coins charged for this generation. */
  coins: number;
  ratio: RatioKey;
  resolution: ResolutionKey;
  /** Result media URL once done; empty while a run is pending or failed. */
  src: string;
  prompt: string;
  /**
   * Absent on seed data (treated as done). "preparing" covers the prompt
   * pipeline (enhance/moderate) — both on optimistic cards and on rows the
   * orchestrator hasn't fanned out yet; "queued" the wait for a worker after
   * fan-out; "pending" a submitted job ("Generating…"); "finishing"
   * post-processing after the job completed (realtime overlay only — never
   * derived from a DB row).
   */
  status?: "preparing" | "queued" | "pending" | "done" | "error" | "finishing";
  /** Failure code from the row (e.g. "content_policy"), set when failed. */
  errorCode?: string;
  /** Epoch ms the run was kicked off, used to measure elapsed time. */
  startedAt?: number;
  /**
   * Workflow seed the run used (server-generated unless pinned). -1 only on
   * legacy rows where the workflow randomized. Absent on rows predating it.
   */
  seed?: number;
  /** Enabled predefined LoRA ids at submit time. */
  loras?: string[];
  /** True when prompt enhancement rewrote the prompt before submit. */
  enhanced?: boolean;
  /** Public URL of the reference image used, if any. */
  referenceImageUrl?: string;
  /** Pose control: preset URL or an uploaded image URL. */
  pose?: string;
  /** What the row produced; absent means image (legacy rows, optimistic cards). */
  mediaType?: "image" | "video";
  /** Video rows: id of the completed image generation the video animates. */
  sourceGenerationId?: string;
  /** Video rows: requested clip length in seconds. */
  durationSeconds?: number;
}
