import { deriveClientConfig } from "@two-71/studio";
import { Studio } from "@two-71/studio/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StudioContent } from "@/components/studio-content";
import { auth } from "@/lib/auth";
import { studioConfig } from "@/studio.config";

export default async function StudioPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // deriveClientConfig strips workflow graphs and every provider/secret
  // (spec §4.7) — this projection, not the full StudioConfig, is what's
  // allowed to cross into the client tree.
  const clientConfig = deriveClientConfig(studioConfig);

  return (
    <Studio config={clientConfig} user={session.user}>
      <StudioContent />
    </Studio>
  );
}
