import type { StudioClientModel } from "../config/types";

// Models a Generate click will actually run: selected and available.
export function selectedRunnableModels(
  models: StudioClientModel[],
  selectedModelIds: string[]
): StudioClientModel[] {
  return models.filter(
    (model) => selectedModelIds.includes(model.id) && !model.comingSoon
  );
}
