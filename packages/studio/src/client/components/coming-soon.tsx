import type * as React from "react";
import { Badge } from "../ui/badge";

export const STRIPE_BACKGROUND =
  "repeating-linear-gradient(45deg, transparent, transparent 7px, color-mix(in srgb, var(--foreground) 6%, transparent) 7px, color-mix(in srgb, var(--foreground) 6%, transparent) 14px)";

interface ComingSoonProps {
  children: React.ReactNode;
  label?: string;
}

/**
 * Wraps a not-yet-ready control: disables interaction and lays a diagonal
 * striped overlay with a "Coming soon" badge on top, without touching the
 * wrapped component.
 */
export function ComingSoon({
  children,
  label = "Coming soon",
}: ComingSoonProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/30 p-2">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-40"
        inert
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: STRIPE_BACKGROUND }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Badge variant="secondary">{label}</Badge>
      </div>
    </div>
  );
}
