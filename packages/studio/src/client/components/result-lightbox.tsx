"use client";

import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconClock,
  IconCoins,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPhotoPlus,
  IconScan,
  IconTrash,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type CSSProperties, useRef, useState } from "react";
import { ReactCompareSlider } from "react-compare-slider";
import { toast } from "sonner";
import { decodeLoraSelection } from "../../config/lora-selection";
import type { LoraSpec, RatioKey } from "../../config/types";
import { useDeleteGenerations } from "../hooks/use-delete-generations";
import { useGenerations, useLiveResults } from "../hooks/use-generations";
import { copyImage } from "../image-actions";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import type { StudioResult } from "../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { DeleteGenerationsDialog } from "./delete-generations-dialog";
import { DownloadMediaButton } from "./download-media-button";
import { GenerateVideoPanel } from "./generate-video-panel";

/** Intrinsic dimensions per aspect ratio so the image renders at its true shape. */
const RATIO_DIMS: Record<RatioKey, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "4:3": { w: 1024, h: 768 },
  "3:4": { w: 768, h: 1024 },
  "21:9": { w: 1280, h: 548 },
};

const IMAGE_SIZES = "(max-width: 1024px) 100vw, 60vw";
const SWIPE_THRESHOLD_PX = 48;
const RATIO_PRECISION = 4;

function isDone(result: StudioResult): boolean {
  return !result.status || result.status === "done";
}

function isVideo(result: StudioResult): boolean {
  return result.mediaType === "video";
}

/**
 * Sizes the frame to the result's exact aspect ratio while fitting the stage
 * (a `container-type: size` box) in both dimensions — any ratio letterboxes
 * cleanly without fixed vh caps.
 */
function frameStyle(ratio: RatioKey): CSSProperties {
  const { w, h } = RATIO_DIMS[ratio];
  return {
    aspectRatio: `${w} / ${h}`,
    width: `min(100cqw, calc(100cqh * ${(w / h).toFixed(RATIO_PRECISION)}))`,
  };
}

function StageImage({ result }: { result: StudioResult }) {
  const [loaded, setLoaded] = useState(false);
  const { imageLoader } = useStudioConfig();

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={frameStyle(result.ratio)}
    >
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      <Image
        alt={result.title}
        className={cn("object-contain", !loaded && "opacity-0")}
        fill
        onLoad={() => setLoaded(true)}
        priority
        quality={100}
        sizes={IMAGE_SIZES}
        src={result.src}
        {...(imageLoader ? { loader: imageLoader } : {})}
      />
    </div>
  );
}

function StageVideo({ result }: { result: StudioResult }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={frameStyle(result.ratio)}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: generated video, no captions exist */}
      <video
        autoPlay
        className="h-full w-full object-contain"
        controls
        loop
        playsInline
        src={result.src}
      />
    </div>
  );
}

interface CompareSource {
  key: "reference" | "pose";
  label: string;
  src: string;
}

function compareSources(result: StudioResult): CompareSource[] {
  const sources: CompareSource[] = [];
  if (result.referenceImageUrl) {
    sources.push({
      key: "reference",
      label: "Reference",
      src: result.referenceImageUrl,
    });
  }
  if (result.pose) {
    sources.push({ key: "pose", label: "Pose", src: result.pose });
  }
  return sources;
}

/**
 * Before/after wipe between a control input (left of the divider, letterboxed
 * at its own aspect ratio on black) and the generated image (right). Touch
 * events stay inside so dragging the divider doesn't trigger swipe navigation.
 * Remote control images resize at Cloudflare's edge; bundled preset paths
 * (relative, which cdnImageLoader can't parse) use Next's optimizer instead.
 */
function CompareStage({
  result,
  source,
}: {
  result: StudioResult;
  source: CompareSource;
}) {
  const isRemote = source.src.startsWith("https://");
  const [loaded, setLoaded] = useState(false);
  const { imageLoader } = useStudioConfig();
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={frameStyle(result.ratio)}
    >
      <ReactCompareSlider
        className="h-full w-full"
        defaultPosition={50}
        handle={
          <div className="h-full w-0.5 cursor-ew-resize bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] [pointer-events:auto]" />
        }
        itemOne={
          <div className="relative h-full w-full overflow-hidden bg-black">
            {/* Generated image is already in cache — blurred stand-in until the
                control image arrives, instead of a black box. */}
            {!loaded && (
              <Image
                alt=""
                aria-hidden
                className="scale-105 object-contain opacity-50 blur-md"
                fill
                quality={100}
                sizes={IMAGE_SIZES}
                src={result.src}
                {...(imageLoader ? { loader: imageLoader } : {})}
              />
            )}
            <Image
              alt={source.label}
              className={cn(
                "object-contain transition-opacity duration-300",
                !loaded && "opacity-0"
              )}
              fill
              onLoad={() => setLoaded(true)}
              quality={100}
              sizes={IMAGE_SIZES}
              src={source.src}
              {...(isRemote && imageLoader ? { loader: imageLoader } : {})}
            />
          </div>
        }
        itemTwo={
          <div className="relative h-full w-full">
            <Image
              alt={result.title}
              className="object-contain"
              fill
              priority
              quality={100}
              sizes={IMAGE_SIZES}
              src={result.src}
              {...(imageLoader ? { loader: imageLoader } : {})}
            />
          </div>
        }
      />
    </div>
  );
}

// In-flight label mirroring the gallery card's phases.
function stageLabel(status: StudioResult["status"]): string {
  if (status === "preparing") {
    return "Preparing…";
  }
  if (status === "queued") {
    return "Queued…";
  }
  if (status === "finishing") {
    return "Finishing…";
  }
  return "Generating…";
}

function StageFrame({ result }: { result: StudioResult }) {
  if (
    result.status === "pending" ||
    result.status === "preparing" ||
    result.status === "queued" ||
    result.status === "finishing"
  ) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl"
        style={frameStyle(result.ratio)}
      >
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <IconLoader2 className="size-6 animate-spin" />
          <span className="text-[13px]">{stageLabel(result.status)}</span>
        </div>
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5"
        style={frameStyle(result.ratio)}
      >
        <IconAlertTriangle className="size-7 text-destructive" />
        <span className="text-[13px] text-muted-foreground">
          {result.errorCode === "content_policy"
            ? "Blocked by content policy"
            : "Generation failed"}
        </span>
      </div>
    );
  }

  if (isVideo(result)) {
    return <StageVideo key={result.id} result={result} />;
  }
  return <StageImage key={result.id} result={result} />;
}

/** Warms the browser cache for a control input so compare mode opens instantly. */
function PreloadControl({ src }: { src: string }) {
  const isRemote = src.startsWith("https://");
  const { imageLoader } = useStudioConfig();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
    >
      <Image
        alt=""
        fill
        quality={100}
        sizes={IMAGE_SIZES}
        src={src}
        {...(isRemote && imageLoader ? { loader: imageLoader } : {})}
      />
    </div>
  );
}

/** Warms the browser cache for an adjacent result so prev/next feels instant. */
function PreloadImage({ result }: { result: StudioResult }) {
  const { imageLoader } = useStudioConfig();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
    >
      <Image
        alt=""
        fill
        priority
        quality={100}
        sizes={IMAGE_SIZES}
        src={result.src}
        {...(imageLoader ? { loader: imageLoader } : {})}
      />
    </div>
  );
}

function InfoActions({
  result,
  onDelete,
}: {
  result: StudioResult;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setReferenceImage = useStudioStore((s) => s.setReferenceImage);
  const setRatio = useStudioStore((s) => s.setRatio);
  const { imageLoader } = useStudioConfig();
  const hasImage = isDone(result) && result.src !== "";
  const video = isVideo(result);
  const deletable = isDone(result) || result.status === "error";

  const onCopy = async () => {
    try {
      await copyImage(result.src);
      toast.success("Image copied to clipboard");
    } catch {
      toast.error("Couldn't copy image");
    }
  };

  return (
    <div className="flex gap-1">
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
      {deletable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Delete image"
              onClick={() => setConfirmOpen(true)}
              size="icon-sm"
              variant="ghost"
            >
              <IconTrash />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete image</TooltipContent>
        </Tooltip>
      )}
      <DeleteGenerationsDialog
        count={1}
        modelName={result.title}
        onConfirm={onDelete}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
      />
    </div>
  );
}

// Persisted values are "id" or "id@strength"; the badge shows the name plus
// the custom weight when one was set.
function loraLabel(value: string, loras: LoraSpec[]): string {
  const { id, strength } = decodeLoraSelection(value);
  const name = loras.find((lora) => lora.id === id)?.name ?? id;
  return strength === undefined ? name : `${name} (${strength})`;
}

/**
 * 1:1 thumbnail of a control input (reference/pose). Opens the full image in a
 * new tab. R2 URLs resize at Cloudflare's edge; a bundled preset path (relative,
 * which cdnImageLoader can't parse) goes through Next's optimizer instead.
 * Rests dimmed with the label centered on top; hovering clears both.
 */
function ControlThumb({ label, src }: { label: string; src: string }) {
  const isRemote = src.startsWith("https://");
  const { imageLoader } = useStudioConfig();
  return (
    <a
      className="group relative block size-20 overflow-hidden rounded-xl border border-border bg-muted/30"
      href={src}
      rel="noopener"
      target="_blank"
    >
      <Image
        alt={label}
        className="object-cover brightness-50 transition-[filter] duration-300 group-hover:brightness-100"
        fill
        sizes="80px"
        src={src}
        {...(isRemote && imageLoader ? { loader: imageLoader } : {})}
      />
      <span className="absolute inset-0 flex items-center justify-center font-medium text-[12px] text-white transition-opacity duration-300 group-hover:opacity-0">
        {label}
      </span>
    </a>
  );
}

/**
 * 1:1 thumbnail of the source image generation a video animates. Clicking
 * jumps the lightbox to that generation instead of opening a new tab.
 */
function SourceThumb({ onOpen, src }: { onOpen: () => void; src: string }) {
  const { imageLoader } = useStudioConfig();
  return (
    <button
      className="group relative block size-20 overflow-hidden rounded-xl border border-border bg-muted/30"
      onClick={onOpen}
      type="button"
    >
      <Image
        alt="Source image"
        className="object-cover brightness-50 transition-[filter] duration-300 group-hover:brightness-100"
        fill
        sizes="80px"
        src={src}
        {...(imageLoader ? { loader: imageLoader } : {})}
      />
      <span className="absolute inset-0 flex items-center justify-center font-medium text-[12px] text-white transition-opacity duration-300 group-hover:opacity-0">
        Source
      </span>
    </button>
  );
}

function InfoDetails({ result }: { result: StudioResult }) {
  const { data } = useGenerations();
  const config = useStudioConfig();
  const setLightboxId = useStudioStore((s) => s.setLightboxId);
  const allLoras = config.models.flatMap((model) => model.loras ?? []);
  // The source image the video animates, when it's still in the gallery
  // (hidden if the source was deleted).
  const source = result.sourceGenerationId
    ? data?.results.find((r) => r.id === result.sourceGenerationId && r.src)
    : undefined;

  const onCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(result.prompt);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Couldn't copy prompt");
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <IconClock className="size-3.5" />
          {isDone(result) ? result.time : "—"}
        </span>
        {config.features.billing && (
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-emerald-400">$</span>
            {result.coins || "—"}
            <IconCoins className="size-3.5" />
          </span>
        )}
        <Badge variant="secondary">{result.ratio}</Badge>
        <Badge variant="secondary">{result.resolution}</Badge>
        {result.durationSeconds !== undefined && (
          <Badge variant="secondary">{result.durationSeconds}s</Badge>
        )}
        {result.seed !== undefined && (
          <Badge variant="secondary">
            Seed: {result.seed === -1 ? "Random" : result.seed}
          </Badge>
        )}
        {result.enhanced && (
          <Badge variant="secondary">
            <IconWand />
            Enhanced
          </Badge>
        )}
        {result.loras?.map((value) => (
          <Badge key={value} variant="secondary">
            LoRA: {loraLabel(value, allLoras)}
          </Badge>
        ))}
      </div>
      {result.status === "error" && (
        <p className="mt-3 text-[13px] text-destructive">
          Something went wrong during generation.
        </p>
      )}
      {(result.referenceImageUrl || result.pose || source) && (
        <div className="mt-3 flex gap-2">
          {result.referenceImageUrl && (
            <ControlThumb label="Reference" src={result.referenceImageUrl} />
          )}
          {result.pose && <ControlThumb label="Pose" src={result.pose} />}
          {source && (
            <SourceThumb
              onOpen={() => setLightboxId(source.id)}
              src={source.src}
            />
          )}
        </div>
      )}
      <div className="relative mt-3 min-h-0 flex-1 rounded-xl bg-muted/50">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Copy prompt"
              className="absolute top-2 right-2 z-10"
              onClick={onCopyPrompt}
              size="icon-sm"
              variant="ghost"
            >
              <IconCopy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy prompt</TooltipContent>
        </Tooltip>
        <p className="h-full overflow-y-auto whitespace-pre-wrap px-4 py-2 text-justify text-[15px] text-muted-foreground leading-relaxed">
          <span aria-hidden className="float-right size-8" />
          {result.prompt}
        </p>
      </div>
      {isDone(result) && !isVideo(result) && result.src !== "" && (
        <GenerateVideoPanel result={result} />
      )}
    </>
  );
}

/** Bottom sheet resting as a peek bar; tap or swipe the header to expand. */
function MobileSheet({
  result,
  onDelete,
}: {
  result: StudioResult;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) {
      return;
    }
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (dy < -SWIPE_THRESHOLD_PX) {
      setExpanded(true);
    } else if (dy > SWIPE_THRESHOLD_PX) {
      setExpanded(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-border border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div onTouchEnd={onTouchEnd} onTouchStart={onTouchStart}>
        <button
          aria-expanded={expanded}
          aria-label="Toggle details"
          className="flex w-full flex-col items-center pt-2.5"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <span className="h-1 w-10 rounded-full bg-muted" />
        </button>
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <button
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setExpanded((v) => !v)}
            type="button"
          >
            <h2 className="truncate font-semibold text-base">{result.title}</h2>
            <IconChevronUp
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
          <InfoActions onDelete={onDelete} result={result} />
        </div>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex max-h-[45dvh] flex-col overflow-y-auto px-5 pb-5">
            <InfoDetails result={result} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResultLightbox() {
  const results = useLiveResults();
  const lightboxId = useStudioStore((s) => s.lightboxId);
  const closeLightbox = useStudioStore((s) => s.closeLightbox);
  const setLightboxId = useStudioStore((s) => s.setLightboxId);
  const deleteGenerations = useDeleteGenerations();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  const [compareKey, setCompareKey] =
    useState<CompareSource["key"]>("reference");

  // Compare mode belongs to the image being viewed, so drop it whenever the
  // lightbox moves to a sibling or closes — however it closed.
  const [prevLightboxId, setPrevLightboxId] = useState(lightboxId);
  if (prevLightboxId !== lightboxId) {
    setPrevLightboxId(lightboxId);
    setCompareOn(false);
    setCompareKey("reference");
  }

  const open = lightboxId !== null;
  const count = results.length;
  const currentIndex = results.findIndex((result) => result.id === lightboxId);
  const current = currentIndex === -1 ? null : results[currentIndex];
  const hasSiblings = count > 1 && currentIndex !== -1;

  const sources = current ? compareSources(current) : [];
  const activeSource = sources.find((s) => s.key === compareKey) ?? sources[0];
  const canCompare =
    current !== null &&
    isDone(current) &&
    current.src !== "" &&
    activeSource !== undefined;
  const comparing = compareOn && canCompare;

  const step = (dir: 1 | -1) => {
    if (!hasSiblings) {
      return;
    }
    setLightboxId(results[(currentIndex + dir + count) % count].id);
  };

  // Advance to the next image before deleting so the lightbox stays open on a
  // sibling; with no siblings the mutation's onSuccess closes it.
  const deleteCurrent = () => {
    if (!current) {
      return;
    }
    if (hasSiblings) {
      step(1);
    }
    deleteGenerations.mutate([current.id]);
  };

  const preloadTargets = hasSiblings
    ? [
        ...new Set([
          (currentIndex + 1) % count,
          (currentIndex - 1 + count) % count,
        ]),
      ]
        .map((i) => results[i])
        .filter((r) => isDone(r) && r.src && !isVideo(r))
    : [];

  const onStageTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onStageTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) {
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1);
    }
  };

  return (
    <DialogPrimitive.Root
      onOpenChange={(next) => {
        if (!next) {
          closeLightbox();
        }
      }}
      open={open}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-black/90 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 flex outline-none data-closed:animate-out data-open:animate-in"
          onClick={(e) => {
            if (
              e.target instanceof HTMLElement &&
              e.target.dataset.lightboxBackdrop !== undefined
            ) {
              closeLightbox();
            }
          }}
          onKeyDown={(e) => {
            // While comparing, arrow keys belong to the slider handle.
            if (comparing) {
              return;
            }
            // Arrow keys inside text fields move the caret, not the image.
            if (
              e.target instanceof HTMLElement &&
              (e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLInputElement ||
                e.target.isContentEditable)
            ) {
              return;
            }
            if (e.key === "ArrowLeft") {
              step(-1);
            }
            if (e.key === "ArrowRight") {
              step(1);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {current?.title ?? "Image preview"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Generated image details
          </DialogPrimitive.Description>

          {current ? (
            <>
              <div
                className="relative flex min-w-0 flex-1 flex-col"
                onTouchEnd={onStageTouchEnd}
                onTouchStart={onStageTouchStart}
              >
                <div
                  className="min-h-0 flex-1 px-4 pt-16 pb-32 sm:px-8 lg:p-12"
                  data-lightbox-backdrop
                >
                  <div className="relative h-full w-full [container-type:size]">
                    <div
                      className="flex h-full w-full items-center justify-center"
                      data-lightbox-backdrop
                    >
                      {comparing && activeSource ? (
                        <CompareStage
                          key={`${current.id}-${activeSource.key}`}
                          result={current}
                          source={activeSource}
                        />
                      ) : (
                        <StageFrame result={current} />
                      )}
                    </div>
                    {preloadTargets.map((r) => (
                      <PreloadImage key={r.id} result={r} />
                    ))}
                    {canCompare &&
                      sources.map((s) => (
                        <PreloadControl key={s.key} src={s.src} />
                      ))}
                  </div>
                </div>

                <Button
                  aria-label="Close"
                  className="absolute top-4 left-4 z-10 rounded-full border-border bg-background/40 backdrop-blur hover:bg-background/70 lg:right-4 lg:left-auto"
                  onClick={closeLightbox}
                  size="icon"
                  variant="outline"
                >
                  <IconX />
                </Button>

                {isDone(current) && current.src !== "" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        asChild
                        className="absolute top-4 right-4 z-10 rounded-full border-border bg-background/40 backdrop-blur hover:bg-background/70 lg:right-16"
                        size="icon"
                        variant="outline"
                      >
                        <a
                          aria-label="Open original"
                          href={current.src}
                          rel="noopener"
                          target="_blank"
                        >
                          <IconExternalLink />
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open original</TooltipContent>
                  </Tooltip>
                )}

                {canCompare && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Compare with input"
                        aria-pressed={comparing}
                        className={cn(
                          "absolute top-4 right-16 z-10 rounded-full border-border bg-background/40 backdrop-blur hover:bg-background/70 lg:right-28",
                          comparing &&
                            "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                        )}
                        onClick={() => setCompareOn((v) => !v)}
                        size="icon"
                        variant="outline"
                      >
                        <IconScan className="rotate-90" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Compare with input</TooltipContent>
                  </Tooltip>
                )}

                {comparing && sources.length > 1 && (
                  <div className="absolute top-16 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-full bg-background/40 p-1 backdrop-blur lg:top-4">
                    {sources.map((s) => (
                      <button
                        className={cn(
                          "rounded-full px-3 py-1 text-[13px] transition-colors",
                          s.key === activeSource?.key
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        key={s.key}
                        onClick={() => setCompareKey(s.key)}
                        type="button"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}

                {hasSiblings && (
                  <>
                    <span className="absolute top-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/40 px-2.5 py-1 text-[13px] text-muted-foreground backdrop-blur lg:top-auto lg:bottom-4">
                      {currentIndex + 1} / {count}
                    </span>
                    <Button
                      aria-label="Previous"
                      className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full border-border bg-background/40 backdrop-blur hover:bg-background/70 active:-translate-y-1/2! sm:left-4"
                      onClick={() => step(-1)}
                      size="icon-lg"
                      variant="outline"
                    >
                      <IconChevronLeft />
                    </Button>
                    <Button
                      aria-label="Next"
                      className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full border-border bg-background/40 backdrop-blur hover:bg-background/70 active:-translate-y-1/2! sm:right-4"
                      onClick={() => step(1)}
                      size="icon-lg"
                      variant="outline"
                    >
                      <IconChevronRight />
                    </Button>
                  </>
                )}

                <MobileSheet onDelete={deleteCurrent} result={current} />
              </div>

              <aside className="hidden w-[380px] shrink-0 flex-col border-border border-l bg-card p-6 lg:flex">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-xl">{current.title}</h2>
                  <InfoActions onDelete={deleteCurrent} result={current} />
                </div>
                <InfoDetails result={current} />
              </aside>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
