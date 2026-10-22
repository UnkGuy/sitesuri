import { auth } from "@clerk/nextjs/server";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata = {
  title: "Location Explorer | SiteSuri",
  description: "Explore business location criteria and map selection in SiteSuri.",
};

export default async function DashboardPage() {
  await auth.protect();
  return <DashboardClient />;
}
