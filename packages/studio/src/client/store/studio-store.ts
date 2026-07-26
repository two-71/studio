"use client";

// Studio controls + lightbox UI state. A module-level singleton
// can't be package-pure — its initial selection and persisted-value
// revalidation both need the host's model/lora/pose catalog, which only
// exists once <Studio> has a StudioClientConfig. So this is a factory
// (createStudioStore) instead of a bare `create(...)` export; <Studio>
// builds one instance per mount via useState and provides it through
// StudioStoreContext, and every consumer reads it through useStudioStore()
// below (same call shape as a zustand singleton, just routed through context).
//
// The generation list itself lives in React Query (see hooks/use-generations.ts);
// submitting lives in hooks/use-generate.ts.

import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";
import type {
  RatioKey,
  ResolutionKey,
  StudioClientConfig,
} from "../../config/types";
import type { StudioResult } from "../types";

type PersistedOptions = Pick<
  StudioState,
  | "promptEnhancement"
  | "selectedModelIds"
  | "ratio"
  | "poseImage"
  | "enabledLoraIds"
>;

export interface StudioState {
  prompt: string;
  promptEnhancement: boolean;
  selectedModelIds: string[];
  ratio: RatioKey;
  resolution: ResolutionKey;
  // Single reference image as a data URL; workflows without reference nodes
  // ignore it. Presence means it's sent with the run.
  referenceImage: string | null;
  // True when the picked reference file exceeds the upload cap. The image still
  // previews (marked invalid) but Generate refuses to submit until replaced.
  referenceImageOversized: boolean;
  // Pose control image: a preset URL from a model's poses or an uploaded data
  // URL. Presence means it's sent as base64 with the run.
  poseImage: string | null;
  // Ids of enabled predefined LoRAs (see a model's `loras`); sent with the run.
  enabledLoraIds: string[];
  // The open image is tracked by its stable result id, not a list position, so a
  // background refetch that prepends/reorders rows can't swap the shown image.
  lightboxId: string | null;
  // Gallery multi-select for bulk delete. Ids, not positions, so refetches
  // can't shift the selection. Not persisted.
  selectedIds: string[];
  // True while a Generate click is in flight (enhancement + run submits). Shared
  // so every GenerateButton instance blocks together.
  generating: boolean;
  // Placeholder cards for runs being submitted (enhancement + submit round-trips).
  // Kept outside the React Query cache and rendered ahead of it, so a concurrent
  // list refetch (poller invalidate, window focus) can't drop them before the
  // server rows exist. Cleared once the post-submit refetch lands.
  optimisticCards: StudioResult[];
  // Live pipeline step per generation id, projected from the realtime runs'
  // metadata (fresher than the refetched DB rows; see generation-realtime.tsx).
  // Overlaid onto in-flight cards by useLiveResults().
  liveSteps: Record<string, NonNullable<StudioResult["status"]>>;

  setPrompt: (prompt: string) => void;
  setPromptEnhancement: (enabled: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setOptimisticCards: (cards: StudioResult[]) => void;
  clearOptimisticCards: () => void;
  setLiveStep: (
    generationId: string,
    status: NonNullable<StudioResult["status"]>
  ) => void;
  removeLiveStep: (generationId: string) => void;
  setReferenceImage: (image: string | null, oversized?: boolean) => void;
  setPoseImage: (image: string | null) => void;
  setEnabledLoraIds: (ids: string[]) => void;
  toggleModel: (id: string) => void;
  setRatio: (ratio: RatioKey) => void;
  setResolution: (resolution: ResolutionKey) => void;
  openLightbox: (id: string) => void;
  closeLightbox: () => void;
  setLightboxId: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
}

export type StudioStoreApi = ReturnType<typeof createStudioStore>;

export function createStudioStore(config: StudioClientConfig) {
  const availableModelIds = config.models
    .filter((model) => !model.comingSoon)
    .map((model) => model.id);
  const presetPoseUrls = config.models.flatMap(
    (model) => model.poses?.map((pose) => pose.controlImageUrl) ?? []
  );
  const loraIds = config.models.flatMap(
    (model) => model.loras?.map((lora) => lora.id) ?? []
  );

  return createStore<StudioState>()(
    persist(
      (set) => ({
        prompt: "",
        promptEnhancement: false,
        selectedModelIds: availableModelIds,
        ratio: "1:1" as RatioKey,
        resolution: "Standard" as ResolutionKey,
        referenceImage: null,
        referenceImageOversized: false,
        poseImage: null,
        enabledLoraIds: [],
        lightboxId: null,
        selectedIds: [],
        generating: false,
        optimisticCards: [],
        liveSteps: {},

        setPrompt: (prompt) => set({ prompt }),
        setPromptEnhancement: (enabled) => set({ promptEnhancement: enabled }),
        setGenerating: (generating) => set({ generating }),
        setOptimisticCards: (cards) => set({ optimisticCards: cards }),
        clearOptimisticCards: () => set({ optimisticCards: [] }),
        setLiveStep: (generationId, status) =>
          set((state) => ({
            liveSteps: { ...state.liveSteps, [generationId]: status },
          })),
        removeLiveStep: (generationId) =>
          set((state) => {
            const { [generationId]: _, ...rest } = state.liveSteps;
            return { liveSteps: rest };
          }),
        setReferenceImage: (image, oversized = false) =>
          set({
            referenceImage: image,
            referenceImageOversized: image !== null && oversized,
          }),
        setPoseImage: (image) => set({ poseImage: image }),
        setEnabledLoraIds: (ids) => set({ enabledLoraIds: ids }),

        toggleModel: (id) =>
          set((state) => ({
            selectedModelIds: state.selectedModelIds.includes(id)
              ? state.selectedModelIds.filter((modelId) => modelId !== id)
              : [...state.selectedModelIds, id],
          })),

        setRatio: (ratio) => set({ ratio }),
        setResolution: (resolution) => set({ resolution }),

        openLightbox: (id) => set({ lightboxId: id }),
        closeLightbox: () => set({ lightboxId: null }),
        setLightboxId: (id) => set({ lightboxId: id }),

        toggleSelected: (id) =>
          set((state) => ({
            selectedIds: state.selectedIds.includes(id)
              ? state.selectedIds.filter((selectedId) => selectedId !== id)
              : [...state.selectedIds, id],
          })),
        selectAll: (ids) => set({ selectedIds: ids }),
        clearSelection: () => set({ selectedIds: [] }),
      }),
      {
        name: "studio-options",
        partialize: (state): PersistedOptions => ({
          promptEnhancement: state.promptEnhancement,
          selectedModelIds: state.selectedModelIds,
          ratio: state.ratio,
          // Only preset URLs survive a reload — uploaded data URLs are too
          // large for localStorage.
          poseImage: state.poseImage?.startsWith("data:")
            ? null
            : state.poseImage,
          enabledLoraIds: state.enabledLoraIds,
        }),
        merge: (persisted, current) => {
          const stored = persisted as Partial<PersistedOptions> | undefined;
          // Drop persisted model ids that were removed or disabled since the
          // last visit; fall back to the defaults if none survive.
          const validIds = stored?.selectedModelIds?.filter((id) =>
            availableModelIds.includes(id)
          );
          return {
            ...current,
            ...stored,
            selectedModelIds: validIds?.length
              ? validIds
              : current.selectedModelIds,
            // Drop a persisted pose whose preset was removed since the last visit.
            poseImage:
              stored?.poseImage && presetPoseUrls.includes(stored.poseImage)
                ? stored.poseImage
                : null,
            // Drop persisted lora ids that were removed since the last visit.
            enabledLoraIds:
              stored?.enabledLoraIds?.filter((id) => loraIds.includes(id)) ??
              current.enabledLoraIds,
          };
        },
        // SSR renders with defaults; <StudioOptionsHydration /> rehydrates from
        // localStorage after mount so the client's first render matches.
        skipHydration: true,
      }
    )
  );
}

export const StudioStoreContext = createContext<StudioStoreApi | null>(null);

// Same call shape as a zustand singleton (`useStudioStore((s) => s.prompt)`),
// routed through the per-<Studio>-mount store created by createStudioStore.
export function useStudioStore<T>(selector: (state: StudioState) => T): T {
  const store = useContext(StudioStoreContext);
  if (!store) {
    throw new Error("useStudioStore() called outside <Studio>");
  }
  return useStore(store, selector);
}

// Non-reactive access (event handlers, imperative reads) — mirrors zustand's
// `useStudioStore.getState()` but needs the context, so it's a hook too.
export function useStudioStoreApi(): StudioStoreApi {
  const store = useContext(StudioStoreContext);
  if (!store) {
    throw new Error("useStudioStoreApi() called outside <Studio>");
  }
  return store;
}
