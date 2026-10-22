"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/errors/ErrorScreen";

/** App Router error boundary for unexpected errors in child segments. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep stack traces out of the public error UI. Replace with reporting later.
    console.error("SiteSuri rendering error:", error);
  }, [error]);

  return <ErrorScreen code={500} onRetry={reset} />;
}
