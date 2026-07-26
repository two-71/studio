"use client";

import { IconAdjustmentsHorizontal, IconX } from "@tabler/icons-react";
import Image from "next/image";
import { useState } from "react";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { Button } from "../ui/button";
import { STRIPE_BACKGROUND } from "./coming-soon";
import { LoraModal } from "./lora-modal";
import { PanelSection } from "./panel-section";
import { PoseModal } from "./pose-modal";

const UPCOMING_SLOTS = ["upcoming-1", "upcoming-2"];

export function ControlPicker() {
  const config = useStudioConfig();
  const poseImage = useStudioStore((state) => state.poseImage);
  const setPoseImage = useStudioStore((state) => state.setPoseImage);
  const enabledLoraIds = useStudioStore((state) => state.enabledLoraIds);
  const selectedModelIds = useStudioStore((state) => state.selectedModelIds);
  const [modalOpen, setModalOpen] = useState(false);
  const [loraModalOpen, setLoraModalOpen] = useState(false);

  const selectedModels = config.models.filter((model) =>
    selectedModelIds.includes(model.id)
  );
  const poses = selectedModels.flatMap((model) => model.poses ?? []);
  const loras = selectedModels.flatMap((model) => model.loras ?? []);

  return (
    <PanelSection icon={IconAdjustmentsHorizontal} label="Controls">
      <div className="grid grid-cols-4 gap-2">
        <div className="relative">
          <button
            aria-label="Select pose"
            className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-muted/30 transition-colors hover:bg-muted/50"
            onClick={() => setModalOpen(true)}
            type="button"
          >
            {poseImage ? (
              <Image
                alt="Selected pose"
                className="object-cover"
                fill
                sizes="80px"
                src={poseImage}
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                Pose
              </span>
            )}
          </button>
          {poseImage ? (
            <Button
              aria-label="Remove pose"
              className="absolute top-1 right-1"
              onClick={() => setPoseImage(null)}
              size="icon-xs"
              variant="secondary"
            >
              <IconX />
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <button
            aria-label="Select LoRAs"
            className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-muted/30 transition-colors hover:bg-muted/50"
            onClick={() => setLoraModalOpen(true)}
            type="button"
          >
            <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              LoRAs
            </span>
          </button>
          {enabledLoraIds.length > 0 ? (
            <span className="pointer-events-none absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary font-medium text-[10px] text-primary-foreground">
              {enabledLoraIds.length}
            </span>
          ) : null}
        </div>
        {UPCOMING_SLOTS.map((slot) => (
          <div
            className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/30"
            key={slot}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: STRIPE_BACKGROUND }}
            />
            <span className="text-[9px] text-muted-foreground/70 uppercase tracking-widest">
              Soon
            </span>
          </div>
        ))}
      </div>
      <PoseModal onOpenChange={setModalOpen} open={modalOpen} poses={poses} />
      <LoraModal
        loras={loras}
        onOpenChange={setLoraModalOpen}
        open={loraModalOpen}
      />
    </PanelSection>
  );
}
