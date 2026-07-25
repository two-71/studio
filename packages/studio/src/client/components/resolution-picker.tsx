"use client";

import { IconMaximize } from "@tabler/icons-react";
import { RESOLUTIONS } from "../constants";
import { useStudioStore } from "../store/studio-store";
import { cn } from "../ui/cn";
import { ComingSoon } from "./coming-soon";
import { PanelSection } from "./panel-section";

export function ResolutionPicker() {
  const resolution = useStudioStore((s) => s.resolution);
  const setResolution = useStudioStore((s) => s.setResolution);

  return (
    <PanelSection icon={IconMaximize} label="Resolution">
      <ComingSoon>
        <div className="flex gap-2">
          {RESOLUTIONS.map((item) => {
            const active = resolution === item.key;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-center transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-muted/30 hover:bg-muted/50"
                )}
                key={item.key}
                onClick={() => setResolution(item.key)}
                type="button"
              >
                <div
                  className={cn(
                    "font-semibold text-[12px]",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {item.key}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {item.sub}
                </div>
              </button>
            );
          })}
        </div>
      </ComingSoon>
    </PanelSection>
  );
}
