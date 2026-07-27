"use client";

// Stock shadcn/ui sonner wrapper (new-york, Tailwind v4). @two-71/studio calls
// `toast()` from its own components and hooks, but deliberately doesn't mount a
// <Toaster /> — that would double up for consumers who already have one. Host
// apps render this once; the demo does it in app/providers.tsx.

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      theme={theme as ToasterProps["theme"]}
      {...props}
    />
  );
}

export { Toaster };
