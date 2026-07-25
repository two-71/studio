"use client";

// Client-side HTTP boundary (spec §5's route mount, plan §5): package code
// can't assume a host mounts createStudioHandlers at any particular path, so
// the ky instance is built once by <Studio> from config.apiBasePath (default
// "/api/studio") and provided here instead of a module-level singleton.

import ky, { HTTPError, type KyInstance } from "ky";
import { createContext, useContext, useState } from "react";

const DEFAULT_API_BASE_PATH = "/api/studio";

const StudioHttpContext = createContext<KyInstance | null>(null);

export function StudioHttpProvider({
  apiBasePath,
  children,
}: {
  apiBasePath?: string;
  children: React.ReactNode;
}) {
  const [client] = useState(() =>
    ky.create({ prefix: apiBasePath ?? DEFAULT_API_BASE_PATH })
  );
  return (
    <StudioHttpContext.Provider value={client}>
      {children}
    </StudioHttpContext.Provider>
  );
}

export function useStudioHttp(): KyInstance {
  const client = useContext(StudioHttpContext);
  if (!client) {
    throw new Error("useStudioHttp() called outside <Studio>");
  }
  return client;
}

// Returns the HTTP status of a ky error, or null for network/other failures.
export function httpStatusOf(error: unknown): number | null {
  return error instanceof HTTPError ? error.response.status : null;
}
