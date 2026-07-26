"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStudioConfig } from "../studio-config-provider";
import { useStudioHttp } from "../studio-http-context";

export const BALANCE_QUERY_KEY = ["studio-balance"] as const;

// Client-side coin balance for the studio chrome. Shared by the header (display)
// and the generate flow (affordability pre-check + post-generation refetch).
// Never fetches when the host's billing provider is disabled (dummy/free).
export function useBalance() {
  const config = useStudioConfig();
  const http = useStudioHttp();
  return useQuery({
    queryKey: BALANCE_QUERY_KEY,
    // balance is null when the host's billing provider is unlimited.
    queryFn: () => http.get("balance").json<{ balance: number | null }>(),
    enabled: config.features.billing,
  });
}

export function useInvalidateBalance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
}
