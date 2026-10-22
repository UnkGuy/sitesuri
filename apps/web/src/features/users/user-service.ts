import type { AxiosInstance } from "axios";

export type UserSyncPayload = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

export type AppUser = {
  user_id: string;
  clerk_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
};

/** The backend trusts only verified Clerk user data, not this profile snapshot. */
export async function syncUser(api: AxiosInstance, payload: UserSyncPayload) {
  const { data } = await api.post<AppUser>("/users", payload);
  return data;
}

export async function getCurrentUser(api: AxiosInstance) {
  const { data } = await api.get<AppUser>("/users/me");
  return data;
}
