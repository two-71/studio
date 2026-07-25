// Open-package defaults for the two provider interfaces (spec §4.2, §4.3).

import type { BillingProvider, ModerationProvider } from "./types";

// costFor/videoCost → 0, charge → always "ok", refund → no-op,
// getBalance → null (unlimited, hides all coin UI).
export const freeBilling: BillingProvider = {
  costFor: () => 0,
  videoCost: () => 0,
  getBalance: () => Promise.resolve(null),
  charge: () => Promise.resolve("ok"),
  refund: () => Promise.resolve(),
};

// Always allows, never rewrites or blocks.
export const allowAllModeration: ModerationProvider = {
  check: () => Promise.resolve({ action: "allow" }),
};
