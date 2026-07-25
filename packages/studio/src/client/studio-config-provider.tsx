"use client";

// Client-side access to the StudioClientConfig (spec §4.7): client components
// read cost/balance/branding/feature-flag data from here instead of
// importing host-specific model/catalog constants directly. Wired by
// <Studio> (./studio.tsx), which the host renders with the server-derived
// config (deriveClientConfig) around its own shell tree.

import { createContext, useContext } from "react";
import type { StudioClientConfig } from "../config/types";

const StudioConfigContext = createContext<StudioClientConfig | null>(null);

export function StudioConfigProvider({
  config,
  children,
}: {
  config: StudioClientConfig;
  children: React.ReactNode;
}) {
  return (
    <StudioConfigContext.Provider value={config}>
      {children}
    </StudioConfigContext.Provider>
  );
}

export function useStudioConfig(): StudioClientConfig {
  const config = useContext(StudioConfigContext);
  if (!config) {
    throw new Error("useStudioConfig() called outside <StudioConfigProvider>");
  }
  return config;
}
