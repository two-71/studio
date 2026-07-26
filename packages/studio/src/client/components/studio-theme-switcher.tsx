"use client";

// Light / System / Dark switcher for the studio header (headerActions slot).
// Backed by next-themes, which is a peer dependency: the host app must wrap
// its tree in next-themes' <ThemeProvider attribute="class" enableSystem>
// and define class-based `.dark` tokens for this to have any effect.

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useMountEffect } from "../use-mount-effect";

const OPTIONS = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "system", label: "System", icon: IconDeviceDesktop },
  { value: "dark", label: "Dark", icon: IconMoon },
] as const;

export function StudioThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // The stored theme is unknowable during SSR — settle on it after mount so
  // server and first client render agree (next-themes' standard pattern).
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => {
    setMounted(true);
  });

  const current = mounted ? (theme ?? "system") : "system";
  const CurrentIcon =
    OPTIONS.find((option) => option.value === current)?.icon ??
    IconDeviceDesktop;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Change theme" size="icon" variant="outline">
          <CurrentIcon />
        </Button>
      </DropdownMenuTrigger>
      {/* w-auto: the base content style pins width to the trigger (a 36px
          icon button) — too narrow for the horizontal option row. */}
      <DropdownMenuContent
        align="end"
        className="flex w-auto min-w-0 gap-1 p-1"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            aria-label={label}
            className={cn(
              "size-9 justify-center p-0",
              current === value && "bg-accent text-accent-foreground"
            )}
            key={value}
            onSelect={() => setTheme(value)}
          >
            <Icon className="size-4" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
