"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, LoaderCircle, MapPinned } from "lucide-react";
import { useState, type FormEvent } from "react";
import { signInSchema } from "@/lib/validation/auth";
import { useValidatedForm } from "@/hooks/useValidatedForm";
import AuthInput from "./AuthInput";
import GoogleAuthButton from "./GoogleAuthButton";
import { clerkErrorMessage } from "@/lib/auth/clerk-error-message";
import { createInputFilter } from "@/lib/validation/input-filters";
import VerificationCodeInput from "./VerificationCodeInput";

/** Presentation is custom; passwords, sessions and OAuth stay with Clerk. */
export default function CustomSignIn() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const form = useValidatedForm(signInSchema, { email: "", password: "" });
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = busy || fetchStatus === "fetching";
  const isVerifying =
    signIn.status === "needs_client_trust" ||
    signIn.status === "needs_second_factor";
  const INVALID_LOGIN_MESSAGE = "Invalid login credentials.";
  const supportsEmailCode =
    signIn.supportedSecondFactors?.some(
      (factor) => factor.strategy === "email_code",
    ) ?? false;

  const finish = async () => {
    const { error: finalizeError } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setError(
            "Additional security steps are required. Complete them in your account settings.",
          );
          return;
        }
        const url = decorateUrl("/dashboard"); // Change to /dashboard after the protected dashboard exists.
        if (url.startsWith("http://") || url.startsWith("https://"))
          window.location.assign(url);
        else router.replace(url);
      },
    });
    if (finalizeError) setError(clerkErrorMessage(finalizeError));
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const validation = form.validateSubmit();
    if (!validation.success) return;

    setBusy(true);
    try {
      const result = await signIn.password({
        emailAddress: validation.data.email,
        password: validation.data.password,
      });
      if (result.error) {
        setError(INVALID_LOGIN_MESSAGE);
        return;
      }
      if (signIn.status === "complete") await finish();
      else if (
        signIn.status === "needs_client_trust" ||
        signIn.status === "needs_second_factor"
      ) {
        const factor = signIn.supportedSecondFactors?.find(
          (item) => item.strategy === "email_code",
        );
        if (factor) {
          const sent = await signIn.mfa.sendEmailCode();
          if (sent.error) setError(clerkErrorMessage(sent.error));
        } else {
          setError(
            "Your account requires another verification method. This form currently supports email codes only.",
          );
        }
      } else
        setError("Additional sign-in steps are required for this account.");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (result.error) {
        setError(clerkErrorMessage(result.error));
        return;
      }
      if (signIn.status === "complete") await finish();
      else setError("Verification isn't complete yet. Please check your code.");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-9 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-[15px] bg-brand-yellow text-brand-black shadow-sm">
          <MapPinned size={25} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <h2 className="font-display text-[25px] font-extrabold tracking-[-0.045em] text-brand-black sm:text-[27px]">
          {isVerifying ? "Verify your sign-in" : "Sign in to your account"}
        </h2>
        <p className="mt-2 text-sm text-[#738078]">
          {isVerifying
            ? "Enter the security code sent to your email."
            : "Welcome back! Please sign in to continue."}
        </p>
      </div>

      {isVerifying ? (
        supportsEmailCode ? (
          <form onSubmit={verifyDevice} className="space-y-5">
            <div className="space-y-3">
              <VerificationCodeInput
                id="login-code"
                value={code}
                onChange={setCode}
                disabled={pending}
              />

              {errors.fields.code?.message && (
                <p role="alert" className="text-sm text-red-700">
                  {errors.fields.code.message}
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || code.length !== 6}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow px-5 text-sm font-extrabold text-brand-black transition hover:bg-[#FDE065] disabled:opacity-60"
            >
              {pending ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                "Verify and sign in"
              )}
            </button>
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const result = await signIn.mfa.sendEmailCode();
                  if (result.error) setError(clerkErrorMessage(result.error));
                }}
                className="font-semibold text-brand-green hover:underline"
              >
                Resend code
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  await signIn.reset();
                  setError("");
                  setCode("");
                }}
                className="text-[#65746C] hover:underline"
              >
                Start over
              </button>
            </div>
          </form>
        ) : (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            This account requires another verification method not yet supported
            by this form.
          </p>
        )
      ) : (
        <>
          <form noValidate onSubmit={submitPassword} className="space-y-5">
            <AuthInput
              id="login-email"
              label="Email"
              type="email"
              maxLength={254}
              value={form.values.email}
              {...createInputFilter("email", form.values.email, (value) =>
                form.onChange("email", value),
              )}
              onBlur={() => form.onBlur("email")}
              autoComplete="email"
              placeholder="you@example.com"
              required
              error={form.errors.email}
            />
            <div>
              <AuthInput
                id="login-password"
                label="Password"
                type="password"
                value={form.values.password}
                {...createInputFilter(
                  "password",
                  form.values.password,
                  (value) => form.onChange("password", value),
                )}
                onBlur={() => form.onBlur("password")}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                error={form.errors.password}
              />
              <div className="mt-2 text-right">
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-brand-green transition hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
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
              disabled={pending}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow px-5 text-sm font-extrabold text-brand-black shadow-sm transition hover:bg-[#FDE065] disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" size={18} /> Signing
                  in...
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="my-8 flex items-center gap-4 text-xs font-medium text-[#909A92]">
            <span className="h-px flex-1 bg-[#E5E9E4]" />
            Or continue with
            <span className="h-px flex-1 bg-[#E5E9E4]" />
          </div>
          <GoogleAuthButton text="Google" />

          <p className="mt-10 text-center text-sm text-[#5F6A63]">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="font-bold text-brand-green transition hover:underline"
            >
              Sign up
            </Link>
          </p>
          <div className="mt-5 text-center">
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
