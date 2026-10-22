"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import AuthInput from "./AuthInput";
import { clerkErrorMessage } from "@/lib/auth/clerk-error-message";

export default function CustomForgotPassword() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = busy || fetchStatus === "fetching";

  const sendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const attempt = await signIn.create({ identifier: email.trim() });
      if (attempt.error) { setError(clerkErrorMessage(attempt.error)); return; }
      const result = await signIn.resetPasswordEmailCode.sendCode();
      if (result.error) { setError(clerkErrorMessage(result.error)); return; }
      setCodeSent(true);
    } catch (err) { setError(clerkErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (result.error) setError(clerkErrorMessage(result.error));
    } catch (err) { setError(clerkErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const setNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
      if (result.error) { setError(clerkErrorMessage(result.error)); return; }
      if (signIn.status === "complete") {
        const finalized = await signIn.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) { setError("Additional account verification is required."); return; }
            const url = decorateUrl("/");
            if (url.startsWith("http://") || url.startsWith("https://")) window.location.assign(url);
            else router.replace(url);
          },
        });
        if (finalized.error) setError(clerkErrorMessage(finalized.error));
      } else if (signIn.status === "needs_second_factor") {
        setError("Additional verification is required. This custom form does not yet support that method.");
      } else setError("Password reset is not complete. Please try again.");
    } catch (err) { setError(clerkErrorMessage(err)); }
    finally { setBusy(false); }
  };

  let title = "Reset your password";
  if (signIn.status === "needs_new_password") title = "Choose a new password";
  else if (codeSent) title = "Check your email";

  return (
    <div className="w-full rounded-[24px] border border-[#E3E7DE] bg-white p-6 shadow-[0_15px_50px_#0000000A] sm:p-8">
      <h3 className="mb-2 text-xl font-extrabold">{title}</h3>
      <p className="mb-6 text-sm leading-6 text-[#68746D]">{signIn.status === "needs_new_password" ? "Enter a new password to secure your account." : codeSent ? "Enter the reset code sent to your email address." : "We'll send you a secure email verification code."}</p>
      {signIn.status === "needs_second_factor" && <p role="alert" className="mb-4 text-sm text-red-700">Additional verification is required and isn't supported by this form yet.</p>}
      {signIn.status === "needs_new_password" ? (
        <form onSubmit={setNewPassword} className="space-y-5">
          <AuthInput id="reset-new-password" label="New password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required error={errors.fields.password?.message}/>
          <button disabled={pending} className="min-h-12 w-full rounded-xl bg-brand-yellow font-bold text-brand-black disabled:opacity-60">{pending ? "Saving…" : "Save new password"}</button>
        </form>
      ) : codeSent ? (
        <form onSubmit={verifyCode} className="space-y-5">
          <AuthInput id="reset-code" label="Reset code" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required error={errors.fields.code?.message}/>
          <button disabled={pending} className="min-h-12 w-full rounded-xl bg-brand-yellow font-bold text-brand-black disabled:opacity-60">{pending ? "Checking…" : "Verify code"}</button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-5">
          <AuthInput id="reset-email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required error={errors.fields.identifier?.message}/>
          <button disabled={pending} className="min-h-12 w-full rounded-xl bg-brand-yellow font-bold text-brand-black disabled:opacity-60">{pending ? "Sending…" : "Send reset code"}</button>
        </form>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <p className="mt-6 text-center text-sm text-[#647067]"><Link href="/sign-in" className="font-bold text-brand-green hover:underline">Back to log in</Link></p>
    </div>
  );
}
