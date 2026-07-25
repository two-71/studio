import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Set after running `npx trigger.dev@latest init` (or create a project at
  // https://cloud.trigger.dev) — paste the resulting "proj_..." ref here, or
  // export it as TRIGGER_PROJECT_REF before running the CLI.
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./trigger"],
  maxDuration: 900,
  build: {
    // Native module the package's watermark step depends on; must load from
    // node_modules at runtime, not get bundled by Trigger.dev's esbuild step.
    external: ["@resvg/resvg-js"],
  },
});
