import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

import DashboardClient from "@/components/dashboard/DashboardClient";

async function DashboardContent() {
  // Protect the dashboard from unauthenticated users.
  await auth.protect();

  return <DashboardClient />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
