// biome-ignore-all lint/performance/noBarrelFile: this is the package's "/server" entry point (spec §3.1 exports map)
export { createStudioHandlers, type StudioRouteHandlers } from "./handlers";
export { embedPngText } from "./png-metadata";
export { applyWatermarks } from "./watermark";
