// biome-ignore-all lint/performance/noBarrelFile: this is the package's "/schema" entry point (spec §3.1 exports map)
export type { GenerationTable } from "./generation";
export { createGenerationTable } from "./generation";
