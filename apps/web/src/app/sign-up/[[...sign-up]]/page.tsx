import AuthShell from "@/components/auth/AuthShell";
import CustomSignUp from "@/components/auth/CustomSignUp";

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <CustomSignUp />
    </AuthShell>
  );
}
