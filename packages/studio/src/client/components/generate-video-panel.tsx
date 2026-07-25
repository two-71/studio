"use client";

import { IconCoins, IconLoader2, IconVideo } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useInvalidateBalance } from "../hooks/use-balance";
import { GENERATIONS_QUERY_KEY } from "../hooks/use-generations";
import { useStudioConfig } from "../studio-config-provider";
import { httpStatusOf, useStudioHttp } from "../studio-http-context";
import type { StudioResult } from "../types";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Textarea } from "../ui/textarea";

const DEFAULT_DURATION = 5;

/**
 * "Generate Video" block under the lightbox prompt. Collapsed it's a single
 * button; expanded it takes a motion prompt + duration and starts an
 * image-to-video run from this result. The new row appears in the gallery as
 * a regular (video) card via the post-submit refetch.
 */
export function GenerateVideoPanel({ result }: { result: StudioResult }) {
  const config = useStudioConfig();
  const http = useStudioHttp();
  const queryClient = useQueryClient();
  const invalidateBalance = useInvalidateBalance();
  const durations = config.video?.durations ?? [DEFAULT_DURATION];
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<number>(
    durations[0] ?? DEFAULT_DURATION
  );
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const motionPrompt = prompt.trim();
    if (!motionPrompt || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await http.post("generate/video", {
        json: { generationId: result.id, prompt: motionPrompt, duration },
      });
      toast.success("Video generation started");
      setOpen(false);
      setPrompt("");
      await queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY });
      invalidateBalance();
    } catch (err) {
      toast.error(
        httpStatusOf(err) === 402
          ? "Not enough coins"
          : "Couldn't start video generation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button
        className="mt-3 w-full"
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <IconVideo />
        Generate Video
      </Button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <Textarea
        autoFocus
        className="min-h-20 resize-none"
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the motion, e.g. she slowly turns her head and smiles"
        value={prompt}
      />
      <div className="flex flex-wrap gap-1.5">
        {durations.map((seconds) => (
          <button
            className={cn(
              "rounded-full border border-border px-3 py-1 text-[13px] transition-colors",
              seconds === duration
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={seconds}
            onClick={() => setDuration(seconds)}
            type="button"
          >
            {seconds}s
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {config.video ? (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className="font-semibold text-emerald-400">$</span>
            {Math.round(duration * config.video.coinsPerSecond)}
            <IconCoins className="size-3.5" />
          </span>
        ) : null}
        <div className="flex gap-2">
          <Button
            disabled={submitting}
            onClick={() => setOpen(false)}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={!prompt.trim() || submitting}
            onClick={onSubmit}
            size="sm"
            variant="accent"
          >
            {submitting ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              <IconVideo />
            )}
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
