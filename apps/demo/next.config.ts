import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The package ships TypeScript source (spec §3.1's "ship source, no build
  // step" decision) — Next transpiles it like the rest of the app instead of
  // consuming a prebuilt dist.
  transpilePackages: ["@two-71/studio"],
  // @resvg/resvg-js (used internally by the package's watermark step) is a
  // native module — it must load from node_modules at runtime, not be
  // bundled into the server output.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Proxies Trigger.dev's realtime long-polls through this app's own domain
  // instead of the browser talking to api.trigger.dev directly. Required by
  // any consumer of @trigger.dev/react-hooks reading generation status from
  // @two-71/studio/server's realtime token (this demo currently polls the
  // generations endpoint instead — see components/studio-content.tsx — but
  // the rewrite is documented here as the wiring a host needs either way).
  async rewrites() {
    return [
      {
        source: "/api/realtime/:path*",
        destination: "https://api.trigger.dev/realtime/:path*",
      },
    ];
  },
};

export default nextConfig;
