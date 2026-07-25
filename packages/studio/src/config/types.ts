// StudioConfig contracts (spec §4, docs/open-source-studio-spec.md). Written
// as future package code: no imports from host-app-specific modules (lib/db,
// lib/billing, lib/ai, better-auth, …) — only generic types and small
// standard-library-shaped values.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// --- Models & workflows (§4.1) ---------------------------------------------

export const RATIO_KEYS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
] as const;
export type RatioKey = (typeof RATIO_KEYS)[number];
export type ResolutionKey = "Standard" | "High" | "Ultra";

// Points a generation variable at the workflow node that holds it and the
// input field on that node to write.
export interface NodeTarget {
  node: string;
  input: string;
}

// Maps a generation variable to its workflow node target. A missing entry
// means that variable is not injected for this workflow.
export interface NodeMap {
  prompt?: NodeTarget;
  seed?: NodeTarget;
  aspectRatio?: NodeTarget;
  poseToggle?: NodeTarget;
  referenceToggle?: NodeTarget;
  referenceLoraToggle?: NodeTarget;
  poseImage?: NodeTarget;
  referenceImage?: NodeTarget;
  loras?: Record<string, NodeTarget>;
  // Image-to-video only: LoadImage node for the source frame and the
  // frame-count node (fps × seconds). Spec's WorkflowSpec has no separate
  // slot for these (today's ModelRuntime.video carried them outside `nodes`)
  // — kept here so a video model's node targets stay in one place, the same
  // way poseImage/referenceImage already do.
  sourceImage?: NodeTarget;
  framesNode?: NodeTarget;
}

export interface WorkflowSpec {
  graph: Record<string, unknown>; // ComfyUI graph JSON
  nodes: NodeMap;
}

export interface LoraSpec {
  id: string;
  name: string;
  triggerWords?: string;
  thumbnailUrl?: string;
  slotKey: string;
}

export interface PoseSpec {
  id: string;
  name: string;
  controlImageUrl: string;
  thumbnailUrl?: string;
}

export interface StudioModel {
  id: string;
  name: string;
  description?: string;
  coinLabel?: string; // display only; cost comes from billing.costFor
  ratios: RatioKey[];
  resolutions: ResolutionKey[];
  supportsReference?: boolean; // enables reference-image picker
  loras?: LoraSpec[]; // empty/absent = LoRA modal hidden
  poses?: PoseSpec[]; // empty/absent = pose modal hidden
  workflow: WorkflowSpec;
  comingSoon?: boolean;
}

export interface VideoModelSpec {
  // Spec gap (§13 flag 9): the literal §4.1 interface has no id, but the
  // video route needs a model id string for RunpodConfig.endpoints and
  // createGenerations' modelId.
  id: string;
  workflow: WorkflowSpec;
  durations: number[]; // allowed seconds
  // Frame rate the workflow's frame-count node expects (frames = seconds ×
  // fps). Spec gap (A2): the pipeline needs this to convert durationSeconds
  // into a frame count without importing the host's video constants.
  fps: number;
}

export interface RunpodConfig {
  apiKey: string;
  endpoints: Record<string, string>; // modelId (and video model id) → RunPod endpoint id
}

// --- Billing (§4.2) ---------------------------------------------------------

export interface BillingProvider {
  costFor(modelId: string): number;
  videoCost(seconds: number): number;
  getBalance(userId: string): Promise<number | null>; // null = unlimited → all coin UI hidden
  charge(
    userId: string,
    amount: number,
    ref: string
  ): Promise<"ok" | "insufficient">; // MUST be idempotent by ref
  refund(userId: string, ref: string): Promise<void>; // MUST be safe to call twice and for unknown refs
  topUpUrl?: string; // absent = no Buy CTA
  coinName?: string; // display label, default "coins"
}

// --- Moderation (§4.3) ------------------------------------------------------

export type ModerationResult =
  | { action: "allow"; rewritten?: string }
  | { action: "block"; reason?: string };

export interface ModerationProvider {
  check(input: { prompt: string; userId: string }): Promise<ModerationResult>;
}

// --- Prompts (§4.4) ----------------------------------------------------------

export interface PromptSpec {
  system: string;
  model: string;
  baseUrl: string; // any OpenAI-compatible endpoint
  apiKey: string;
  temperature?: number;
}

// Per-request context an enhance call may fold into its system prompt (a
// reference/pose control image, LoRA trigger words). Structurally identical
// to a typical host's own EnhanceContext (e.g. an enhance.ts module) so a
// host's existing enhance function satisfies this without a wrapper.
export interface EnhanceContext {
  referenceImage?: string;
  poseImage?: string;
  triggerWords?: string[];
}

// A2 addition: PromptSpec (above) only describes *which* model/endpoint a
// host uses — it was never actually wired to an invocation (see
// studio.config.ts's prompts comment). The pipeline needs something it can
// call, so a host supplies the actual function here; the package has no
// generic caller of its own yet (spec §4.4's "thin OpenAI-compatible
// generateText" fallback is not implemented in A2 — open item). Absent
// entries mirror §4.4's documented fallbacks: no enhance call (original
// prompt passes through), title falls back to a prompt excerpt.
export interface PromptRunner {
  enhance?: (prompt: string, context: EnhanceContext) => Promise<string>;
  title?: (prompt: string) => Promise<string | null>;
}

// --- Storage & auth (§4.5) --------------------------------------------------

export interface StorageAdapter {
  upload(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getBase64(key: string): Promise<string>;
  publicUrl(key: string): string;
  keyFromPublicUrl(url: string): string | null; // video route needs the reverse mapping
}

export interface AuthAdapter {
  getSession(req: Request): Promise<{ userId: string } | null>;
}

// --- Cross-cutting hooks (§4.6) ---------------------------------------------

export interface WatermarkSpec {
  svgBadge?: string;
  text?: string;
  diagonal?: boolean;
}

export interface BrandingLink {
  label: string;
  url: string;
}

// Not fully specified in the spec (only implied by §8: "site name, logo
// slot, links array") — originated here.
export interface BrandingSpec {
  siteName?: string;
  logoUrl?: string;
  links?: BrandingLink[];
}

// Referenced by GenerationEvent but never defined in the spec — originated
// here with enough fields for a notify() implementation to reconstruct a
// Discord-style completion message. `userId` was added (beyond the spec's
// prose list) because every existing notify-shaped call (Discord, funnel
// events) needs it to look up the user.
export interface GenerationSummary {
  id: string;
  userId: string;
  modelId: string;
  mediaType: "image" | "video";
  priceCoins: number;
  resultUrls: string[];
  executionTimeMs?: number;
}

// "created" fires once per insert batch, right after createGenerations
// returns (spec §7's "fold funnelEvent into notify" lean, taken in A2: the
// package can't call a host's attribution module directly, so the route
// reports the milestone through this hook instead — a host's notify()
// implementation is what actually records it).
export type GenerationEvent =
  | { type: "created"; userId: string; generationId: string }
  | { type: "completed"; generation: GenerationSummary }
  | { type: "failed"; generation: GenerationSummary; reason: string }
  | { type: "moderation-blocked"; userId: string; prompt: string };

// --- Database (§7) ----------------------------------------------------------

// The host's Drizzle database instance (spec §7: "pass `db` in config").
// This targets the `drizzle-orm/node-postgres` driver (the spec's
// `PostgresJsDatabase` prose is imprecise — code follows the real driver).
// Unparameterized (defaults to `Record<string, never>`): package queries only
// ever pass their own table objects to `.insert()`/`.select()`/`.update()`,
// which don't depend on the schema generic — only the `.query.*` relational
// API would, and package code never uses it. This is what lets query code
// call real drizzle methods without an `any` cast; the host still narrows its
// own (larger-schema) instance down with `as unknown as DbClient`.
export type DbClient = NodePgDatabase;

// --- Top-level config (§4 opening) ------------------------------------------

export interface StudioConfig {
  models: StudioModel[];
  video?: VideoModelSpec;
  runpod: RunpodConfig;
  storage: StorageAdapter;
  auth: AuthAdapter;
  billing: BillingProvider;
  moderation: ModerationProvider;
  prompts?: { enhance?: PromptSpec; title?: PromptSpec }; // omit a key = feature off
  promptRunner?: PromptRunner; // the actual enhance/title call (A2 addition, see PromptRunner)
  watermark?: WatermarkSpec; // omit = no watermark
  branding?: BrandingSpec;
  notify?: (event: GenerationEvent) => Promise<void>; // omit = no notifications
  db: DbClient; // §7: host's Drizzle instance, decided to live in config
}

// --- Client/server split (§4.7) ---------------------------------------------

// StudioModel minus the workflow graph/node map — the only field that must
// never reach the client.
export type StudioClientModel = Omit<StudioModel, "workflow">;

// Not given a literal interface in the spec (only prose: "models minus
// workflow graphs, branding, coin name, topUpUrl, feature flags for
// enhance/loras/poses/video") — originated here.
export interface StudioClientConfig {
  models: StudioClientModel[];
  branding?: BrandingSpec;
  coinName?: string;
  topUpUrl?: string;
  features: {
    enhance: boolean;
    video: boolean;
    loras: boolean;
    poses: boolean;
  };
}
