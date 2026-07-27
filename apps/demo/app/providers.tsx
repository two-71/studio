"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per client via useState's lazy initializer — no effect
  // needed, and each browser tab gets its own client.
  const [queryClient] = useState(() => new QueryClient());
  return (
    // Class-based theming (`.dark` on <html>), system by default — the
    // studio header's <StudioThemeSwitcher /> drives it.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        {/* @two-71/studio surfaces its errors and confirmations through
            sonner's `toast()` — without a mounted <Toaster /> they no-op. */}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
