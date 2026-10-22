import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  Compass,
  MapPinned,
  ShieldCheck,
  Sparkles,
  LockKeyhole,
} from "lucide-react";
import type { ReactNode } from "react";

type AuthMode = "sign-in" | "sign-up" | "reset";

type AuthShellProps = {
  mode: AuthMode;
  children: ReactNode;
};

const benefitItems = [
  "Understand the businesses and landmarks around a location.",
  "Compare geographic suitability factors with clear explanations.",
  "Explore time-based scenarios with transparent data labels.",
];

export default function AuthShell({ mode, children }: AuthShellProps) {
  const isSignIn = mode === "sign-in";
  const isSignUp = mode === "sign-up";

  // Login and registration share a minimal, LeafTrade-inspired white card.
  // Password recovery retains its original layout.
  if (isSignIn || isSignUp) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9F7] px-4 py-7 text-brand-black sm:px-6 lg:py-12">
        <div className="grid w-full max-w-[1140px] overflow-hidden rounded-[26px] border border-[#EBEEE9] bg-white shadow-[0_20px_80px_#1414140D] lg:min-h-[680px] lg:grid-cols-2">
          <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[#F0F1EE] px-12 py-10 lg:flex">
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2.5"
              aria-label="SiteSuri homepage"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-brand-yellow text-brand-black">
                <MapPinned size={21} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="font-display text-[22px] font-extrabold tracking-[-0.055em]">
                Site<span className="text-brand-green">Suri</span>
              </span>
            </Link>

            <div className="mx-auto flex max-w-[340px] flex-col items-center text-center">
              <div className="relative mb-8 grid size-36 place-items-center rounded-[36px] bg-[#FFF7D6] text-brand-black">
                {isSignIn ? (
                  <MapPinned size={76} strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <Compass size={76} strokeWidth={1.8} aria-hidden="true" />
                )}
                <span className="absolute -bottom-3 -right-3 grid size-[66px] place-items-center rounded-[22px] border-[6px] border-white bg-brand-yellow">
                  {isSignIn ? (
                    <LockKeyhole size={30} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <MapPinned size={30} strokeWidth={2} aria-hidden="true" />
                  )}
                </span>
              </div>
              <h1 className="font-display text-[28px] font-extrabold tracking-[-0.045em]">
                {isSignIn ? "Welcome back." : "Start somewhere better."}
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#68746F]">
                {isSignIn
                  ? "Your next business opportunity starts with a smarter location."
                  : "Explore possibilities. Save the places that matter."}
              </p>
            </div>

            <p className="text-xs text-[#98A29B]">
              &copy; {new Date().getFullYear()} SiteSuri · Built for Filipino
              MSMEs
            </p>
          </aside>

          <section
            className="flex min-w-0 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-16"
            aria-label={
              isSignIn ? "Sign in to SiteSuri" : "Register for SiteSuri"
            }
          >
            <Link
              href="/"
              className="mb-9 inline-flex w-fit items-center gap-2 lg:hidden"
              aria-label="SiteSuri homepage"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-brand-yellow text-brand-black">
                <MapPinned size={19} aria-hidden="true" />
              </span>
              <span className="font-display text-xl font-extrabold tracking-tight">
                SiteSuri
              </span>
            </Link>
            <div className="mx-auto w-full max-w-[440px]">{children}</div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F8F5] text-brand-black lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <aside className="relative isolate overflow-hidden bg-brand-black px-6 pb-10 pt-6 text-white sm:px-10 sm:pt-10 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 top-24 size-[480px] rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-40 size-[360px] rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-20 size-[340px] rounded-full bg-[#34451F]/50 blur-[90px]"
        />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5"
            aria-label="SiteSuri homepage"
          >
            <span className="grid size-10 place-items-center rounded-[13px] bg-brand-yellow text-brand-black">
              <MapPinned size={21} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="font-display text-[23px] font-extrabold tracking-[-0.06em]">
              Site<span className="text-brand-yellow">Suri</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#DDE0D9] transition hover:text-brand-yellow sm:text-sm"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to home
          </Link>
        </div>

        <div className="relative z-10 mx-auto mt-14 max-w-[530px] lg:my-12 lg:mx-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#625D32] bg-[#302E1C] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFE28A]">
            <Sparkles size={14} aria-hidden="true" />
            Built for Filipino MSMEs
          </span>

          <h1 className="font-display mt-7 text-[clamp(2.5rem,4.2vw,4.6rem)] font-extrabold leading-[1.1] tracking-[-0.065em]">
            {isSignIn ? (
              <>
                Make your next move{" "}
                <span className="text-brand-yellow">with clarity.</span>
              </>
            ) : (
              <>
                Find a better place{" "}
                <span className="text-brand-yellow">to grow.</span>
              </>
            )}
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-[#BDC5BA] sm:text-base sm:leading-8">
            SiteSuri brings nearby competition, accessibility, and location
            suitability into one place—so decisions start with better context.
          </p>

          <ul className="mt-8 space-y-4">
            {benefitItems.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm leading-6 text-[#D9DED5]"
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                  <Check size={14} strokeWidth={3} aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-10 rounded-[24px] border border-white/15 bg-white/[0.07] p-5 backdrop-blur-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold">
                <Compass
                  size={17}
                  className="text-brand-yellow"
                  aria-hidden="true"
                />
                Location insights
              </span>
              <span className="rounded-full bg-brand-yellow/15 px-3 py-1 text-[10px] font-bold text-brand-yellow">
                Illustrative preview
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-white/10 px-3 py-4 text-center">
                <MapPinned
                  className="mx-auto text-brand-yellow"
                  size={23}
                  aria-hidden="true"
                />
                <p className="mt-2 text-[11px] font-semibold">Location</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-4 text-center">
                <BarChart3
                  className="mx-auto text-brand-yellow"
                  size={23}
                  aria-hidden="true"
                />
                <p className="mt-2 text-[11px] font-semibold">Analytics</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-4 text-center">
                <ShieldCheck
                  className="mx-auto text-brand-yellow"
                  size={23}
                  aria-hidden="true"
                />
                <p className="mt-2 text-[11px] font-semibold">Evidence</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#BFC6B8]">
              We distinguish real geographic information from experimental or
              simulated activity estimates.
            </p>
          </div>
        </div>

        <p className="relative z-10 mt-10 hidden text-xs text-[#ADB5A7] lg:block">
          &copy; {new Date().getFullYear()} SiteSuri · Location intelligence for
          Filipino MSMEs
        </p>
      </aside>

      <section className="flex min-h-[540px] items-center justify-center px-4 py-12 sm:px-8 lg:px-12 lg:py-20">
        <div className="w-full max-w-[490px]">
          <div className="mb-7 px-1">
            <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-green">
              {mode === "reset"
                ? "Account recovery"
                : isSignIn
                  ? "Welcome back"
                  : "Join SiteSuri"}
            </span>
            <h2 className="font-display mt-3 text-3xl font-extrabold tracking-[-0.055em] text-brand-black sm:text-4xl">
              {mode === "reset"
                ? "Reset your password."
                : isSignIn
                  ? "Log in to your account."
                  : "Create your account."}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#647067]">
              {mode === "reset"
                ? "Verify your email and securely set a new password."
                : isSignIn
                  ? "Continue exploring business locations and your saved research."
                  : "Start building a shortlist of potential business locations."}
            </p>
          </div>

          <div className="w-full">{children}</div>

          <div className="mt-7 px-1 text-center text-sm text-[#647067]">
            Not ready to create an account?{" "}
            <Link
              href="/#demo"
              className="inline-flex items-center gap-1 font-bold text-brand-black underline decoration-brand-yellow decoration-[3px] underline-offset-4 transition hover:text-brand-green"
            >
              Explore the public demo
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-8 text-center text-xs leading-6 text-[#829087]">
            Authentication powered by Clerk. SiteSuri is a decision-support
            platform, not a guarantee of business success.
          </p>
        </div>
      </section>
    </main>
  );
}
