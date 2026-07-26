// Guest mode: visitors are identified by a salted hash of their IP — no
// login, no signup. The hash seeds a stable id, a deterministic display
// name, and a synthetic row in the better-auth `user` table (the
// generations FK needs a real row). Raw IPs are never stored.
//
// Trade-offs accepted for a demo: everyone behind one IP (office NAT, VPN)
// shares a gallery and a quota, and the quota resets at UTC midnight.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

// Daily generation quota per IP, enforced through the billing provider in
// studio.config.ts.
export const GUEST_DAILY_LIMIT = Number(process.env.GUEST_DAILY_LIMIT ?? 5);

const ADJECTIVES = [
  "Amber",
  "Brave",
  "Cobalt",
  "Dapper",
  "Electric",
  "Frosty",
  "Golden",
  "Hidden",
  "Ivory",
  "Jolly",
  "Keen",
  "Lunar",
  "Mellow",
  "Nimble",
  "Opal",
  "Plucky",
] as const;

const ANIMALS = [
  "Falcon",
  "Otter",
  "Lynx",
  "Heron",
  "Badger",
  "Dolphin",
  "Ibex",
  "Jaguar",
  "Koala",
  "Marmot",
  "Narwhal",
  "Ocelot",
  "Puffin",
  "Raven",
  "Stoat",
  "Tapir",
] as const;

export interface GuestUser {
  id: string;
  name: string;
  email: string;
}

export function guestFromHeaders(headers: Headers): GuestUser {
  // First hop of x-forwarded-for is the client on Vercel; "local" covers
  // `next dev` where neither header exists.
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "local";
  const hash = createHash("sha256")
    .update(`${process.env.GUEST_SALT ?? "studio-demo-guest"}:${ip}`)
    .digest("hex");
  const id = `guest_${hash.slice(0, 24)}`;
  const adjective =
    ADJECTIVES[Number.parseInt(hash.slice(24, 26), 16) % ADJECTIVES.length];
  const animal =
    ANIMALS[Number.parseInt(hash.slice(26, 28), 16) % ANIMALS.length];
  return { id, name: `${adjective} ${animal}`, email: `${id}@guest.demo` };
}

// The upsert is idempotent, but polling hits the auth adapter every few
// seconds — this per-process set keeps those calls out of the database.
const seeded = new Set<string>();

export async function ensureGuestUser(guest: GuestUser): Promise<void> {
  if (seeded.has(guest.id)) {
    return;
  }
  await db
    .insert(user)
    .values({
      id: guest.id,
      name: guest.name,
      email: guest.email,
      emailVerified: false,
    })
    .onConflictDoNothing();
  seeded.add(guest.id);
}
