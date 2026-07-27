"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { selectedRunnableModels } from "../model-utils";
import { useStudioStoreApi } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { httpStatusOf, useStudioHttp } from "../studio-http-context";
import type { StudioResult } from "../types";
import { type StartGenerationInput, startGeneration } from "./generate-api";
import { useInvalidateBalance } from "./use-balance";
import { GENERATIONS_QUERY_KEY } from "./use-generations";

const DATA_URL_PREFIX = /^data:.*?;base64,/;

// Pose/reference controls hold either an uploaded data URL or a preset URL;
// either way the API wants the raw base64 payload.
async function imageToBase64(image: string): Promise<string> {
  if (image.startsWith("data:")) {
    return image.replace(DATA_URL_PREFIX, "");
  }
  const blob = await (await fetch(image)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.replace(DATA_URL_PREFIX, "");
}

interface ControlImages {
  pose?: string;
  /** Set when the pose is a bundled preset URL (uploads are data URLs); the
   * server stores the URL instead of re-uploading the asset. */
  posePreset?: string;
  reference?: string;
}

// Encodes the selected control images (concurrently) up front; a failed load
// aborts the whole submit (returns null) with a toast rather than silently
// dropping a control.
async function encodeControlImages(options: {
  poseImage: string | null;
  referenceImage: string | null;
}): Promise<ControlImages | null> {
  // null = load failed (toasted); undefined = no image selected.
  const encode = (
    image: string | null,
    label: string
  ): Promise<string | null | undefined> =>
    image
      ? imageToBase64(image).catch(() => {
          toast.error(`Couldn't load the selected ${label} image`);
          return null;
        })
      : Promise.resolve(undefined);
  const [pose, reference] = await Promise.all([
    encode(options.poseImage, "pose"),
    encode(options.referenceImage, "reference"),
  ]);
  if (pose === null || reference === null) {
    return null;
  }
  const posePreset =
    options.poseImage && !options.poseImage.startsWith("data:")
      ? options.poseImage
      : undefined;
  return { pose, posePreset, reference };
}

interface StartContext {
  modelIds: string[];
  typedPrompt: string;
  enhance: boolean;
  ratio: StartGenerationInput["ratio"];
  resolution: StartGenerationInput["resolutionTier"];
  controlImages: ControlImages;
  enabledLoras: StartGenerationInput["loras"];
}

function buildStartInput(ctx: StartContext): StartGenerationInput {
  return {
    modelIds: ctx.modelIds,
    prompt: ctx.typedPrompt,
    enhance: ctx.enhance,
    ratio: ctx.ratio,
    resolutionTier: ctx.resolution,
    ...(ctx.controlImages.pose
      ? {
          poseImage: ctx.controlImages.pose,
          posePreset: ctx.controlImages.posePreset,
        }
      : {}),
    ...(ctx.controlImages.reference
      ? { referenceImage: ctx.controlImages.reference }
      : {}),
    ...(ctx.enabledLoras?.length ? { loras: ctx.enabledLoras } : {}),
  };
}

// One toast per failed start; moderation outcomes no longer surface here —
// they arrive later through the polled row (blocked/failed card states).
function reportStartFailure(err: unknown) {
  const status = httpStatusOf(err);
  if (status === 413) {
    toast.error("Control image is too large — max 7 MB");
  } else if (status === 402) {
    toast.error("Not enough coins");
  } else {
    toast.error("Couldn't start generation");
  }
}

// Kicked off by the Generate click (an event, not an effect). Shows optimistic
// preparing cards for instant feedback, starts the batch with one request (the
// server persists a row per model and returns immediately; enhancement,
// moderation, and the backend submit run in the background), then refetches
// the list — whose response carries the realtime token that mounts the
// <GenerationRealtime> subscription — so the authoritative DB rows take over.
// The optimistic cards live in the studio store (not the query cache) and the
// gallery renders them ahead of the list, so a concurrent refetch during the
// submit window can't drop them; they're cleared once the post-submit refetch
// lands.
export function useGenerate() {
  const http = useStudioHttp();
  const config = useStudioConfig();
  const storeApi = useStudioStoreApi();
  const queryClient = useQueryClient();
  const invalidateBalance = useInvalidateBalance();

  return async () => {
    const {
      prompt: rawPrompt,
      selectedModelIds,
      ratio,
      resolution,
      poseImage,
      referenceImage,
      referenceImageOversized,
      enabledLoras,
      promptEnhancement,
      generating,
      setGenerating,
      setOptimisticCards,
      clearOptimisticCards,
    } = storeApi.getState();
    const typedPrompt = rawPrompt.trim();
    if (!typedPrompt || generating) {
      return;
    }

    // An oversized reference would be rejected by the backend's body-size
    // limit, so refuse to submit until it's removed or replaced.
    if (referenceImage && referenceImageOversized) {
      toast.error("Reference image is too large — remove or replace it");
      return;
    }

    const models = selectedRunnableModels(config.models, selectedModelIds);
    if (models.length === 0) {
      return;
    }
    setGenerating(true);
    try {
      const controlImages = await encodeControlImages({
        poseImage,
        referenceImage,
      });
      if (!controlImages) {
        return;
      }

      // Cards go up before the network round-trip so the click gets instant
      // feedback; the post-submit refetch replaces them with the DB rows.
      setOptimisticCards(
        models.map(
          (model): StudioResult => ({
            id: crypto.randomUUID(),
            title: model.name,
            time: "",
            coins: model.coinCost,
            ratio,
            resolution,
            src: "",
            prompt: typedPrompt,
            status: "preparing",
            startedAt: Date.now(),
          })
        )
      );

      try {
        await startGeneration(
          http,
          buildStartInput({
            modelIds: models.map((model) => model.id),
            typedPrompt,
            enhance: promptEnhancement,
            ratio,
            resolution,
            controlImages,
            enabledLoras,
          })
        );
      } catch (err) {
        reportStartFailure(err);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY });
      invalidateBalance();
    } finally {
      clearOptimisticCards();
      setGenerating(false);
    }
  };
}
