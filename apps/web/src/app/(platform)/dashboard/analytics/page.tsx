import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  await auth.protect();

  return <DashboardClient view="analytics" />;
}
