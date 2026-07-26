// biome-ignore-all lint/performance/noBarrelFile: this is the package's "/client" entry point
"use client";

export { StudioBrand } from "./components/studio-brand";
export { StudioShell } from "./components/studio-shell";
export { StudioThemeSwitcher } from "./components/studio-theme-switcher";
export type { AspectRatio, Resolution } from "./constants";
export {
  ASPECT_RATIOS,
  MAX_CONTROL_IMAGE_BYTES,
  MAX_SEED,
  nearestRatio,
  RESOLUTIONS,
} from "./constants";
export type {
  StartGenerationInput,
  StartGenerationResponse,
} from "./hooks/generate-api";
export { startGeneration } from "./hooks/generate-api";
export {
  BALANCE_QUERY_KEY,
  useBalance,
  useInvalidateBalance,
} from "./hooks/use-balance";
export {
  useDeleteGenerations,
  usePendingDeleteIds,
} from "./hooks/use-delete-generations";
export { useGenerate } from "./hooks/use-generate";
export type {
  GenerationRow,
  GenerationsData,
  RealtimeInfo,
} from "./hooks/use-generations";
export {
  GENERATIONS_QUERY_KEY,
  toResult,
  useGenerations,
  useLiveResults,
} from "./hooks/use-generations";
export { copyImage, downloadImage } from "./image-actions";
export type { StudioState } from "./store/studio-store";
export { useStudioStore, useStudioStoreApi } from "./store/studio-store";
export { Studio } from "./studio";
export {
  StudioConfigProvider,
  useStudioConfig,
} from "./studio-config-provider";
export type { StudioUser } from "./studio-user-context";
export { useStudioUser } from "./studio-user-context";
// UI primitives for hosts building controls that match the studio's styling
// (e.g. a headerActions theme switcher).
export { Button, buttonVariants } from "./ui/button";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
export { useMountEffect } from "./use-mount-effect";
