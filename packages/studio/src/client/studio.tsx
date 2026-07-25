"use client";

// The <Studio /> root (spec §4.7 + §10 A2.2). Host apps render this once,
// passing the serializable StudioClientConfig (derived server-side via
// deriveClientConfig — never the full StudioConfig with secrets/workflow
// graphs) and the signed-in user, then nest their own shell layout as
// children. This is the only place StudioConfigProvider/StudioUserProvider
// need to be wired, so every descendant can call useStudioConfig()/
// useStudioUser() instead of drilling props through the host's layout.

import type { ReactNode } from "react";
import type { StudioClientConfig } from "../config/types";
import { StudioConfigProvider } from "./studio-config-provider";
import type { StudioUser } from "./studio-user-context";
import { StudioUserProvider } from "./studio-user-context";

export function Studio({
  config,
  user,
  children,
}: {
  config: StudioClientConfig;
  user: StudioUser;
  children: ReactNode;
}) {
  return (
    <StudioConfigProvider config={config}>
      <StudioUserProvider user={user}>{children}</StudioUserProvider>
    </StudioConfigProvider>
  );
}

export type { StudioUser } from "./studio-user-context";
