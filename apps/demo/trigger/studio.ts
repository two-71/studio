// Host wiring for the five Studio background tasks (spec §6, §10 B1).
// createStudioTasks(studioConfig) builds every task closed over the demo's
// config; this file's only job is re-exporting them so Trigger.dev's
// dirs-scanned directory (trigger.config.ts) picks up their task ids.

import { createStudioTasks } from "@two-71/studio/tasks";
import { studioConfig } from "@/studio.config";

export const {
  generateRequest,
  generateImage,
  generateVideo,
  generateTitle,
  notifyGeneration,
} = createStudioTasks(studioConfig);
