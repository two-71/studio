import { AspectRatioGrid } from "./aspect-ratio-grid";
import { ControlPicker } from "./control-picker";
import { ModelList } from "./model-list";
import { PromptEnhancement } from "./prompt-enhancement";
import { PromptField } from "./prompt-field";
import { ReferencePicker } from "./reference-picker";
import { ResolutionPicker } from "./resolution-picker";

/** Shared control stack — rendered in the desktop sidebar and the mobile drawer. */
export function ControlsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <PromptField />
      <PromptEnhancement />
      <ReferencePicker />
      <ControlPicker />
      <ModelList />
      <AspectRatioGrid />
      <ResolutionPicker />
    </div>
  );
}
