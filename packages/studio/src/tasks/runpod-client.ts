// RunPod ComfyUI serverless client for the generate-* tasks. Rewritten from
// the host app's RunPod client: instead of resolving a workflow via
// a host model registry (getModelRuntime), every call takes the exact
// WorkflowSpec + RunpodConfig it needs, already resolved by the caller from
// `config.models`/`config.video` — package code never owns a model registry.

import type { RunpodConfig, WorkflowSpec } from "../config/types";

export const ASPECT_RATIO = [
  "1:1 (Square)",
  "3:4 (Portrait Standard)",
  "4:3 (Standard)",
  "9:16 (Portrait Widescreen)",
  "16:9 (Widescreen)",
  "21:9 (Ultrawide)",
] as const;

export type AspectRatio = (typeof ASPECT_RATIO)[number];

// Maps the UI's plain ratio key to the exact label the workflow's
// ResolutionSelector node accepts. Shared so callers only ever speak in plain
// ratios (e.g. "16:9") and this stays the single source of truth for the
// mapping.
export const RATIO_TO_ASPECT_RATIO: Record<
  "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9",
  AspectRatio
> = {
  "1:1": "1:1 (Square)",
  "16:9": "16:9 (Widescreen)",
  "9:16": "9:16 (Portrait Widescreen)",
  "4:3": "4:3 (Standard)",
  "3:4": "3:4 (Portrait Standard)",
  "21:9": "21:9 (Ultrawide)",
};

export interface GenerateInput {
  prompt: string;
  seed?: number;
  aspect_ratio?: AspectRatio;
  /** Pure base64 pose depth map; enables the workflow's pose branch. */
  poseImage?: string;
  /** Pure base64 reference image; enables the workflow's reference branch. */
  referenceImage?: string;
  /** Enabled predefined LoRA ids; unmapped slots are switched off. */
  loras?: string[];
}

// Filenames the uploaded images are stored under in ComfyUI's input folder;
// the workflow's LoadImage nodes are patched to read them by these names.
const POSE_FILENAME = "pose.png";
const REFERENCE_FILENAME = "reference.png";
const VIDEO_SOURCE_FILENAME = "source.png";

function runpodBaseUrl(endpointId: string): string {
  return `https://api.runpod.ai/v2/${endpointId}`;
}

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

function endpointFor(runpod: RunpodConfig, modelId: string): string {
  const endpointId = runpod.endpoints[modelId];
  if (!endpointId) {
    throw new Error(`no RunPod endpoint for model "${modelId}"`);
  }
  return endpointId;
}

// Clone the workflow graph so the config's shared reference is never mutated
// across requests, then inject each variable into its mapped node. Variables
// with no node mapping (e.g. the Krea dummy) are sent through untouched.
function buildWorkflow(workflow: WorkflowSpec, input: GenerateInput): unknown {
  const cloned = structuredClone(workflow.graph) as Record<
    string,
    { inputs: Record<string, unknown> }
  >;
  const {
    prompt,
    seed,
    aspectRatio,
    poseToggle,
    referenceToggle,
    referenceLoraToggle,
  } = workflow.nodes;
  if (prompt) {
    cloned[prompt.node].inputs[prompt.input] = input.prompt;
  }
  if (seed && input.seed !== undefined) {
    cloned[seed.node].inputs[seed.input] = input.seed;
  }
  if (aspectRatio) {
    cloned[aspectRatio.node].inputs[aspectRatio.input] = input.aspect_ratio;
  }
  // Presence of an image is the toggle: the boolean node enables the branch and
  // its LoadImage node is pointed at the uploaded filename. When absent, the
  // branch stays off and LoadImage keeps its default (example.png), which
  // always exists so validation passes.
  if (poseToggle) {
    cloned[poseToggle.node].inputs[poseToggle.input] = Boolean(input.poseImage);
  }
  if (workflow.nodes.poseImage && input.poseImage) {
    const { node, input: field } = workflow.nodes.poseImage;
    cloned[node].inputs[field] = POSE_FILENAME;
  }
  if (referenceToggle) {
    cloned[referenceToggle.node].inputs[referenceToggle.input] = Boolean(
      input.referenceImage
    );
  }
  if (referenceLoraToggle) {
    const slot = cloned[referenceLoraToggle.node].inputs[
      referenceLoraToggle.input
    ] as { on: boolean };
    slot.on = Boolean(input.referenceImage);
  }

  if (workflow.nodes.referenceImage && input.referenceImage) {
    const { node, input: field } = workflow.nodes.referenceImage;
    cloned[node].inputs[field] = REFERENCE_FILENAME;
  }
  // Every mapped LoRA slot gets its `on` flag written both ways: the workflow
  // JSON may ship with a slot enabled by default, so absence must switch it off.
  const enabledLoras = new Set(input.loras ?? []);
  for (const [loraId, target] of Object.entries(workflow.nodes.loras ?? {})) {
    const slot = cloned[target.node].inputs[target.input] as { on: boolean };
    slot.on = enabledLoras.has(loraId);
  }
  return cloned;
}

export interface RunpodRunResult {
  id: string;
  status: string;
}

// Shared POST /run scaffolding: auth header, JSON body, webhook arming, and
// non-2xx surfacing. Callers only supply the endpoint and the `input` payload.
async function postRun(
  runpod: RunpodConfig,
  endpointId: string,
  input: Record<string, unknown>,
  webhookUrl?: string
): Promise<RunpodRunResult> {
  const response = await fetch(`${runpodBaseUrl(endpointId)}/run`, {
    method: "POST",
    headers: {
      ...authHeader(runpod.apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`runpod run failed: ${response.status} ${bodyText}`);
  }

  return (await response.json()) as RunpodRunResult;
}

export interface VideoGenerateInput {
  prompt: string;
  seed: number;
  /** Pure base64 source image the video animates. */
  sourceImage: string;
  /** Frame count at the workflow's fixed fps (fps × seconds). */
  frames: number;
}

// Image-to-video submit. Reuses buildWorkflow for the prompt/seed nodes, then
// patches the video-only nodes (source LoadImage, frame-count slider). All
// other node inputs keep the values shipped in the workflow JSON.
export function submitVideoRun(
  runpod: RunpodConfig,
  modelId: string,
  workflow: WorkflowSpec,
  input: VideoGenerateInput,
  webhookUrl?: string
): Promise<RunpodRunResult> {
  const { sourceImage, framesNode } = workflow.nodes;
  if (!(sourceImage && framesNode)) {
    throw new Error(`not a video workflow: ${modelId}`);
  }

  const built = buildWorkflow(workflow, {
    prompt: input.prompt,
    seed: input.seed,
  }) as Record<string, { inputs: Record<string, unknown> }>;
  built[sourceImage.node].inputs[sourceImage.input] = VIDEO_SOURCE_FILENAME;
  built[framesNode.node].inputs[framesNode.input] = input.frames;

  return postRun(
    runpod,
    endpointFor(runpod, modelId),
    {
      images: [{ name: VIDEO_SOURCE_FILENAME, image: input.sourceImage }],
      workflow: built,
    },
    webhookUrl
  );
}

export function submitRun(
  runpod: RunpodConfig,
  modelId: string,
  workflow: WorkflowSpec,
  input: GenerateInput,
  webhookUrl?: string
): Promise<RunpodRunResult> {
  const images = [
    ...(input.poseImage
      ? [{ name: POSE_FILENAME, image: input.poseImage }]
      : []),
    ...(input.referenceImage
      ? [{ name: REFERENCE_FILENAME, image: input.referenceImage }]
      : []),
  ];

  return postRun(
    runpod,
    endpointFor(runpod, modelId),
    {
      ...(images.length > 0 ? { images } : {}),
      workflow: buildWorkflow(workflow, input),
    },
    webhookUrl
  );
}

// Returns the raw RunPod status payload (IN_QUEUE / IN_PROGRESS / COMPLETED
// with output.images[].data base64), forwarded to the caller as-is. Run ids
// are scoped to their endpoint, so the model id is required to resolve it.
export async function getRunStatus(
  runpod: RunpodConfig,
  modelId: string,
  id: string
): Promise<unknown> {
  const response = await fetch(
    `${runpodBaseUrl(endpointFor(runpod, modelId))}/status/${id}`,
    { headers: authHeader(runpod.apiKey) }
  );

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`runpod status failed: ${response.status} ${bodyText}`);
  }

  return await response.json();
}
