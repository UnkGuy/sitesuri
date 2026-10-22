import { LoaderCircle, MapPinned } from "lucide-react";

type AuthLoadingProps = {
  mode?: "sign-in" | "sign-up";
};

export default function AuthLoading({ mode = "sign-in" }: AuthLoadingProps) {
  const isSignIn = mode === "sign-in";

  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center bg-[#F8FAF7] px-4 py-8 sm:px-6"
    >
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-[#E7EBE5] bg-white shadow-[0_24px_80px_rgba(15,23,15,0.06)] md:min-h-[680px] md:grid-cols-2">
        {/* Left branding panel */}
        <section className="flex flex-col p-8 sm:p-12">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-brand-yellow text-brand-black">
              <MapPinned size={24} strokeWidth={2.3} />
            </div>

            <span className="font-display text-2xl font-extrabold tracking-tight text-brand-black">
              Site<span className="text-brand-green">Suri</span>
            </span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
            <div className="relative grid size-36 place-items-center rounded-[36px] bg-[#FFF7D4]">
              <MapPinned
                size={72}
                strokeWidth={1.8}
                className="text-brand-black"
                aria-hidden="true"
              />

              <span className="absolute -bottom-2 -right-2 grid size-14 place-items-center rounded-2xl border-4 border-white bg-brand-yellow">
                <LoaderCircle
                  size={24}
                  className="animate-spin text-brand-black motion-reduce:animate-none"
                  aria-hidden="true"
                />
              </span>
            </div>

            <h1 className="mt-10 font-display text-3xl font-extrabold tracking-tight text-brand-black">
              {isSignIn ? "Welcome back." : "Join SiteSuri."}
            </h1>

            <p className="mt-4 max-w-xs text-sm leading-7 text-[#738078]">
              Your next business opportunity starts with a smarter location.
            </p>
          </div>

          <p className="text-center text-xs text-[#9AA69F] md:text-left">
            © 2026 SiteSuri · Built for Filipino MSMEs
          </p>
        </section>

        {/* Right loading skeleton */}
        <section className="flex flex-col items-center justify-center border-t border-[#EEF1EB] p-8 sm:p-12 md:border-l md:border-t-0">
          <div className="w-full max-w-md">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-yellow">
              <MapPinned
                size={28}
                strokeWidth={2.3}
                className="text-brand-black"
                aria-hidden="true"
              />
            </div>

            <h2 className="mt-7 text-center font-display text-2xl font-extrabold tracking-tight text-brand-black">
              {isSignIn ? "Preparing your sign-in" : "Preparing registration"}
            </h2>

            <p className="mt-3 text-center text-sm text-[#738078]">
              Setting up your secure authentication.
            </p>

            <div
              aria-hidden="true"
              className="mt-10 space-y-6 animate-pulse motion-reduce:animate-none"
            >
              <div className="space-y-3">
                <div className="h-3 w-28 rounded-full bg-[#E7EBE5]" />
                <div className="h-13 rounded-xl bg-[#F0F3EF]" />
              </div>

              <div className="space-y-3">
                <div className="h-3 w-24 rounded-full bg-[#E7EBE5]" />
                <div className="h-13 rounded-xl bg-[#F0F3EF]" />
              </div>

              <div className="h-12 rounded-xl bg-[#FFF1AF]" />
            </div>

            <div className="mt-9 flex items-center justify-center gap-2 text-sm font-medium text-[#738078]">
              <LoaderCircle
                size={17}
                className="animate-spin text-brand-green motion-reduce:animate-none"
                aria-hidden="true"
              />
              Loading securely...
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
