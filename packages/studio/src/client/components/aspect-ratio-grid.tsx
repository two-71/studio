"use client";

import { IconAspectRatio } from "@tabler/icons-react";
import { ASPECT_RATIOS } from "../constants";
import { useStudioStore } from "../store/studio-store";
import { cn } from "../ui/cn";
import { ComingSoon } from "./coming-soon";
import { PanelSection } from "./panel-section";

const GLYPH_MAX = 26;

/** Scale a ratio so its longest side is GLYPH_MAX, keeping true proportions. */
function glyphSize(key: string) {
  const [w, h] = key.split(":").map(Number);
  const longest = Math.max(w, h);
  return {
    width: (w / longest) * GLYPH_MAX,
    height: (h / longest) * GLYPH_MAX,
  };
}

export function AspectRatioGrid() {
  const ratio = useStudioStore((s) => s.ratio);
  const setRatio = useStudioStore((s) => s.setRatio);
  const disabled = useStudioStore((s) => s.referenceImage !== null);

  const grid = (
    <div className="grid grid-cols-3 gap-2">
      {ASPECT_RATIOS.map((item) => {
        const active = ratio === item.key;
        const size = glyphSize(item.key);
        return (
          <button
            aria-pressed={active}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-2 rounded-xl border transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border bg-muted/30 hover:bg-muted/60"
            )}
            key={item.key}
            onClick={() => setRatio(item.key)}
            type="button"
          >
            <span className="flex h-7 items-center justify-center">
              <span
                className={cn(
                  "rounded-[3px] border-2 transition-colors",
                  active
                    ? "border-primary bg-primary/30"
                    : "border-muted-foreground/50 bg-muted-foreground/10"
                )}
                style={size}
              />
            </span>
            <span
              className={cn(
                "font-semibold text-[11px] tabular-nums",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {item.key}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <PanelSection icon={IconAspectRatio} label="Aspect Ratio">
      {disabled ? (
        <ComingSoon label="Set by reference image">{grid}</ComingSoon>
      ) : (
        grid
      )}
    </PanelSection>
  );
}
