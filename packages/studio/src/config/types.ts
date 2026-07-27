// StudioConfig contracts. Written
// as future package code: no imports from host-app-specific modules (lib/db,
// lib/billing, lib/ai, better-auth, …) — only generic types and small
// standard-library-shaped values.

import type { LanguageModel } from "ai";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ReactNode } from "react";

// --- Models & workflows ----------------------------------------------------

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
  // Controls (reference/pose/LoRA UI) always render for every model; these
  // lists only populate the pose/LoRA dialogs (empty/absent = empty dialog).
  loras?: LoraSpec[];
  poses?: PoseSpec[];
  workflow: WorkflowSpec;
  comingSoon?: boolean;
}

export interface VideoModelSpec {
  // The video route needs a model id string for RunpodConfig.endpoints
  // and createGenerations' modelId.
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

// --- Billing ----------------------------------------------------------------

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
  // Dummy/free provider (e.g. freeBilling): hides all coin/cost UI and skips
  // balance fetches entirely.
  disabled?: boolean;
}

// --- Moderation -------------------------------------------------------------

export type ModerationResult =
  | { action: "allow"; rewritten?: string }
  | { action: "block"; reason?: string };

export interface ModerationProvider {
  check(input: { prompt: string; userId: string }): Promise<ModerationResult>;
}

// --- Prompts -----------------------------------------------------------------

// Everything the package needs to run an enhance/title call itself: a Vercel
// AI SDK model (which already carries the provider, model name, base URL and
// API key) and an optional system prompt.
//
// Omitting `system` uses the package default (ENHANCE_SYSTEM / TITLE_SYSTEM).
// An enhance system prompt — default or custom — is templated: the
// {{REFERENCE_BLOCK}}, {{POSE_BLOCK}} and {{LORA_BLOCK}} placeholders are
// replaced with the matching block when the request carries that input, and
// with "" otherwise. A custom system prompt without placeholders gets no block
// instructions (the control images still reach the model, unannounced).
export interface PromptSpec {
  model: LanguageModel;
  system?: string;
}

// --- Storage & auth ---------------------------------------------------------

export interface StorageAdapter {
  upload(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getBase64(key: string): Promise<string>;
  publicUrl(key: string): string;
  keyFromPublicUrl(url: string): string | null; // video route needs the reverse mapping
}

export interface AuthAdapter {
  getSession(req: Request): Promise<{ userId: string } | null>;
}

// --- Cross-cutting hooks ----------------------------------------------------

export interface WatermarkSpec {
  svgBadge?: string;
  text?: string;
  diagonal?: boolean;
}

export interface BrandingLink {
  label: string;
  url: string;
}

// Header branding: site name, logo slot, links array.
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
// returns (the package can't call a host's attribution module directly, so
// the route reports the milestone through this hook instead — a host's
// notify() implementation is what actually records it).
export type GenerationEvent =
  | { type: "created"; userId: string; generationId: string }
  | { type: "completed"; generation: GenerationSummary }
  | { type: "failed"; generation: GenerationSummary; reason: string }
  | { type: "moderation-blocked"; userId: string; prompt: string };

// --- Database ---------------------------------------------------------------

// The host's Drizzle database instance, targeting the
// `drizzle-orm/node-postgres` driver.
// Unparameterized (defaults to `Record<string, never>`): package queries only
// ever pass their own table objects to `.insert()`/`.select()`/`.update()`,
// which don't depend on the schema generic — only the `.query.*` relational
// API would, and package code never uses it. This is what lets query code
// call real drizzle methods without an `any` cast; the host still narrows its
// own (larger-schema) instance down with `as unknown as DbClient`.
export type DbClient = NodePgDatabase;

// --- Top-level config -------------------------------------------------------

export interface StudioConfig {
  models: StudioModel[];
  video?: VideoModelSpec;
  runpod: RunpodConfig;
  storage: StorageAdapter;
  auth: AuthAdapter;
  billing: BillingProvider;
  moderation: ModerationProvider;
  prompts?: { enhance?: PromptSpec; title?: PromptSpec }; // omit a key = feature off
  watermark?: WatermarkSpec; // omit = no watermark
  branding?: BrandingSpec;
  notify?: (event: GenerationEvent) => Promise<void>; // omit = no notifications
  db: DbClient; // host's Drizzle instance
}

// --- Client/server split ----------------------------------------------------

// StudioModel minus the workflow graph/node map — the only field that must
// never reach the client. `coinCost` is derived (not part of the server
// model): deriveClientConfig fills it in from billing.costFor so the client
// can total/display exact costs without the billing provider itself crossing
// the server/client boundary (coinLabel stays the display-only tier string).
export type StudioClientModel = Omit<StudioModel, "workflow"> & {
  coinCost: number;
};

// Not given a literal interface in the spec (only prose: "models minus
// workflow graphs, branding, coin name, topUpUrl, feature flags for
// enhance/video") — originated here.
export interface StudioClientConfig {
  models: StudioClientModel[];
  branding?: BrandingSpec;
  coinName?: string;
  topUpUrl?: string;
  features: {
    enhance: boolean;
    video: boolean;
    // False when the billing provider is disabled (dummy/free): coin/cost UI
    // is hidden and the balance endpoint is never called.
    billing: boolean;
  };
  // Image-to-video pricing/options surfaced to the client (A2 gap: the spec's
  // VideoModelSpec has durations but no client-visible per-second cost).
  // coinsPerSecond is derived from billing.videoCost(1) by deriveClientConfig.
  video?: { durations: number[]; coinsPerSecond: number };
  // Route prefix the client's ky instance is created with (studio-http-context.tsx).
  // Default "/api/studio" — override only if the host mounts createStudioHandlers
  // somewhere else.
  apiBasePath?: string;
  // Client-only extras: never set by deriveClientConfig (functions can't cross
  // the server/client boundary as props from an async Server Component). <Studio>
  // merges its own `imageLoader`/`onSignOut` props into the config it provides,
  // so a host that needs either renders <Studio> from its own "use client"
  // wrapper instead of directly from a server page.
  imageLoader?: (props: {
    src: string;
    width: number;
    quality?: number;
  }) => string;
  onSignOut?: () => Promise<void>;
  // Redirect target after onSignOut resolves. Default "/login".
  loginUrl?: string;
  // Brand tile icon (StudioBrand). Default is an image-generation glyph.
  brandIcon?: ReactNode;
  // Extra header controls (StudioHeader), rendered left of the coin pill —
  // e.g. a theme switcher.
  headerActions?: ReactNode;
  // Width in px of the decorative top-right notch (StudioNotch, lg+ only).
  // Default 290 — widen it when the header hosts more controls.
  notchWidth?: number;
}
