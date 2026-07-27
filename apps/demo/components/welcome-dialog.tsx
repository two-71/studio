"use client";

// First-visit explainer for the public demo. Two storage keys, two levels of
// dismissal: closing hides it for the browser session (so a refresh doesn't
// nag), ticking the box hides it for good.

import { useMountEffect } from "@two-71/studio/client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SESSION_KEY = "studio-demo-welcome-seen";
const DISMISSED_KEY = "studio-demo-welcome-dismissed";
const REPO_URL = "https://github.com/two-71/studio";

export function WelcomeDialog({ dailyLimit }: { dailyLimit: number }) {
  // Starts closed so the server-rendered markup matches; the mount effect is
  // the only thing that can open it, after storage is readable.
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useMountEffect(() => {
    if (
      sessionStorage.getItem(SESSION_KEY) ||
      localStorage.getItem(DISMISSED_KEY)
    ) {
      return;
    }
    setOpen(true);
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    if (dontShowAgain) {
      localStorage.setItem(DISMISSED_KEY, "1");
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to 2.71 Studio</DialogTitle>
          <DialogDescription>
            A free public demo of{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              @two-71/studio
            </code>{" "}
            — an open-source, self-hostable AI image &amp; video studio for
            Next.js.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <strong>{dailyLimit} generations per day, free</strong> — no signup,
            no card.
          </li>
          <li className="text-muted-foreground">
            The quota is per IP address and resets at midnight UTC.
          </li>
          <li className="text-muted-foreground">
            Anyone sharing your IP (office, VPN) shares the gallery and the
            quota.
          </li>
        </ul>

        <DialogFooter className="sm:items-center sm:justify-between">
          <a
            className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
            href={REPO_URL}
            rel="noopener"
            target="_blank"
          >
            View on GitHub →
          </a>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-muted-foreground text-sm">
              <input
                checked={dontShowAgain}
                className="size-4 accent-primary"
                onChange={(event) => setDontShowAgain(event.target.checked)}
                type="checkbox"
              />
              Don&apos;t show again
            </label>
            <button
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
              onClick={() => handleOpenChange(false)}
              type="button"
            >
              Start creating
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
