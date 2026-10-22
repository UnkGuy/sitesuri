import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/AuthShell";
import CustomSignIn from "@/components/auth/CustomSignIn";

import AuthLoading from "@/components/auth/AuthLoading";

async function SignInContent() {
  const { userId } = await auth();

  // Already authenticated? Go straight to dashboard.
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <AuthShell mode="sign-in">
      <CustomSignIn />
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthLoading mode="sign-in" />}>
      <SignInContent />
    </Suspense>
  );
}
