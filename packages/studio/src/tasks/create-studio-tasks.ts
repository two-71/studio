// Assembles the five Studio background tasks (spec §6, §10 A2.3) from one
// StudioConfig. Each task factory calls schemaTask() itself (task ids and
// payload schemas are defined next to their run body), so this function's
// only job is wiring the shared query layer and the cross-task handles
// (generate-request triggers generate-image/generate-title;
// generate-image/generate-video trigger notify-generation) in dependency
// order.
//
// The host's trigger/studio.ts is the sole call site: it imports
// studioConfig and re-exports the five tasks so Trigger.dev's dirs-scanned
// /trigger directory sees exactly the same task ids it always has —
// in-flight runs survive the deploy that moves this code into the package.

import type { StudioConfig } from "../config/types";
import { createGenerateImageTask } from "./generate-image";
import { createGenerateRequestTask } from "./generate-request";
import { createGenerateTitleTask } from "./generate-title";
import { createGenerateVideoTask } from "./generate-video";
import { createTaskGenerationQueries } from "./generation-queries";
import { createNotifyGenerationTask } from "./notify-generation";

export function createStudioTasks(config: StudioConfig) {
  const queries = createTaskGenerationQueries(config);

  const notifyGeneration = createNotifyGenerationTask(config);
  const generateTitle = createGenerateTitleTask(config, queries);
  const generateImage = createGenerateImageTask(
    config,
    queries,
    notifyGeneration
  );
  const generateVideo = createGenerateVideoTask(
    config,
    queries,
    notifyGeneration
  );
  const generateRequest = createGenerateRequestTask(
    config,
    queries,
    generateImage,
    generateTitle
  );

  return {
    generateRequest,
    generateImage,
    generateVideo,
    generateTitle,
    notifyGeneration,
  };
}

export type StudioTasks = ReturnType<typeof createStudioTasks>;
