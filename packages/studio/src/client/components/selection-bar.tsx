"use client";

import { IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useDeleteGenerations } from "../hooks/use-delete-generations";
import { useStudioStore } from "../store/studio-store";
import { Button } from "../ui/button";
import { DeleteGenerationsDialog } from "./delete-generations-dialog";

interface SelectionBarProps {
  /** Ids of every selectable (non-pending) result, for Select all. */
  selectableIds: string[];
}

/** Floating bulk-action bar shown while one or more gallery cards are selected. */
export function SelectionBar({ selectableIds }: SelectionBarProps) {
  const selectedIds = useStudioStore((s) => s.selectedIds);
  const selectAll = useStudioStore((s) => s.selectAll);
  const clearSelection = useStudioStore((s) => s.clearSelection);
  const deleteGenerations = useDeleteGenerations();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-popover py-2.5 pr-2.5 pl-6 shadow-lg">
      <span className="whitespace-nowrap font-semibold text-base">
        {selectedIds.length} selected
      </span>
      <Button
        className="font-semibold text-[15px]"
        onClick={() => selectAll(selectableIds)}
        size="lg"
        variant="ghost"
      >
        Select all
      </Button>
      <Button
        className="text-[15px]"
        onClick={() => setConfirmOpen(true)}
        size="lg"
        variant="destructive"
      >
        <IconTrash />
        Delete selected
      </Button>
      <Button
        aria-label="Clear selection"
        onClick={clearSelection}
        size="icon-lg"
        variant="ghost"
      >
        <IconX />
      </Button>
      <DeleteGenerationsDialog
        count={selectedIds.length}
        onConfirm={() => deleteGenerations.mutate(selectedIds)}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
      />
    </div>
  );
}
