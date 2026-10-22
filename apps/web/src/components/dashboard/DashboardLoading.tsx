import { MapPinned } from "lucide-react";

export default function DashboardLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#F7F8F3] px-5"
    >
      {/* Subtle map-inspired background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(#DDE5D9 1px, transparent 1px), linear-gradient(90deg, #DDE5D9 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-md rounded-3xl border border-[#E8EBE4] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,15,0.08)] sm:p-12">
        {/* Brand icon */}
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-yellow shadow-sm">
          <MapPinned
            size={32}
            strokeWidth={2.4}
            className="text-brand-black"
            aria-hidden="true"
          />
        </div>

        {/* Logo */}
        <div className="mt-5 font-display text-2xl font-extrabold tracking-tight">
          <span className="text-brand-black">Site</span>
          <span className="text-brand-green">Suri</span>
        </div>

        {/* Message */}
        <h1 className="mt-7 font-display text-xl font-extrabold tracking-tight text-brand-black sm:text-2xl">
          Preparing your dashboard
        </h1>

        <p className="mt-3 text-sm leading-6 text-[#738078]">
          Getting your location workspace ready.
        </p>

        {/* Animated indicator */}
        <div
          className="mt-8 flex items-center justify-center gap-2"
          aria-hidden="true"
        >
          <span className="size-2.5 animate-bounce rounded-full bg-brand-yellow motion-reduce:animate-none" />
          <span className="size-2.5 animate-bounce rounded-full bg-brand-green [animation-delay:150ms] motion-reduce:animate-none" />
          <span className="size-2.5 animate-bounce rounded-full bg-brand-yellow [animation-delay:300ms] motion-reduce:animate-none" />
        </div>

        <p className="mt-5 text-xs font-medium text-[#89958A]">
          Loading dashboard...
        </p>
      </div>
    </main>
  );
}
