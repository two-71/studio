"use client";

import { IconCoins, IconLoader2, IconSparkles } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatCoinName } from "../format-coin-name";
import { useBalance } from "../hooks/use-balance";
import { useGenerate } from "../hooks/use-generate";
import { selectedRunnableModels } from "../model-utils";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

// Accent gradient pill (falls back to the same colors as the package's
// `accent` button variant when the host doesn't theme these CSS vars).
const ACCENT_GLOW_CLASS =
  "text-white bg-[linear-gradient(to_bottom,var(--studio-accent-from,oklch(0.75_0.18_350)),var(--studio-accent-to,oklch(0.65_0.24_0)))] shadow-[inset_0_1px_0_var(--studio-accent-highlight,rgba(255,255,255,0.35))] transition-[filter] duration-150 hover:brightness-95";

export function GenerateButton({ className }: { className?: string }) {
  const router = useRouter();
  const config = useStudioConfig();
  const hasPrompt = useStudioStore((s) => s.prompt.trim().length > 0);
  const generating = useStudioStore((s) => s.generating);
  const selectedModelIds = useStudioStore((s) => s.selectedModelIds);
  const generate = useGenerate();
  const { data } = useBalance();

  const cost = selectedRunnableModels(config.models, selectedModelIds).reduce(
    (sum, model) => sum + model.coinCost,
    0
  );
  const canGenerate = hasPrompt && cost > 0 && !generating;

  const handleGenerate = async () => {
    const balance = data?.balance;
    if (balance !== undefined && balance < cost) {
      const topUpUrl = config.topUpUrl;
      toast.error(
        `Need ${formatCoinName(config.coinName, { count: cost })}, you have ${formatCoinName(config.coinName, { count: balance })}`,
        topUpUrl
          ? { action: { label: "Buy", onClick: () => router.push(topUpUrl) } }
          : undefined
      );
      return;
    }

    toast.success(
      `Generating · −${formatCoinName(config.coinName, { count: cost })}`
    );
    await generate();
  };

  return (
    <Button
      className={cn(
        ACCENT_GLOW_CLASS,
        "h-11 w-full rounded-full font-bold duration-200 ease-linear",
        className
      )}
      disabled={!canGenerate}
      onClick={handleGenerate}
    >
      {generating ? (
        <IconLoader2 className="animate-spin" />
      ) : (
        <>
          <IconSparkles />
          Generate
          {cost > 0 && (
            <span className="flex items-center gap-1">
              ({cost}
              <IconCoins className="size-4" />)
            </span>
          )}
        </>
      )}
    </Button>
  );
}
