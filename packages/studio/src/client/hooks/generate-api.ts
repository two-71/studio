import type { KyInstance } from "ky";
import type { LoraSelection } from "../../config/lora-selection";
import type { RatioKey, ResolutionKey } from "../../config/types";

export interface StartGenerationInput {
  modelIds: string[];
  prompt: string;
  /** Run the server-side prompt enhancement step before submit. */
  enhance: boolean;
  /** UI aspect ratio; the route maps it to the workflow's selector label. */
  ratio: RatioKey;
  /** UI resolution tier, persisted for display. */
  resolutionTier: ResolutionKey;
  seed?: number;
  /** Pure base64 (no data-URL prefix) pose depth map, control models only. */
  poseImage?: string;
  /** Pure base64 (no data-URL prefix) reference image, control models only. */
  referenceImage?: string;
  /** Enabled predefined LoRAs (id + optional slider strength). */
  loras?: LoraSelection[];
  /** Preset URL when poseImage is a bundled preset rather than an upload. */
  posePreset?: string;
}

export interface StartGenerationResponse {
  generations: string[];
  /** Orchestrator run id; runs are tagged `req_<requestId>`. */
  requestId: string;
}

// Starts one generation row per selected model and returns their ids
// immediately; enhancement, moderation, and the backend submit run
// server-side in the background and are surfaced through the realtime
// subscription the generations list drives (see use-generations.ts).
export async function startGeneration(
  http: KyInstance,
  input: StartGenerationInput
): Promise<StartGenerationResponse> {
  return await http
    .post("generate/run", { json: input })
    .json<StartGenerationResponse>();
}
