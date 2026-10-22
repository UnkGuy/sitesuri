import type { AxiosInstance } from "axios";

export type AppUser = {
  user_id: string;
  clerk_user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
};

/**
 * Creates or synchronizes the authenticated Clerk user.
 * FastAPI derives the identity from the verified JWT.
 */
export async function syncUser(api: AxiosInstance): Promise<AppUser> {
  const { data } = await api.post<AppUser>("/users");
  return data;
}

/**
 * Fetches the authenticated user's SiteSuri profile.
 */
export async function getCurrentUser(api: AxiosInstance): Promise<AppUser> {
  const { data } = await api.get<AppUser>("/users/me");
  return data;
}
