"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStudioHttp } from "../studio-http-context";

export const BALANCE_QUERY_KEY = ["studio-balance"] as const;

// Client-side coin balance for the studio chrome. Shared by the header (display)
// and the generate flow (affordability pre-check + post-generation refetch).
export function useBalance() {
  const http = useStudioHttp();
  return useQuery({
    queryKey: BALANCE_QUERY_KEY,
    queryFn: () => http.get("balance").json<{ balance: number }>(),
  });
}

export function useInvalidateBalance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
}
