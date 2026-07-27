"use client";

import {
  IconAlertTriangle,
  IconCopy,
  IconHelpCircle,
  IconInfoCircle,
  IconSearch,
} from "@tabler/icons-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import {
  defaultLoraStrength,
  type LoraSelection,
} from "../../config/lora-selection";
import type { LoraSpec } from "../../config/types";
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
import { Slider } from "../ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

// Above this many enabled LoRAs the dialog warns that results may degrade.
const LORA_WARNING_THRESHOLD = 3;

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
        // Fixed height so toggling LoRAs (and their trigger-word rows) never
        // resizes the dialog.
        className="flex h-[min(85svh,44rem)] flex-col sm:max-w-3xl"
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
  const enabledLoras = useStudioStore((state) => state.enabledLoras);
  const setEnabledLoras = useStudioStore((state) => state.setEnabledLoras);
  const [draft, setDraft] = useState<LoraSelection[]>(enabledLoras);
  const [query, setQuery] = useState("");
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const updateScrollEdges = (el: HTMLDivElement | null) => {
    if (!el) {
      return;
    }
    setAtTop(el.scrollTop <= 0);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  };

  const toggleDraft = (id: string) => {
    setDraft((selections) =>
      selections.some((selection) => selection.id === id)
        ? selections.filter((selection) => selection.id !== id)
        : [...selections, { id }]
    );
  };

  const setStrength = (id: string, strength: number) => {
    setDraft((selections) =>
      selections.map((selection) =>
        selection.id === id ? { ...selection, strength } : selection
      )
    );
  };

  // Draft order (= click order) with each selection's spec resolved.
  const enabled = draft.flatMap((selection) => {
    const lora = loras.find((spec) => spec.id === selection.id);
    return lora ? [{ selection, lora }] : [];
  });

  const search = query.trim().toLowerCase();
  const visibleLoras = search
    ? loras.filter(
        (lora) =>
          lora.name.toLowerCase().includes(search) ||
          lora.triggerWords?.toLowerCase().includes(search)
      )
    : loras;

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
              prompt — add them manually, or let Prompt enhancement add them for
              you.
            </TooltipContent>
          </Tooltip>
        </DialogTitle>
      </DialogHeader>
      <div className="relative shrink-0">
        <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-xl border border-input bg-input/30 py-2 pr-3 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search LoRAs…"
          type="text"
          value={query}
        />
      </div>
      <div
        className="-mr-2 grid min-h-0 min-w-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto pr-2 sm:grid-cols-5"
        onScroll={(event) => updateScrollEdges(event.currentTarget)}
        ref={updateScrollEdges}
        style={{
          maskImage: `linear-gradient(to bottom, ${atTop ? "black" : "transparent"}, black 40px, black calc(100% - 40px), ${atBottom ? "black" : "transparent"})`,
        }}
      >
        {visibleLoras.map((lora) => (
          <LoraTile
            enabled={draft.some((selection) => selection.id === lora.id)}
            key={lora.id}
            lora={lora}
            onToggle={() => toggleDraft(lora.id)}
          />
        ))}
        {visibleLoras.length === 0 ? (
          <p className="col-span-full py-8 text-center text-muted-foreground text-xs">
            No LoRAs found
          </p>
        ) : null}
      </div>
      {/* Fixed height (always rendered) so selections never resize the dialog. */}
      <div className="flex h-40 shrink-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-muted/30 p-3">
        {enabled.length > 0 ? (
          <>
            <p className="font-medium text-muted-foreground text-xs">
              Enabled ({enabled.length})
            </p>
            {enabled.map(({ selection, lora }) => (
              <EnabledLoraRow
                key={lora.id}
                lora={lora}
                onStrengthChange={(strength) => setStrength(lora.id, strength)}
                strength={selection.strength ?? defaultLoraStrength(lora)}
              />
            ))}
          </>
        ) : (
          <p className="m-auto text-muted-foreground text-xs">
            No LoRAs enabled
          </p>
        )}
      </div>
      {draft.length > LORA_WARNING_THRESHOLD ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-400">
          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Enabling more than {LORA_WARNING_THRESHOLD} LoRAs at once may
          negatively affect the result.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
          <IconInfoCircle className="mt-0.5 size-3.5 shrink-0" />
          Add a LoRA's trigger words to your prompt to activate it — Prompt
          enhancement adds them automatically.
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          onClick={() => {
            setEnabledLoras(draft);
            onClose();
          }}
        >
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}

function LoraTile({
  lora,
  enabled,
  onToggle,
}: {
  lora: LoraSpec;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={`Toggle ${lora.name} LoRA`}
      aria-pressed={enabled}
      className={cn(
        // The square comes from percentage padding rather than aspect-square:
        // a grid item's aspect ratio doesn't feed row sizing, so the ratio
        // version overflowed its row and tiles overlapped.
        "group relative w-full cursor-pointer overflow-hidden rounded-2xl border bg-muted/30 pt-[100%] transition-colors",
        enabled
          ? "border-primary/50"
          : "border-border hover:border-muted-foreground/40"
      )}
      onClick={onToggle}
      type="button"
    >
      {lora.thumbnailUrl ? (
        <>
          <Image
            alt={lora.name}
            className="object-cover"
            fill
            sizes="140px"
            src={lora.thumbnailUrl}
            unoptimized
          />
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {lora.name}
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-1.5 text-center">
          <span className="line-clamp-3 break-words text-muted-foreground text-xs">
            {lora.name}
          </span>
        </span>
      )}
      {/* An inset ring on the button itself paints under the thumbnail, so it
          reads thinner on tiles that have one — draw it over the content. */}
      {enabled ? (
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary ring-inset" />
      ) : null}
    </button>
  );
}

function EnabledLoraRow({
  lora,
  strength,
  onStrengthChange,
}: {
  lora: LoraSpec;
  strength: number;
  onStrengthChange: (strength: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-medium text-sm">
          {lora.name}
        </p>
        {lora.strengthRange ? (
          <>
            <Slider
              className="w-32 sm:w-44"
              max={lora.strengthRange.max}
              min={lora.strengthRange.min}
              onValueChange={([value]) => {
                if (value !== undefined) {
                  onStrengthChange(value);
                }
              }}
              step={lora.strengthRange.step}
              value={[strength]}
            />
            <span className="w-10 text-right text-muted-foreground text-xs tabular-nums">
              {strength}
            </span>
          </>
        ) : null}
      </div>
      {lora.triggerWords ? (
        <div className="relative rounded-md bg-muted/50">
          <pre className="whitespace-pre-wrap break-words px-2 py-1 pr-7 text-[11px] text-muted-foreground">
            {lora.triggerWords}
          </pre>
          <button
            aria-label={`Copy ${lora.name} trigger words`}
            className="absolute top-1 right-1 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lora.triggerWords ?? "");
                toast.success("Trigger words copied to clipboard");
              } catch {
                toast.error("Couldn't copy trigger words");
              }
            }}
            type="button"
          >
            <IconCopy className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
