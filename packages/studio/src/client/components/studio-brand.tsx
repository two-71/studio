"use client";

import { IconImageGeneration } from "@tabler/icons-react";
import { useStudioConfig } from "../studio-config-provider";

// Accent gradient tile (falls back to the same colors as the package's
// `accent` button variant when the host doesn't theme these CSS vars).
const ACCENT_GLOW_CLASS =
  "bg-[linear-gradient(to_bottom,var(--studio-accent-from,oklch(0.75_0.18_350)),var(--studio-accent-to,oklch(0.65_0.24_0)))] text-white shadow-[inset_0_1px_0_var(--studio-accent-highlight,rgba(255,255,255,0.35))]";

export function StudioBrand() {
  const config = useStudioConfig();
  const siteName = config.branding?.siteName ?? "Studio";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${ACCENT_GLOW_CLASS} flex aspect-square size-8 items-center justify-center rounded-lg`}
      >
        {config.brandIcon ?? <IconImageGeneration className="size-5!" />}
      </div>
      <span className="font-normal text-xl">
        <span className="font-black">{siteName}</span> Studio
      </span>
    </div>
  );
}
