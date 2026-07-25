"use client";

import {
  IconAlertTriangle,
  IconClock,
  IconCoins,
  IconCopy,
  IconLoader2,
  IconPhoto,
  IconPhotoPlus,
  IconSparkles,
  IconTrash,
  IconVideo,
  IconWand,
} from "@tabler/icons-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import {
  useDeleteGenerations,
  usePendingDeleteIds,
} from "../hooks/use-delete-generations";
import { copyImage } from "../image-actions";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import type { StudioResult } from "../types";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { cn } from "../ui/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { DeleteGenerationsDialog } from "./delete-generations-dialog";
import { DownloadMediaButton } from "./download-media-button";

interface ResultCardProps {
  result: StudioResult;
  onOpen: () => void;
  priority?: boolean;
}

/** Hover checkbox + copy/download/delete controls over the card image. */
function CardOverlay({ result }: { result: StudioResult }) {
  const selectedIds = useStudioStore((s) => s.selectedIds);
  const toggleSelected = useStudioStore((s) => s.toggleSelected);
  const setReferenceImage = useStudioStore((s) => s.setReferenceImage);
  const setRatio = useStudioStore((s) => s.setRatio);
  const { imageLoader } = useStudioConfig();
  const deleteGenerations = useDeleteGenerations();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selected = selectedIds.includes(result.id);
  const hasImage = result.status === "done" || !result.status;
  const video = result.mediaType === "video";
  const pending =
    result.status === "pending" ||
    result.status === "preparing" ||
    result.status === "queued" ||
    result.status === "finishing";

  const onCopy = async () => {
    try {
      await copyImage(result.src);
      toast.success("Image copied to clipboard");
    } catch {
      toast.error("Couldn't copy image");
    }
  };

  return (
    <>
      {/* Checkbox stays visible on the card's own selection; everything else is
          hover-only. Pending cards aren't selectable — delete-on-pending is a
          cancel, offered only through the trash button. */}
      {!pending && (
        <div
          className={cn(
            "absolute top-2 left-2 rounded-lg border border-border bg-background/90 p-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
            selected && "opacity-100"
          )}
        >
          <Checkbox
            aria-label={selected ? "Deselect image" : "Select image"}
            checked={selected}
            className="size-5"
            onCheckedChange={() => toggleSelected(result.id)}
          />
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-0.5 rounded-lg border border-border bg-background/90 p-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {hasImage && !video && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Use as reference"
                  onClick={() => {
                    setReferenceImage(
                      imageLoader
                        ? imageLoader({
                            src: result.src,
                            width: -1,
                            quality: 100,
                          })
                        : result.src
                    );
                    setRatio(result.ratio);
                    toast.success("Set as reference image");
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <IconPhotoPlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Use as reference</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Copy image"
                  onClick={onCopy}
                  size="icon-sm"
                  variant="ghost"
                >
                  <IconCopy />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy image</TooltipContent>
            </Tooltip>
          </>
        )}
        {hasImage && <DownloadMediaButton result={result} />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={pending ? "Cancel generation" : "Delete image"}
              onClick={() => setConfirmOpen(true)}
              size="icon-sm"
              variant="ghost"
            >
              <IconTrash />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {pending ? "Cancel generation" : "Delete image"}
          </TooltipContent>
        </Tooltip>
      </div>
      <DeleteGenerationsDialog
        count={1}
        modelName={result.title}
        onConfirm={() => deleteGenerations.mutate([result.id])}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={pending}
      />
    </>
  );
}

// In-flight label: "Preparing…" during the prompt pipeline, "Queued…" while
// waiting for a worker, "Generating…" once the RunPod job is submitted,
// "Finishing…" while the result is post-processed and uploaded.
function PendingLabel({ status }: { status: StudioResult["status"] }) {
  if (status === "preparing") {
    return (
      <span className="flex items-center gap-1.5">
        <IconWand className="size-3.5" />
        Preparing…
      </span>
    );
  }
  if (status === "queued") {
    return (
      <span className="flex items-center gap-1.5">
        <IconClock className="size-3.5" />
        Queued…
      </span>
    );
  }
  if (status === "finishing") {
    return (
      <span className="flex items-center gap-1.5">
        <IconSparkles className="size-3.5" />
        Finishing…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <IconPhoto className="size-3.5" />
      Generating…
    </span>
  );
}

export function ResultCard({ result, onOpen, priority }: ResultCardProps) {
  const pending =
    result.status === "pending" ||
    result.status === "preparing" ||
    result.status === "queued" ||
    result.status === "finishing";
  const failed = result.status === "error";
  const blocked = failed && result.errorCode === "content_policy";
  const hasImage = !(pending || failed);
  const deleting = usePendingDeleteIds().has(result.id);
  const { imageLoader } = useStudioConfig();

  return (
    <div
      className={cn(
        "group relative transition-opacity",
        deleting && "pointer-events-none opacity-50 grayscale"
      )}
    >
      <button
        className="flex w-full flex-col gap-2 text-left"
        onClick={onOpen}
        type="button"
      >
        <div
          className={cn(
            "relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-muted",
            pending && "animate-pulse",
            failed && "border-destructive/50"
          )}
        >
          {hasImage &&
            (result.mediaType === "video" ? (
              <>
                <video
                  className="h-full w-full object-cover"
                  loop
                  muted
                  onMouseEnter={(e) => {
                    e.currentTarget.play().catch(() => undefined);
                  }}
                  onMouseLeave={(e) => e.currentTarget.pause()}
                  playsInline
                  preload="metadata"
                  src={result.src}
                />
                <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                  <IconVideo className="size-3" />
                  {result.durationSeconds}s
                </span>
              </>
            ) : (
              <Image
                alt={result.title}
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                fill
                priority={priority}
                quality={60}
                sizes="(max-width: 768px) 100vw, 320px"
                src={result.src}
                {...(imageLoader ? { loader: imageLoader } : {})}
              />
            ))}
          {!hasImage && (
            <div className="flex h-full w-full items-center justify-center">
              {pending ? (
                <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <IconAlertTriangle className="size-6 text-destructive" />
              )}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-0.5 font-semibold text-[15px] leading-tight">
            {result.title}
          </h3>
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            {pending && <PendingLabel status={result.status} />}
            {failed && (
              <span className="text-destructive">
                {blocked ? "Blocked by content policy" : "Failed"}
              </span>
            )}
            {hasImage && (
              <>
                <span className="flex items-center gap-1.5">
                  <IconClock className="size-3.5" />
                  {result.time}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold text-emerald-400">$</span>
                  {result.coins}
                  <IconCoins className="size-3.5" />
                </span>
              </>
            )}
          </div>
        </div>
      </button>
      {!deleting && <CardOverlay result={result} />}
    </div>
  );
}
