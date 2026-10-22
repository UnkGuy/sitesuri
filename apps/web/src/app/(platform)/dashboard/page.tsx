import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

import DashboardClient from "@/components/dashboard/DashboardClient";
import DashboardLoading from "@/components/dashboard/DashboardLoading";

async function DashboardContent() {
  await auth.protect();

  return <DashboardClient />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
