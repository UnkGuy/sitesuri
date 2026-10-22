"use client";

import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";

/** Mirrors the LeafTrade pattern: a fresh Clerk session token on each API request. */
export function useClerkApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    const api = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
      timeout: 15000,
    });

    api.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (!token) throw new Error("A signed-in session is required.");
      config.headers.set("Authorization", `Bearer ${token}`);
      return config;
    });

    return api;
  }, [getToken]);
}
