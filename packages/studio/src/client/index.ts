// biome-ignore-all lint/performance/noBarrelFile: this is the package's "/client" entry point (spec §3.1 exports map)
"use client";

export { copyImage, downloadImage } from "./image-actions";
export { Studio } from "./studio";
export {
  StudioConfigProvider,
  useStudioConfig,
} from "./studio-config-provider";
export type { StudioUser } from "./studio-user-context";
export { useStudioUser } from "./studio-user-context";
export { useMountEffect } from "./use-mount-effect";
