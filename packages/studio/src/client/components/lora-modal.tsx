"use client";

import {
  IconAlertTriangle,
  IconHelpCircle,
  IconInfoCircle,
} from "@tabler/icons-react";
import Image from "next/image";
import { useState } from "react";
import type { LoraSpec } from "../../config/types";
import { useStudioStore } from "../store/studio-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface LoraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loras: LoraSpec[];
}

export function LoraModal({ open, onOpenChange, loras }: LoraModalProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-2xl"
        // The help-icon tooltip trigger is the first focusable element; the
        // dialog's initial auto-focus would open it, so keep focus on the panel.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* Body remounts on each open so the draft resets from the store. */}
        {open ? (
          <LoraModalBody loras={loras} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LoraModalBody({
  onClose,
  loras,
}: {
  onClose: () => void;
  loras: LoraSpec[];
}) {
  const enabledLoraIds = useStudioStore((state) => state.enabledLoraIds);
  const setEnabledLoraIds = useStudioStore((state) => state.setEnabledLoraIds);
  const [draft, setDraft] = useState<string[]>(enabledLoraIds);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const updateScrollEdges = (el: HTMLDivElement | null) => {
    if (!el) {
      return;
    }
    setAtTop(el.scrollTop <= 0);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  };

  const toggleDraft = (id: string, enabled: boolean) => {
    setDraft((ids) =>
      enabled ? [...ids, id] : ids.filter((loraId) => loraId !== id)
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          Select LoRAs
          <Tooltip>
            <TooltipTrigger
              aria-label="About trigger words"
              className="cursor-help text-muted-foreground"
            >
              <IconHelpCircle className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              A LoRA only affects the image when its trigger words are in the
              prompt — add them to your prompt manually.
            </TooltipContent>
          </Tooltip>
        </DialogTitle>
      </DialogHeader>
      <div
        className="-mr-2 flex max-h-[60vh] min-w-0 flex-col gap-2 overflow-y-auto pr-2"
        onScroll={(event) => updateScrollEdges(event.currentTarget)}
        ref={updateScrollEdges}
        style={{
          maskImage: `linear-gradient(to bottom, ${atTop ? "black" : "transparent"}, black 40px, black calc(100% - 40px), ${atBottom ? "black" : "transparent"})`,
        }}
      >
        {loras.map((lora) => (
          <LoraRow
            enabled={draft.includes(lora.id)}
            key={lora.id}
            lora={lora}
            onToggle={(enabled) => toggleDraft(lora.id, enabled)}
          />
        ))}
      </div>
      {draft.length > 1 ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-400">
          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Enabling multiple LoRAs at once may negatively affect the result.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
          <IconInfoCircle className="mt-0.5 size-3.5 shrink-0" />
          Add a LoRA's trigger words to your prompt to activate it.
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          onClick={() => {
            setEnabledLoraIds(draft);
            onClose();
          }}
        >
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}

function LoraRow({
  lora,
  enabled,
  onToggle,
}: {
  lora: LoraSpec;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
      {lora.thumbnailUrl ? (
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl">
          <Image
            alt={lora.name}
            className="object-cover"
            fill
            sizes="96px"
            src={lora.thumbnailUrl}
            unoptimized
          />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch py-1">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-sm">{lora.name}</p>
          <Switch
            aria-label={`Toggle ${lora.name} LoRA`}
            checked={enabled}
            onCheckedChange={onToggle}
          />
        </div>
        <pre className="flex-1 whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
          {lora.triggerWords}
        </pre>
      </div>
    </div>
  );
}
