"use client";

import {
  IconBrandDiscordFilled,
  IconCoins,
  IconExternalLink,
  IconLogout,
} from "@tabler/icons-react";
import BoringAvatar from "boring-avatars";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BrandingLink } from "../../config/types";
import { formatCoinName } from "../format-coin-name";
import { useBalance } from "../hooks/use-balance";
import { useStudioConfig } from "../studio-config-provider";
import { useStudioUser } from "../studio-user-context";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button, buttonVariants } from "../ui/button";
import { cn } from "../ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { StudioBrand } from "./studio-brand";

// Discord keeps its brand icon/color; any other configured link falls back to
// a plain external-link glyph.
function isDiscordLink(link: BrandingLink): boolean {
  return link.label.toLowerCase().includes("discord");
}

export function StudioHeader() {
  const router = useRouter();
  const config = useStudioConfig();
  const user = useStudioUser();
  const { data: balance } = useBalance();

  const handleSignOut = async () => {
    await config.onSignOut?.();
    router.push(config.loginUrl ?? "/login");
  };

  return (
    <header className="flex items-center justify-between gap-2 bg-sidebar px-4 py-2 lg:absolute lg:top-0 lg:right-0 lg:z-20 lg:h-[60px] lg:bg-transparent lg:px-4 lg:py-0">
      <div className="lg:hidden">
        <StudioBrand />
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 md:flex">
          {/*<Button aria-label="Layout" size="icon" variant="outline">
            <IconLayoutGrid />
          </Button>
          <Button aria-label="Sort" size="icon" variant="outline">
            <IconAdjustmentsHorizontal />
          </Button>*/}
          {config.branding?.links?.map((link) => (
            <Button asChild key={link.url} size="icon" variant="outline">
              <a
                aria-label={
                  isDiscordLink(link)
                    ? "Join our Discord"
                    : `Open ${link.label}`
                }
                href={link.url}
                rel="noopener"
                target="_blank"
              >
                {isDiscordLink(link) ? (
                  <IconBrandDiscordFilled className="text-[#5865F2]" />
                ) : (
                  <IconExternalLink />
                )}
              </a>
            </Button>
          ))}
        </div>

        {config.headerActions}

        {/* No pill when billing is disabled or unlimited (null balance). */}
        {config.features.billing === false ||
        balance?.balance === null ? null : (
          <div className="flex h-9 items-center gap-1 rounded-full bg-black/5 py-1 pr-1 pl-3 ring-1 ring-black/10 dark:bg-black/80 dark:ring-white/10">
            {/* Follows the host's accent theme (same var as the accent
                button variant); falls back to the stock pink. */}
            <IconCoins className="size-5 text-[var(--studio-accent-from,oklch(0.656_0.241_354.308))]" />
            <span className="px-1.5 font-semibold text-foreground text-sm dark:text-white">
              {balance ? balance.balance.toLocaleString() : "—"}
            </span>
            {config.topUpUrl ? (
              <Link
                aria-label={`Buy ${formatCoinName(config.coinName, { plural: true, capitalize: true })}`}
                className={cn(
                  buttonVariants({ variant: "accent" }),
                  "h-full px-4"
                )}
                href={config.topUpUrl}
              >
                Buy
              </Link>
            ) : null}
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="size-8 ring-1 ring-white/10">
              <AvatarImage alt={user.name} src={user.image ?? undefined} />
              <AvatarFallback className="overflow-hidden">
                <BoringAvatar
                  className="size-full!"
                  name={user.name}
                  size={32}
                  square
                />
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-medium">{user.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/*<DropdownMenuItem asChild>
              <Link href="/profile">
                <IconUser />
                Profile
              </Link>
            </DropdownMenuItem>*/}
            <DropdownMenuItem onClick={handleSignOut}>
              <IconLogout />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
