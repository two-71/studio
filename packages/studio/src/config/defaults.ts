// Open-package defaults for the two provider interfaces.

import type { BillingProvider, ModerationProvider } from "./types";

// costFor/videoCost → 0, charge → always "ok", refund → no-op,
// getBalance → null. disabled marks it as a dummy: all coin/cost UI is
// hidden and the client never calls the balance endpoint.
export const freeBilling: BillingProvider = {
  costFor: () => 0,
  videoCost: () => 0,
  getBalance: () => Promise.resolve(null),
  charge: () => Promise.resolve("ok"),
  refund: () => Promise.resolve(),
  disabled: true,
};

// Always allows, never rewrites or blocks.
export const allowAllModeration: ModerationProvider = {
  check: () => Promise.resolve({ action: "allow" }),
};
