"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClerkApi } from "@/lib/api/client";
import { syncUser, getCurrentUser } from "./user-service";

export function useSiteSuriUser() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useClerkApi();
  const queryClient = useQueryClient();

  // Prevent repeated synchronization during rerenders.
  const attemptedUserRef = useRef<string | null>(null);

  // POST /users — Create or synchronize the Clerk user.
  const syncMutation = useMutation({
    mutationFn: () => syncUser(api),

    onSuccess: (user) => {
      queryClient.invalidateQueries({
        queryKey: ["users", "me", user.clerk_user_id],
      });
    },

    retry: false,
  });

  const { mutate: synchronize } = syncMutation;

  // Synchronize when an authenticated session becomes available.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      attemptedUserRef.current = null;
      return;
    }

    if (attemptedUserRef.current === userId) {
      return;
    }

    attemptedUserRef.current = userId;
    synchronize();
  }, [isLoaded, isSignedIn, userId, synchronize]);

  // Only fetch when synchronization succeeds for this user.
  const isSynchronized =
    isSignedIn &&
    Boolean(userId) &&
    syncMutation.data?.clerk_user_id === userId;

  // GET /users/me — Retrieve the user's database record.
  const userQuery = useQuery({
    queryKey: ["users", "me", userId],

    queryFn: () => getCurrentUser(api),

    enabled: isLoaded && isSynchronized,

    staleTime: 60_000,

    retry: false,
  });

  return {
    user: userQuery.data,

    isLoading:
      !isLoaded ||
      syncMutation.isPending ||
      (isSynchronized && userQuery.isPending),

    isError: syncMutation.isError || userQuery.isError,

    error: syncMutation.error ?? userQuery.error,

    isSynchronized,

    refetch: userQuery.refetch,

    retrySync: () => {
      if (isLoaded && isSignedIn && userId) {
        synchronize();
      }
    },
  };
}
