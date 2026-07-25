"use client";

import { useStudioStoreApi } from "../store/studio-store";
import { useMountEffect } from "../use-mount-effect";

/**
 * Loads persisted studio options (enhancement, models, ratio) from
 * localStorage after mount. Hydration is skipped in the store config so the
 * server-rendered defaults match the client's first paint.
 */
export function StudioOptionsHydration() {
  const store = useStudioStoreApi();
  useMountEffect(() => {
    store.persist.rehydrate();
  });
  return null;
}
