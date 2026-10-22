import AuthShell from "@/components/auth/AuthShell";
import CustomForgotPassword from "@/components/auth/CustomForgotPassword";

export default function ForgotPasswordPage() {
  return <AuthShell mode="reset"><CustomForgotPassword /></AuthShell>;
}
