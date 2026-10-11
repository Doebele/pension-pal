import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";

export const PROFILE_QUERY_KEY = ["profile"] as const;

export function useUserProfile() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => (await api.fetchProfile()) as Record<string, any>,
    enabled: Boolean(localStorage.getItem("spc_auth")),
  });

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
  }, [queryClient]);

  return {
    data: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : "",
    refresh,
  };
}
