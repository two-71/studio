// Derives the serializable StudioClientConfig from a server StudioConfig
// (spec §4.7): strips workflow graphs/node maps and every provider/secret,
// keeping only what the <Studio /> client tree needs to render.

import type {
  StudioClientConfig,
  StudioClientModel,
  StudioConfig,
} from "./types";

export function deriveClientConfig(config: StudioConfig): StudioClientConfig {
  const models: StudioClientModel[] = config.models.map(
    ({ workflow: _workflow, ...rest }) => rest
  );

  return {
    models,
    branding: config.branding,
    coinName: config.billing.coinName,
    topUpUrl: config.billing.topUpUrl,
    features: {
      enhance: Boolean(config.prompts?.enhance),
      video: Boolean(config.video),
      loras: models.some((model) => (model.loras?.length ?? 0) > 0),
      poses: models.some((model) => (model.poses?.length ?? 0) > 0),
    },
  };
}
