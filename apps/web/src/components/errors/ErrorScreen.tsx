import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Home,
  LockKeyhole,
  MapPinned,
  RefreshCw,
  SearchX,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

type ErrorCode = 401 | 403 | 404 | 500;

type ErrorContent = {
  eyebrow: string;
  heading: string;
  description: string;
  icon: LucideIcon;
  actionText: string;
  actionHref: string;
};

const ERROR_CONTENT: Record<ErrorCode, ErrorContent> = {
  401: {
    eyebrow: "Sign in required",
    heading: "Your journey starts with a sign-in.",
    description:
      "This page is available to registered SiteSuri users. Sign in to continue exploring your locations.",
    icon: LockKeyhole,
    actionText: "Sign in",
    actionHref: "/sign-in",
  },
  403: {
    eyebrow: "Access restricted",
    heading: "This area is off-limits.",
    description:
      "You don't have permission to view this page. If you believe this is a mistake, contact the SiteSuri team.",
    icon: ShieldAlert,
    actionText: "Return home",
    actionHref: "/",
  },
  404: {
    eyebrow: "Page not found",
    heading: "Lost on the map?",
    description:
      "We couldn't find the page you're looking for. It may have moved, or the address might be incorrect.",
    icon: SearchX,
    actionText: "Return home",
    actionHref: "/",
  },
  500: {
    eyebrow: "Unexpected error",
    heading: "We lost our bearings.",
    description:
      "Something went wrong while loading this page. Try again, or return to the homepage.",
    icon: AlertTriangle,
    actionText: "Return home",
    actionHref: "/",
  },
};

interface ErrorScreenProps {
  code: ErrorCode;
  onRetry?: () => void;
}

/** Reusable, presentation-only fallback for SiteSuri routes. */
export default function ErrorScreen({ code, onRetry }: ErrorScreenProps) {
  const details = ERROR_CONTENT[code];
  const IllustrationIcon = details.icon;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-[#141414]">
      {/* Standalone error page branding, independent of the landing navbar. */}
      <header className="mx-auto flex w-full max-w-7xl items-center px-5 py-7 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="SiteSuri home"
          className="inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#15803D]"
        >
          <span className="grid size-10 place-items-center rounded-[13px] bg-[#FACC15] text-[#141414] shadow-sm">
            <MapPinned size={21} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-[-0.055em]">
            Site<span className="text-[#15803D]">Suri</span>
          </span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 pb-16 pt-2 text-center sm:px-8">
        <div className="relative flex h-[210px] w-full items-center justify-center sm:h-[255px]">
          <span
            aria-hidden="true"
            className="pointer-events-none select-none font-display text-[clamp(9rem,29vw,15rem)] font-black leading-none tracking-[-0.095em] text-[#F0F3F2]"
          >
            {code}
          </span>
          <span className="absolute grid size-[84px] -rotate-12 place-items-center rounded-[24px] bg-[#FACC15] text-[#141414] shadow-[0_15px_30px_#1414141A] ring-8 ring-white sm:size-[96px]">
            <IllustrationIcon size={43} strokeWidth={1.9} aria-hidden="true" />
          </span>
        </div>

        <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[#15803D]">
          {details.eyebrow}
        </p>
        <h1 className="font-display mt-4 max-w-2xl text-[clamp(1.85rem,5vw,2.6rem)] font-extrabold tracking-[-0.055em]">
          {details.heading}
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-[#66716C] sm:text-base">
          {details.description}
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-6 text-sm font-extrabold text-[#141414] shadow-sm transition hover:bg-[#FDE065] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#15803D]"
            >
              <RefreshCw size={17} aria-hidden="true" /> Try again
            </button>
          )}
          <Link
            href={details.actionHref}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#15803D] ${
              onRetry
                ? "border border-[#E0E5DE] bg-white text-[#141414] hover:bg-[#F5F7F3]"
                : "bg-[#FACC15] text-[#141414] shadow-sm hover:bg-[#FDE065]"
            }`}
          >
            {details.actionHref === "/" ? (
              <Home size={17} aria-hidden="true" />
            ) : (
              <LockKeyhole size={17} aria-hidden="true" />
            )}
            {details.actionText}
            {details.actionHref !== "/" && (
              <ArrowRight size={16} aria-hidden="true" />
            )}
          </Link>
        </div>
      </main>

      <footer className="px-5 pb-7 text-center text-xs text-[#9AA49B] sm:px-8">
        © 2026 SiteSuri · Built for Filipino MSMEs
      </footer>
    </div>
  );
}
