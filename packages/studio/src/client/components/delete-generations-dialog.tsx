"use client";

import { IconTrash } from "@tabler/icons-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface DeleteGenerationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** How many images the confirm deletes; drives singular/plural copy. */
  count: number;
  /** Model name shown in the single-image copy, e.g. "Nano Banana 2". */
  modelName?: string;
  /** Still generating: the confirm cancels the run instead of deleting an image. */
  pending?: boolean;
}

/** Confirmation for deleting one image (from a card / the lightbox) or a bulk selection. */
export function DeleteGenerationsDialog({
  open,
  onOpenChange,
  onConfirm,
  count,
  modelName,
  pending,
}: DeleteGenerationsDialogProps) {
  const single = count === 1;

  if (pending) {
    return (
      <AlertDialog onOpenChange={onOpenChange} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel generation</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will stop this generation${modelName ? ` on ${modelName}` : ""} and refund its cost.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep generating</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} variant="destructive">
              <IconTrash />
              Cancel generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single ? "Delete image" : `Delete ${count} selected images`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {single
              ? `This will permanently delete this image${modelName ? ` from ${modelName}` : ""}. This action cannot be undone.`
              : `Are you sure you want to delete ${count} selected images? This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="destructive">
            <IconTrash />
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
