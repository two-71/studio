"use client";

import {
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useStudioStore, useStudioStoreApi } from "../store/studio-store";
import { useStudioHttp } from "../studio-http-context";
import { GENERATIONS_QUERY_KEY, type GenerationsData } from "./use-generations";

const DELETE_GENERATIONS_MUTATION_KEY = ["delete-generations"];

// Soft-deletes generations on the server, then drops them from the gallery
// cache. Clears any selection and closes the lightbox if its image was among
// the deleted. A loading toast appears as soon as the request starts and
// morphs into the success/error state when it settles.
export function useDeleteGenerations() {
  const http = useStudioHttp();
  const queryClient = useQueryClient();
  const clearSelection = useStudioStore((s) => s.clearSelection);
  const closeLightbox = useStudioStore((s) => s.closeLightbox);
  const storeApi = useStudioStoreApi();

  return useMutation({
    mutationKey: DELETE_GENERATIONS_MUTATION_KEY,
    mutationFn: async (ids: string[]) => {
      const { deletedIds } = await http
        .delete("generations", { json: { ids } })
        .json<{ deletedIds: string[] }>();
      return deletedIds;
    },
    onMutate: (ids) => ({
      toastId: toast.loading(
        ids.length === 1 ? "Deleting image…" : `Deleting ${ids.length} images…`
      ),
    }),
    onSuccess: (deletedIds, _ids, context) => {
      queryClient.setQueryData<GenerationsData>(
        GENERATIONS_QUERY_KEY,
        (old) =>
          old && {
            ...old,
            results: old.results.filter(
              (result) => !deletedIds.includes(result.id)
            ),
          }
      );
      clearSelection();
      const { lightboxId } = storeApi.getState();
      if (lightboxId && deletedIds.includes(lightboxId)) {
        closeLightbox();
      }
      toast.success(
        deletedIds.length === 1
          ? "Image deleted"
          : `${deletedIds.length} images deleted`,
        { id: context.toastId }
      );
    },
    onError: (_error, _ids, context) => {
      toast.error("Couldn't delete — please try again", {
        id: context?.toastId,
      });
    },
  });
}

// Ids of generations with an in-flight delete, so the gallery can gray them
// out. Derived from pending mutation state — clears itself when the request
// settles (including on error, un-graying the cards).
export function usePendingDeleteIds(): Set<string> {
  const pending = useMutationState({
    filters: {
      mutationKey: DELETE_GENERATIONS_MUTATION_KEY,
      status: "pending",
    },
    select: (mutation) => mutation.state.variables as string[],
  });
  return new Set(pending.flat());
}
