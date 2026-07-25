import { createStudioHandlers } from "@two-71/studio/server";
import { studioConfig } from "@/studio.config";

export const { GET, POST, DELETE } = createStudioHandlers(studioConfig);
