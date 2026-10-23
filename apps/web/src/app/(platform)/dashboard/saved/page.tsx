import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Saved Locations" };
export default async function SavedLocationsPage() {
  await auth.protect();
  return <DashboardClient view="saved" />;
}
