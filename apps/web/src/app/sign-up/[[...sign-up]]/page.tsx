import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/AuthShell";
import CustomSignUp from "@/components/auth/CustomSignUp";

async function SignUpContent() {
  const { userId } = await auth();

  // Already signed in? Redirect to dashboard.
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <AuthShell mode="sign-up">
      <CustomSignUp />
    </AuthShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div>Loading sign-up...</div>}>
      <SignUpContent />
    </Suspense>
  );
}
