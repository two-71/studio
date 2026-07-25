"use client";

import { IconBolt, IconCheck } from "@tabler/icons-react";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { Badge } from "../ui/badge";
import { cn } from "../ui/cn";
import { PanelSection } from "./panel-section";

export function ModelList() {
  const config = useStudioConfig();
  const selectedModelIds = useStudioStore((s) => s.selectedModelIds);
  const toggleModel = useStudioStore((s) => s.toggleModel);

  return (
    <PanelSection
      action={
        <Badge variant="secondary">{selectedModelIds.length} active</Badge>
      }
      icon={IconBolt}
      label="Models"
    >
      <div className="flex flex-col gap-2">
        {config.models.map((model) => {
          const active = selectedModelIds.includes(model.id);
          const comingSoon = model.comingSoon ?? false;
          return (
            <button
              aria-pressed={active}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                comingSoon && "cursor-not-allowed opacity-55",
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-muted/30",
                !(active || comingSoon) && "hover:bg-muted/50"
              )}
              disabled={comingSoon}
              key={model.id}
              onClick={() => toggleModel(model.id)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-semibold text-[13px]">
                    {model.name}
                  </span>
                  {model.coinLabel ? (
                    <span className="font-bold text-emerald-400 text-xs tracking-widest">
                      {model.coinLabel}
                    </span>
                  ) : null}
                  {comingSoon ? (
                    <Badge className="ml-auto" variant="outline">
                      Soon
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs leading-snug">
                  {model.description}
                </p>
              </div>
              {comingSoon ? null : (
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  )}
                >
                  {active ? <IconCheck className="size-3.5" /> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}
