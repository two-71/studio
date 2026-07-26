"use client";

// The <Studio /> root (spec §3.1 + §4.7 + §10 A2.2). Host apps render this
// once, passing the serializable StudioClientConfig (derived server-side via
// deriveClientConfig — never the full StudioConfig with secrets/workflow
// graphs) and the signed-in user. <Studio> owns the full component tree
// (StudioShell and everything under it) and every context descendants need:
// config, user, the ky HTTP client, and the per-mount zustand store. Hosts
// that need imageLoader/onSignOut — functions, which can't cross the
// server/client boundary as props from an async Server Component — pass them
// here directly; <Studio> merges them into the config it provides.

import { useState } from "react";
import type { StudioClientConfig } from "../config/types";
import { StudioShell } from "./components/studio-shell";
import { createStudioStore, StudioStoreContext } from "./store/studio-store";
import { StudioConfigProvider } from "./studio-config-provider";
import { StudioHttpProvider } from "./studio-http-context";
import type { StudioUser } from "./studio-user-context";
import { StudioUserProvider } from "./studio-user-context";
import { TooltipProvider } from "./ui/tooltip";

export function Studio({
  config,
  user,
  imageLoader,
  onSignOut,
  loginUrl,
  brandIcon,
  notchWidth,
}: {
  config: StudioClientConfig;
  user: StudioUser;
  imageLoader?: StudioClientConfig["imageLoader"];
  onSignOut?: StudioClientConfig["onSignOut"];
  loginUrl?: string;
  brandIcon?: StudioClientConfig["brandIcon"];
  notchWidth?: StudioClientConfig["notchWidth"];
}) {
  const resolvedConfig: StudioClientConfig = {
    ...config,
    imageLoader: imageLoader ?? config.imageLoader,
    onSignOut: onSignOut ?? config.onSignOut,
    loginUrl: loginUrl ?? config.loginUrl,
    brandIcon: brandIcon ?? config.brandIcon,
    notchWidth: notchWidth ?? config.notchWidth,
  };
  const [store] = useState(() => createStudioStore(resolvedConfig));

  return (
    <StudioConfigProvider config={resolvedConfig}>
      <StudioUserProvider user={user}>
        <StudioHttpProvider apiBasePath={resolvedConfig.apiBasePath}>
          <StudioStoreContext.Provider value={store}>
            {/* Studio components use Tooltip internally — provide the context
                here so hosts don't need their own TooltipProvider. */}
            <TooltipProvider>
              <StudioShell />
            </TooltipProvider>
          </StudioStoreContext.Provider>
        </StudioHttpProvider>
      </StudioUserProvider>
    </StudioConfigProvider>
  );
}

export type { StudioUser } from "./studio-user-context";
