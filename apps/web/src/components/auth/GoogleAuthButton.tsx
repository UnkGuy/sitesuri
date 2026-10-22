"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { clerkErrorMessage } from "@/lib/auth/clerk-error-message";

export default function GoogleAuthButton({ text = "Continue with Google" }: { text?: string }) {
  const { signIn } = useSignIn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function googleAuth() {
    setBusy(true);
    setError("");
    try {
      const result = await signIn.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: "/sso-callback",
        redirectUrl: "/",
      });
      if (result.error) setError(clerkErrorMessage(result.error));
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={googleAuth} disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#DDE3DA] bg-white px-5 text-sm font-bold text-brand-black transition hover:bg-[#F6F8F2] disabled:cursor-wait disabled:opacity-60">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.35 12.2c0-.7-.06-1.35-.18-1.98H12v3.75h5.24a4.47 4.47 0 0 1-1.94 2.93v2.43h3.13c1.83-1.69 2.92-4.18 2.92-7.13Z"/><path fill="#34A853" d="M12 21.5c2.62 0 4.83-.86 6.43-2.33l-3.13-2.43c-.87.59-1.98.94-3.3.94-2.54 0-4.69-1.72-5.46-4.04H3.31v2.5A9.72 9.72 0 0 0 12 21.5Z"/><path fill="#FBBC05" d="M6.54 13.64a5.9 5.9 0 0 1 0-3.28v-2.5H3.31a9.75 9.75 0 0 0 0 8.28l3.23-2.5Z"/><path fill="#EA4335" d="M12 6.32c1.42 0 2.7.49 3.7 1.45l2.77-2.78A9.39 9.39 0 0 0 12 2.5a9.72 9.72 0 0 0-8.69 5.36l3.23 2.5c.77-2.32 2.92-4.04 5.46-4.04Z"/></svg>
        {busy ? "Connecting…" : text}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
