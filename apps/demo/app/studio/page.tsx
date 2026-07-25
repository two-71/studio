import { deriveClientConfig } from "@two-71/studio";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { studioConfig } from "@/studio.config";
import { StudioClient } from "./studio-client";

export default async function StudioPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // deriveClientConfig strips workflow graphs and every provider/secret
  // (spec §4.7) — this projection, not the full StudioConfig, is what's
  // allowed to cross into the client tree.
  const clientConfig = deriveClientConfig(studioConfig);

  return <StudioClient config={clientConfig} user={session.user} />;
}
