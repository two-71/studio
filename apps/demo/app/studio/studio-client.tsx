"use client";

import type { StudioClientConfig } from "@two-71/studio";
import { Studio, type StudioUser } from "@two-71/studio/client";
import { signOut } from "@/lib/auth-client";

// <Studio>'s onSignOut is a function prop, which can't cross the
// server/client boundary from the async StudioPage server component — so
// this thin client wrapper supplies it directly (see the package's
// client/studio.tsx doc comment).
export function StudioClient({
  config,
  user,
}: {
  config: StudioClientConfig;
  user: StudioUser;
}) {
  return (
    <Studio
      config={config}
      loginUrl="/login"
      // Demo header only holds the avatar — the default 290px notch leaves a
      // long empty shelf.
      notchWidth={140}
      onSignOut={async () => {
        await signOut();
      }}
      user={user}
    />
  );
}
