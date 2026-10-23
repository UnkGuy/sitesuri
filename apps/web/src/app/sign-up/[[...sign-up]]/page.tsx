import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/AuthShell";
import CustomSignUp from "@/components/auth/CustomSignUp";

import AuthLoading from "@/components/auth/AuthLoading";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};
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
    <Suspense fallback={<AuthLoading mode="sign-up" />}>
      <SignUpContent />
    </Suspense>
  );
}
