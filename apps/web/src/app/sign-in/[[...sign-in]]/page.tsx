import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/AuthShell";
import CustomSignIn from "@/components/auth/CustomSignIn";

export default async function SignInPage() {
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
