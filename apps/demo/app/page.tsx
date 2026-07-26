import { redirect } from "next/navigation";

// Account mode (uncomment to restore the sign-in landing page — see the
// matching commented blocks in studio.config.ts and app/studio/*):
// import { headers } from "next/headers";
// import Link from "next/link";
// import { auth } from "@/lib/auth";

export default function HomePage() {
  // Guest mode: no accounts, so the landing page is the studio itself.
  redirect("/studio");

  // Account mode:
  // const session = await auth.api.getSession({ headers: await headers() });
  // if (session) {
  //   redirect("/studio");
  // }
  //
  // return (
  //   <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
  //     <h1 className="font-semibold text-2xl">Studio Demo</h1>
  //     <p className="text-muted-foreground">
  //       A minimal reference app for{" "}
  //       <code className="rounded bg-muted px-1 py-0.5">@two-71/studio</code> —
  //       free billing, open moderation, one SFW FLUX.1 Schnell model.
  //     </p>
  //     <Link
  //       className="w-fit rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
  //       href="/login"
  //     >
  //       Sign in
  //     </Link>
  //   </main>
  // );
}
