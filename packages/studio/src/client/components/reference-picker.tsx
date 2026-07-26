"use client";

import { IconPhoto, IconPlus, IconX } from "@tabler/icons-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_CONTROL_IMAGE_BYTES, nearestRatio } from "../constants";
import { useStudioStore } from "../store/studio-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { PanelSection } from "./panel-section";

export function ReferencePicker() {
  const referenceImage = useStudioStore((state) => state.referenceImage);
  const referenceImageOversized = useStudioStore(
    (state) => state.referenceImageOversized
  );
  const setReferenceImage = useStudioStore((state) => state.setReferenceImage);
  const setRatio = useStudioStore((state) => state.setRatio);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be used as a reference");
      return;
    }
    const oversized = file.size > MAX_CONTROL_IMAGE_BYTES;
    if (oversized) {
      toast.error("Reference image is too large — max 7 MB");
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }
      const dataUrl = reader.result;
      // The workflow shapes its output after the reference, so mirror that in
      // the ratio state (snapped to the nearest supported preset) rather than
      // keeping a stale hand-picked value.
      const probe = new window.Image();
      probe.onload = () => {
        setRatio(nearestRatio(probe.naturalWidth, probe.naturalHeight));
        setReferenceImage(dataUrl, oversized);
      };
      probe.onerror = () => setReferenceImage(dataUrl, oversized);
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <PanelSection
      action={
        <Button
          aria-label="Add reference"
          onClick={() => inputRef.current?.click()}
          size="icon-xs"
        >
          <IconPlus />
        </Button>
      }
      icon={IconPhoto}
      label="References"
    >
      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop zone is a pointer-only enhancement; keyboard users pick files via the buttons */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same as above */}
      <div
        className={`rounded-2xl ${isDragging ? "ring ring-primary" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFile(event.dataTransfer.files[0]);
        }}
      >
        {referenceImage ? (
          <div
            className={`relative overflow-hidden rounded-2xl bg-muted/30 ${
              referenceImageOversized
                ? "border border-red-800"
                : "border border-border"
            }`}
          >
            <Dialog>
              <DialogTrigger asChild>
                <button
                  aria-label="Enlarge reference"
                  className="relative block h-24 w-full cursor-zoom-in"
                  type="button"
                >
                  <Image
                    alt="Reference"
                    className="object-cover"
                    fill
                    src={referenceImage}
                    unoptimized
                  />
                  {referenceImageOversized && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-950/60">
                      <p className="px-2 text-center font-medium text-[10px] text-red-200">
                        Too large — max 7 MB
                      </p>
                    </div>
                  )}
                </button>
              </DialogTrigger>
              <DialogContent
                aria-describedby={undefined}
                className="sm:max-w-2xl"
              >
                <DialogTitle className="sr-only">Reference image</DialogTitle>
                <Image
                  alt="Reference"
                  className="h-auto max-h-[80vh] w-full rounded-2xl object-contain"
                  height={0}
                  sizes="100vw"
                  src={referenceImage}
                  unoptimized
                  width={0}
                />
              </DialogContent>
            </Dialog>
            <Button
              aria-label="Remove reference"
              className="absolute top-1.5 right-1.5"
              onClick={() => setReferenceImage(null)}
              size="icon-xs"
              variant="secondary"
            >
              <IconX />
            </Button>
          </div>
        ) : (
          <button
            className="w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-muted/30"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <div className="flex items-center justify-center gap-3.5 px-4 py-3 text-center">
              <p className="whitespace-nowrap text-[10px] text-muted-foreground">
                {isDragging ? "Drop to set reference" : "Add a reference image"}
              </p>
            </div>
          </button>
        )}
      </div>
    </PanelSection>
  );
}
