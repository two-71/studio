"use client";

import type { StudioClientConfig } from "@two-71/studio";
import {
  Studio,
  StudioThemeSwitcher,
  type StudioUser,
} from "@two-71/studio/client";
import { WelcomeDialog } from "@/components/welcome-dialog";

// Account mode (uncomment to restore better-auth logins — see the matching
// commented blocks in studio.config.ts and page.tsx):
// import { signOut } from "@/lib/auth-client";

// <Studio>'s onSignOut is a function prop, which can't cross the
// server/client boundary from the async StudioPage server component — so
// this thin client wrapper supplies it directly (see the package's
// client/studio.tsx doc comment).
export function StudioClient({
  config,
  dailyLimit,
  user,
}: {
  config: StudioClientConfig;
  dailyLimit: number;
  user: StudioUser;
}) {
  return (
    <>
      <WelcomeDialog dailyLimit={dailyLimit} />
      <Studio
        config={config}
        // Guest mode: there is no session to end, so "Sign out" just lands
        // back on the studio. Account mode:
        // loginUrl="/login"
        // onSignOut={async () => {
        //   await signOut();
        // }}
        headerActions={<StudioThemeSwitcher />}
        loginUrl="/studio"
        // Demo header holds the quota pill + avatar — narrower than the
        // default 290px, which assumes branding links and a Buy button too.
        notchWidth={205}
        user={user}
      />
    </>
  );
}
