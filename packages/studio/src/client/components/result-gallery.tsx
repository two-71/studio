"use client";

import { IconSparkles } from "@tabler/icons-react";
import { useGenerations, useLiveResults } from "../hooks/use-generations";
import { useStudioStore } from "../store/studio-store";
import { GenerationRealtime } from "./generation-realtime";
import { ResultCard } from "./result-card";
import { SelectionBar } from "./selection-bar";

/** Cards eager-loaded for LCP — roughly the first visible rows. */
const ABOVE_FOLD_COUNT = 8;

export function ResultGallery() {
  const { data } = useGenerations();
  const persisted = useLiveResults();
  const realtime = data?.realtime ?? null;
  const optimisticCards = useStudioStore((s) => s.optimisticCards);
  const openLightbox = useStudioStore((s) => s.openLightbox);

  // In-flight submit placeholders render ahead of the persisted list so a
  // background refetch can't drop them (see use-generate.ts).
  const results = [...optimisticCards, ...persisted];

  const selectableIds = results
    .filter(
      (result) =>
        !result.status || result.status === "done" || result.status === "error"
    )
    .map((result) => result.id);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:mt-3 lg:rounded-tl-xl lg:border-border lg:border-t lg:border-l">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        {results.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <IconSparkles className="size-8 opacity-60" />
            <p className="font-medium text-sm">No generations yet</p>
            <p className="text-xs">
              Write a prompt and hit Generate to create your first image.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {results.map((result, index) => (
              <ResultCard
                key={result.id}
                onOpen={() => openLightbox(result.id)}
                priority={index < ABOVE_FOLD_COUNT}
                result={result}
              />
            ))}
          </div>
        )}
      </div>

      <SelectionBar selectableIds={selectableIds} />

      {/* One live subscription per pending batch, straight from the list
          response — works identically after a fresh submit and after a page
          reload. Unmounts when the refetch shows the batch is done. */}
      {realtime?.requestIds.map((requestId) => (
        <GenerationRealtime
          accessToken={realtime.publicAccessToken}
          key={requestId}
          requestId={requestId}
        />
      ))}
    </div>
  );
}
