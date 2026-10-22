import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AuthShell from "@/components/auth/AuthShell";
import CustomSignUp from "@/components/auth/CustomSignUp";

export default async function SignUpPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <AuthShell mode="sign-up">
      <CustomSignUp />
    </AuthShell>
  );
}
