"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSignUp } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, LoaderCircle, MapPinned } from "lucide-react";
import { useState, type FormEvent } from "react";
import { signUpSchema } from "@/lib/validation/auth";
import { useValidatedForm } from "@/hooks/useValidatedForm";
import AuthInput from "./AuthInput";
import GoogleAuthButton from "./GoogleAuthButton";
import { clerkErrorMessage } from "@/lib/auth/clerk-error-message";
import { createInputFilter } from "@/lib/validation/input-filters";
import PasswordRequirements from "./PasswordRequirements";
import VerificationCodeInput from "./VerificationCodeInput";

/** Custom SiteSuri presentation; Clerk retains sign-up, verification, and session handling. */
export default function CustomSignUp() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const form = useValidatedForm(signUpSchema, {
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "verify">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = busy || fetchStatus === "fetching";
  const needsVerification =
    step === "verify" ||
    (signUp.status === "missing_requirements" &&
      signUp.unverifiedFields.includes("email_address") &&
      signUp.missingFields.length === 0);

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const validation = form.validateSubmit();
    if (!validation.success) return;

    setBusy(true);
    try {
      const result = await signUp.password({
        emailAddress: validation.data.email,
        password: validation.data.password,
      });
      if (result.error) {
        setError(clerkErrorMessage(result.error));
        return;
      }

      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        setError(clerkErrorMessage(sent.error));
        return;
      }
      setStep("verify");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the six-digit verification code.");
      return;
    }
    setBusy(true);
    try {
      const result = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      });
      if (result.error) {
        setError(clerkErrorMessage(result.error));
        return;
      }

      if (signUp.status === "complete") {
        const finalized = await signUp.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              setError(
                "Additional account steps are required to finish registration.",
              );
              return;
            }
            const url = decorateUrl("/"); // Update to /dashboard once protected dashboard exists.
            if (url.startsWith("http://") || url.startsWith("https://")) {
              window.location.assign(url);
            } else {
              router.replace(url);
            }
          },
        });
        if (finalized.error) setError(clerkErrorMessage(finalized.error));
      } else {
        setError(
          "Registration is not complete. Check your code and any required account details.",
        );
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-7 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-[15px] bg-brand-yellow text-brand-black shadow-sm">
          <MapPinned size={25} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <h2 className="font-display text-[25px] font-extrabold tracking-[-0.045em] text-brand-black sm:text-[27px]">
          {needsVerification ? "Verify your email" : "Create your account"}
        </h2>
        <p className="mt-2 text-sm text-[#738078]">
          {needsVerification
            ? "Enter the code sent to your email to finish setting up."
            : "Get started with SiteSuri."}
        </p>
      </div>

      {needsVerification ? (
        <>
          <p className="mb-6 text-center text-sm leading-6 text-[#68746D]">
            We sent a code to{" "}
            <strong className="text-brand-black">
              {signUp.emailAddress ?? form.values.email}
            </strong>
            .
          </p>
          <form onSubmit={verify} className="space-y-5">
            <VerificationCodeInput
              id="signup-code"
              label="Email verification code"
              value={code}
              onChange={(nextCode) => {
                setCode(nextCode);
                setError("");
              }}
              disabled={pending}
              error={errors.fields.code?.message}
            />
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || code.length !== 6}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow px-5 text-sm font-extrabold text-brand-black transition hover:bg-[#FDE065] disabled:opacity-60"
            >
              {pending ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />{" "}
                  Verifying...
                </>
              ) : (
                "Verify account"
              )}
            </button>
          </form>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setError("");
              setCode("");
              const result = await signUp.verifications.sendEmailCode();
              if (result.error) setError(clerkErrorMessage(result.error));
            }}
            className="mt-5 text-sm font-semibold text-brand-green hover:underline disabled:opacity-60"
          >
            Resend verification code
          </button>
        </>
      ) : (
        <>
          <form noValidate onSubmit={register} className="space-y-5">
            <AuthInput
              id="signup-email"
              label="Email address"
              type="email"
              value={form.values.email}
              {...createInputFilter("email", form.values.email, (value) =>
                form.onChange("email", value),
              )}
              onBlur={() => form.onBlur("email")}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="you@example.com"
              required
              error={form.errors.email}
            />

            <div>
              <AuthInput
                id="signup-password"
                label="Password"
                type="password"
                value={form.values.password}
                onChange={(event) =>
                  form.onChange("password", event.target.value)
                }
                onBlur={() => form.onBlur("password")}
                autoComplete="new-password"
                placeholder="Create a password"
                required
                error={form.errors.password}
              />

              {form.values.password.length > 0 && (
                <PasswordRequirements password={form.values.password} />
              )}
            </div>

            <AuthInput
              id="signup-confirm"
              label="Confirm password"
              type="password"
              value={form.values.confirmPassword}
              {...createInputFilter(
                "password",
                form.values.confirmPassword,
                (value) => form.onChange("confirmPassword", value),
              )}
              onBlur={() => form.onBlur("confirmPassword")}
              autoComplete="new-password"
              placeholder="Confirm your password"
              required
              error={form.errors.confirmPassword}
            />

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            {/* Keep this mount point for Clerk bot protection. */}
            <div id="clerk-captcha" />
            <button
              type="submit"
              disabled={pending}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow px-5 text-sm font-extrabold text-brand-black shadow-sm transition hover:bg-[#FDE065] disabled:opacity-60"
            >
              {pending ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" /> Creating
                  account...
                </>
              ) : (
                <>
                  Register <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4 text-xs font-medium text-[#909A92]">
            <span className="h-px flex-1 bg-[#E5E9E4]" />
            Or continue with
            <span className="h-px flex-1 bg-[#E5E9E4]" />
          </div>
          <GoogleAuthButton text="Google" />

          <p className="mt-8 text-center text-sm text-[#5F6A63]">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-bold text-brand-green transition hover:underline"
            >
              Sign in
            </Link>
          </p>
          <div className="mt-4 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#68756C] transition hover:text-brand-black"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Back to home
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
