import Link from "next/link";
import { MapPinned } from "lucide-react";
import CustomForgotPassword from "@/components/auth/CustomForgotPassword";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9F7] px-4 py-10 text-brand-black sm:px-6">
      <div className="w-full max-w-[480px]">
        {/* SiteSuri branding */}
        <Link
          href="/"
          aria-label="Return to SiteSuri homepage"
          className="mx-auto mb-8 flex w-fit items-center gap-2.5"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-brand-yellow text-brand-black shadow-sm">
            <MapPinned size={23} strokeWidth={2.4} aria-hidden="true" />
          </span>

          <span className="font-display text-2xl font-extrabold tracking-[-0.055em]">
            Site<span className="text-brand-green">Suri</span>
          </span>
        </Link>

        {/* Single recovery form */}
        <CustomForgotPassword />
      </div>
    </main>
  );
}
