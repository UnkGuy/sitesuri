import AuthShell from "@/components/auth/AuthShell";
import CustomSignIn from "@/components/auth/CustomSignIn";

export default function SignInPage() {
  return (
    <AuthShell mode="sign-in">
      <CustomSignIn />
    </AuthShell>
  );
}
