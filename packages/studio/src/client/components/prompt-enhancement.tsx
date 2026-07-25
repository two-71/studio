"use client";

import { IconWand } from "@tabler/icons-react";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { Switch } from "../ui/switch";
import { PanelSection } from "./panel-section";

export function PromptEnhancement() {
  const config = useStudioConfig();
  const enabled = useStudioStore((s) => s.promptEnhancement);
  const setEnabled = useStudioStore((s) => s.setPromptEnhancement);

  if (!config.features.enhance) {
    return null;
  }

  return (
    <PanelSection icon={IconWand} label="Prompt Enhancement">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
          Refine your prompt with AI
        </span>
        <Switch
          aria-label="Toggle prompt enhancement"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>
    </PanelSection>
  );
}
