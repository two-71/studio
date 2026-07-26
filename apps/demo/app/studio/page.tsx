import { deriveClientConfig } from "@two-71/studio";
import { headers } from "next/headers";
import { ensureGuestUser, guestFromHeaders } from "@/lib/guest";
import { studioConfig } from "@/studio.config";
import { StudioClient } from "./studio-client";

// Account mode (uncomment to restore better-auth logins — see the matching
// commented blocks in studio.config.ts and studio-client.tsx):
// import { redirect } from "next/navigation";
// import { auth } from "@/lib/auth";

export default async function StudioPage() {
  // Account mode:
  // const session = await auth.api.getSession({ headers: await headers() });
  // if (!session) {
  //   redirect("/login");
  // }
  // const user = session.user;

  // Guest mode: identity comes from the request IP (lib/guest.ts) — no
  // session, no redirect. The upsert here guarantees the user row exists
  // before the first API call.
  const guest = guestFromHeaders(await headers());
  await ensureGuestUser(guest);

  // deriveClientConfig strips workflow graphs and every provider/secret
  // — this projection, not the full StudioConfig, is what's
  // allowed to cross into the client tree.
  const clientConfig = deriveClientConfig(studioConfig);

  return <StudioClient config={clientConfig} user={guest} />;
}
