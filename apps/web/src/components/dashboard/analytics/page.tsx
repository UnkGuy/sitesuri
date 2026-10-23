import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import DashboardClient from "@/components/dashboard/DashboardClient";
import type { BusinessType } from "@/features/analyses/analysis-service";

export const metadata: Metadata = { title: "Analytics" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await auth.protect();
  const params = await searchParams;
  const fromParam = (value: string | string[] | undefined, fallback: number) => {
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const initialLat = fromParam(params.lat, 14.5995);
  const initialLng = fromParam(params.lng, 120.9842);
  const initialRadius = fromParam(params.radius, 2000);
  const point = {
    lat: initialLat >= 4 && initialLat <= 22 ? initialLat : 14.5995,
    lng: initialLng >= 115 && initialLng <= 128 ? initialLng : 120.9842,
  };
  const radius = [250, 500, 1000, 2000].includes(initialRadius) ? initialRadius : 2000;
  const categories: BusinessType[] = ["food stall", "sari-sari store", "general retail"];
  const category = typeof params.category === "string" && categories.includes(params.category as BusinessType)
    ? (params.category as BusinessType)
    : "food stall";

  return <DashboardClient view="analytics" initialArea={{ point, radius, category }} />;
}
