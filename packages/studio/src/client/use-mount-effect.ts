import { useEffect } from "react";

/**
 * Runs `effect` once on mount; its returned cleanup runs on unmount.
 * Wraps useEffect with an empty dep array to make one-time intent explicit.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: matches React's EffectCallback return type
export function useMountEffect(effect: () => void | (() => void)) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
  useEffect(effect, []);
}
