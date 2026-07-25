"use client";

import { IconCheck, IconPlus } from "@tabler/icons-react";
import Image from "next/image";
import { useRef, useState } from "react";
import type { PoseSpec } from "../../config/types";
import { useStudioStore } from "../store/studio-store";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface PoseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poses: PoseSpec[];
}

export function PoseModal({ open, onOpenChange, poses }: PoseModalProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        {/* Body remounts on each open so the draft resets from the store. */}
        {open ? (
          <PoseModalBody onClose={() => onOpenChange(false)} poses={poses} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PoseModalBody({
  onClose,
  poses,
}: {
  onClose: () => void;
  poses: PoseSpec[];
}) {
  const poseImage = useStudioStore((state) => state.poseImage);
  const setPoseImage = useStudioStore((state) => state.setPoseImage);
  const [draft, setDraft] = useState<string | null>(poseImage);
  const presetImages = poses.map((pose) => pose.controlImageUrl);
  // The uploaded pose keeps its own slot so its tile stays in place when the
  // user selects a preset or replaces it with a new upload.
  const [uploadedImage, setUploadedImage] = useState<string | null>(
    poseImage && !presetImages.includes(poseImage) ? poseImage : null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setUploadedImage(reader.result);
        setDraft(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Select a pose</DialogTitle>
      </DialogHeader>
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
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <button
          aria-label="Upload a pose image"
          className="flex aspect-square cursor-pointer items-center justify-center rounded-2xl border border-border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <IconPlus className="size-5" />
        </button>
        {uploadedImage ? (
          <PoseTile
            onSelect={setDraft}
            selected={draft === uploadedImage}
            src={uploadedImage}
          />
        ) : null}
        {poses.map((pose) => (
          <PoseTile
            key={pose.id}
            onSelect={setDraft}
            selected={draft === pose.controlImageUrl}
            src={pose.controlImageUrl}
            thumbnailSrc={pose.thumbnailUrl}
          />
        ))}
      </div>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          onClick={() => {
            setPoseImage(draft);
            onClose();
          }}
        >
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}

function PoseTile({
  src,
  thumbnailSrc,
  selected,
  onSelect,
}: {
  src: string;
  thumbnailSrc?: string;
  selected: boolean;
  onSelect: (src: string | null) => void;
}) {
  return (
    <button
      aria-label="Pose option"
      aria-pressed={selected}
      className={cn(
        "relative aspect-square cursor-pointer overflow-hidden rounded-2xl border transition-colors",
        selected
          ? "border-primary/50 ring-2 ring-primary/50"
          : "border-border hover:border-muted-foreground/40"
      )}
      onClick={() => onSelect(selected ? null : src)}
      type="button"
    >
      <Image
        alt="Pose"
        className="object-cover"
        fill
        sizes="120px"
        src={thumbnailSrc ?? src}
        unoptimized
      />
      {selected ? (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <IconCheck className="size-3.5" />
        </span>
      ) : null}
    </button>
  );
}
