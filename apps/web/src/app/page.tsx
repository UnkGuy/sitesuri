import Link from "next/link";
import GuestDemo from "@/components/landing/GuestDemo";
import ScrollToSectionLink from "@/components/ui/ScrollToSectionLink";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Compass,
  MapPinned,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";

const features = [
  {
    icon: MapPinned,
    title: "Analyze precise locations",
    description:
      "Search a neighborhood or select a specific map point. Choose how far SiteSuri should look around it.",
  },
  {
    icon: Store,
    title: "Understand the surroundings",
    description:
      "Compare nearby competitors, business activity generators, and accessibility using available geographic data.",
  },
  {
    icon: BarChart3,
    title: "Explore activity scenarios",
    description:
      "Examine time-based activity patterns and experimental forecasts, clearly marked when based on simulated data.",
  },
  {
    icon: ShieldCheck,
    title: "See why a site ranks",
    description:
      "Break down location scores by factor, with data-source labels and missing-data indicators.",
  },
];

function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="SiteSuri home"
      className="inline-flex items-center gap-2.5"
    >
      <span className="grid size-10 place-items-center rounded-[13px] bg-brand-yellow text-brand-black shadow-sm">
        <MapPinned size={21} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span
        className={`font-display text-[21px] font-extrabold tracking-[-0.06em] ${inverted ? "text-white" : "text-brand-black"}`}
      >
        Site<span className="text-brand-green">Suri</span>
      </span>
    </Link>
  );
}

function PreviewMap() {
  return (
    <div className="relative isolate h-[275px] overflow-hidden bg-[#ECEEE6] sm:h-[325px]">
      {/* Diagrammatic streets: not a real map or geocoded SiteSuri output. */}
      <svg
        viewBox="0 0 620 340"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="620" height="340" fill="#EBEEE6" />
        <path
          d="M-50 120 L200 35 L440 80 L675 -20"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="26"
        />
        <path
          d="M-40 236 L220 154 L420 205 L700 102"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="21"
        />
        <path
          d="M-50 330 L200 257 L455 320 L650 256"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="22"
        />
        <path
          d="M75 -60 L180 390 M270 -45 L346 385 M464 -40 L526 390"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="21"
        />
        <path
          d="M-50 120 L200 35 L440 80 L675 -20"
          fill="none"
          stroke="#D4DAD0"
          strokeWidth="1.5"
        />
        <path
          d="M-40 236 L220 154 L420 205 L700 102"
          fill="none"
          stroke="#D4DAD0"
          strokeWidth="1.5"
        />
        <path
          d="M-50 330 L200 257 L455 320 L650 256"
          fill="none"
          stroke="#D4DAD0"
          strokeWidth="1.5"
        />
        <rect x="18" y="25" width="80" height="44" rx="8" fill="#D3DFC9" />
        <rect x="520" y="182" width="82" height="77" rx="8" fill="#D3DFC9" />
        <rect x="306" y="98" width="85" height="51" rx="8" fill="#D3DFC9" />
        <rect x="42" y="260" width="80" height="35" rx="6" fill="#E0E3D8" />
        <rect x="213" y="77" width="38" height="41" rx="4" fill="#E0E3D8" />
        <rect x="378" y="240" width="58" height="34" rx="5" fill="#E0E3D8" />
        <circle
          cx="310"
          cy="176"
          r="111"
          fill="#FACC15"
          fillOpacity=".07"
          stroke="#BE921A"
          strokeWidth="2"
          strokeDasharray="7 7"
        />
        <circle cx="310" cy="176" r="4" fill="#222222" />
        <text x="34" y="203" fontSize="13" fill="#84918A" fontWeight="700">
          CAMPUS AREA
        </text>
        <text x="450" y="65" fontSize="13" fill="#84918A" fontWeight="700">
          MARKET ROAD
        </text>
        <text x="463" y="302" fontSize="12" fill="#84918A" fontWeight="700">
          CITY CENTER
        </text>
      </svg>
      <span className="absolute left-[26%] top-[20%] grid size-11 place-items-center rounded-full border-[3px] border-white bg-brand-green font-extrabold text-white shadow-[0_5px_15px_#00000033]">
        A
      </span>
      <span className="absolute left-[62%] top-[38%] grid size-11 place-items-center rounded-full border-[3px] border-white bg-brand-yellow font-extrabold text-brand-black shadow-[0_5px_15px_#00000033]">
        B
      </span>
      <span className="absolute left-[46%] top-[72%] grid size-11 place-items-center rounded-full border-[3px] border-white bg-brand-red font-extrabold text-white shadow-[0_5px_15px_#00000033]">
        C
      </span>
      <span className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-2 text-[11px] font-semibold text-[#52615B] shadow-sm">
        Concept illustration · No real-world scores
      </span>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="rounded-[25px] border border-[#E2E4DF] bg-white p-3 shadow-[0_28px_65px_#00000012] sm:p-4">
      <div className="overflow-hidden rounded-[16px] border border-[#E7EAE4]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EAE4] bg-white px-4 py-3">
          <span className="inline-flex items-center gap-2 text-[13px] font-bold text-brand-black">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-black text-brand-yellow">
              <Compass size={15} />
            </span>
            Location Explorer
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF5C6] px-2.5 py-1 text-[10px] font-bold text-[#846211]">
            Concept preview
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b border-[#E7EAE4] px-3 py-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E7EAE4] bg-[#F8F9F7] px-3 py-2.5 text-xs text-[#52605C]">
              <Search size={15} className="shrink-0" aria-hidden="true" />
              <span className="truncate">Sampaloc, Manila</span>
            </div>
            <span className="rounded-lg bg-brand-yellow px-3 py-2.5 text-[11px] font-bold text-brand-black">
              500 m
            </span>
          </div>
          <PreviewMap />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#E7EAE4] bg-[#FBFCFA] px-4 py-3 text-[10px] font-semibold text-[#59655F]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-green" /> High
            suitability
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-yellow" /> Moderate
            suitability
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-red" /> Low
            suitability
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-white text-brand-black">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-black/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Brand inverted />
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-8 text-sm font-medium text-[#D4D4D4] md:flex"
          >
            <ScrollToSectionLink
              href="#features"
              className="transition hover:text-brand-yellow"
            >
              Features
            </ScrollToSectionLink>
            <ScrollToSectionLink
              href="#about"
              className="transition hover:text-brand-yellow"
            >
              About
            </ScrollToSectionLink>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/sign-in"
              className="rounded-full px-2.5 py-2.5 text-xs font-semibold text-white transition hover:text-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow sm:px-4 sm:text-sm"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-full bg-brand-yellow px-3.5 py-2.5 text-xs font-extrabold text-brand-black transition hover:bg-[#FDE065] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow sm:px-5 sm:text-sm"
            >
              Register{" "}
              <ArrowUpRight
                size={15}
                className="ml-1.5 hidden sm:block"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-brand-black text-white">
          <div
            className="absolute -right-44 -top-44 size-[530px] rounded-full border border-white/10"
            aria-hidden="true"
          />
          <div
            className="absolute -right-20 -top-16 size-[380px] rounded-full border border-white/10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-44 -left-40 size-[480px] rounded-full bg-[#26301A] blur-[100px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:px-10 lg:pb-28 lg:pt-24">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#64603B] bg-[#2E2C20] px-3.5 py-2 text-[11px] font-bold tracking-wide text-[#FFE88E] sm:text-xs">
                <span className="size-2 rounded-full bg-brand-yellow" /> Built
                for Filipino MSMEs
              </span>
              <h1 className="font-display mt-7 text-[clamp(2.9rem,5.3vw,5.2rem)] font-extrabold leading-[1.09] tracking-[-0.065em]">
                Find the right spot for{" "}
                <span className="text-brand-yellow">what&apos;s next.</span>
              </h1>
              <p className="mt-6 max-w-[490px] text-[15px] leading-8 text-[#BFC4BE] sm:text-base">
                Stop choosing business locations on instinct alone. Explore
                nearby competition, accessibility, and location-based
                opportunity indicators—all in one place.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ScrollToSectionLink
                  href="#demo"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-yellow px-6 py-4 text-sm font-extrabold text-brand-black shadow-[0_10px_30px_#FACC151A] transition hover:-translate-y-0.5 hover:bg-[#FDE065]"
                >
                  Try the public demo{" "}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </ScrollToSectionLink>
                <ScrollToSectionLink
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#525252] px-6 py-4 text-sm font-bold text-white transition hover:border-[#8B8B8B] hover:bg-white/5"
                >
                  Explore features <ArrowRight size={17} aria-hidden="true" />
                </ScrollToSectionLink>
              </div>
            </div>
            <div className="relative lg:translate-x-3">
              <div
                className="pointer-events-none absolute -inset-5 rounded-[32px] bg-brand-yellow/10 blur-[45px]"
                aria-hidden="true"
              />
              <DashboardPreview />
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-2xl">
              <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-green">
                Built for better decisions
              </span>
              <h2 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.05em] text-brand-black sm:text-5xl">
                Look beyond the address.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#66716C]">
                A good business location takes more than a familiar street name.
                SiteSuri brings relevant geographic indicators into one
                understandable view.
              </p>
            </div>
            <div className="mt-11 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, description }, index) => (
                <article
                  key={title}
                  className="group rounded-[22px] border border-[#E8ECE7] bg-white p-6 transition hover:-translate-y-1 hover:border-[#F0D46D] hover:shadow-[0_15px_34px_#0000000A]"
                >
                  <div
                    className={`mb-7 grid size-12 place-items-center rounded-[15px] ${index === 0 ? "bg-brand-yellow text-brand-black" : "bg-[#EFF5EB] text-brand-green"}`}
                  >
                    <Icon size={24} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-[17px] font-extrabold tracking-[-0.03em]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#6E7872]">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="demo"
          aria-labelledby="demo-heading"
          className="scroll-mt-24 border-y border-[#E6E9E2] bg-[#FBFBF8] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF3BA] px-3.5 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#6B5200]">
                <Compass size={15} aria-hidden="true" /> Free public demo
              </span>
              <h2
                id="demo-heading"
                className="font-display mt-5 text-4xl font-extrabold tracking-[-0.05em] text-brand-black sm:text-5xl"
              >
                Explore before you register.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#647067] sm:text-base">
                See how business type changes the suitability of example
                locations. Experiment with the scores below—no account needed.
              </p>
            </div>
            <GuestDemo />
          </div>
        </section>

        <section id="about" className="scroll-mt-24 bg-white py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:px-10">
            {/* About SiteSuri */}
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-green">
                Built with transparency
              </span>

              <h2 className="font-display mt-4 max-w-xl text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">
                A score should start a conversation, not end it.
              </h2>

              <p className="mt-5 max-w-xl text-base leading-8 text-[#66716C]">
                A promising location score is a starting point for research, not
                a prediction of sales. It can help compare trade-offs, but the
                outcome depends on business type, local conditions, and data
                coverage.
              </p>

              <p className="mt-5 max-w-xl text-sm leading-7 text-[#66716C]">
                We distinguish sourced geographic information from synthetic
                scenarios, explain how factors are assessed, and make
                unsupported conclusions visible.
              </p>

              <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-[#E6E9E2] bg-[#F8FAF6] px-4 py-3">
                <ShieldCheck
                  size={21}
                  className="shrink-0 text-brand-green"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-[#435147]">
                  Inspect the evidence behind every score.
                </span>
              </div>
            </div>

            {/* Data and methodology */}
            <div className="rounded-[28px] bg-[#141414] p-7 text-white sm:p-9">
              <div className="mb-8 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-[#CED5CA]">
                  Data & limitations
                </span>

                <span className="rounded-full bg-[#2D3D27] px-3 py-1 text-xs font-bold text-[#B5EAB1]">
                  Source-aware
                </span>
              </div>

              <div className="space-y-7">
                {[
                  {
                    icon: MapPinned,
                    number: "01",
                    title: "Mapped information",
                    description:
                      "Mapped establishments and access features provide useful context, but coverage can vary by area and source.",
                  },
                  {
                    icon: BarChart3,
                    number: "02",
                    title: "Simulation, not observation",
                    description:
                      "Synthetic activity scenarios and model outputs are labeled clearly. They are not measured pedestrian counts.",
                  },
                  {
                    icon: ShieldCheck,
                    number: "03",
                    title: "Known limitations",
                    description:
                      "Scores should reveal missing evidence and never imply that a site is vacant, permitted for business, or guaranteed to perform.",
                  },
                ].map(({ icon: Icon, number, title, description }) => (
                  <div key={number} className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#302D1D] text-brand-yellow">
                      <Icon size={23} strokeWidth={1.9} aria-hidden="true" />
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-bold tracking-[0.16em] text-brand-yellow">
                        {number}
                      </span>

                      <h3 className="font-display mt-1 text-base font-extrabold tracking-[-0.02em] text-white">
                        {title}
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-[#ADB7AC]">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-[#3C423A] pt-5">
                <p className="text-xs leading-6 text-[#B8C0B6]">
                  <span className="font-bold text-brand-yellow">
                    Important:
                  </span>{" "}
                  SiteSuri provides decision-support insights, not guarantees of
                  profitability, property availability, or permission to
                  operate.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-brand-yellow px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#68500A]">
                Explore with purpose
              </span>
              <h2 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.055em] text-brand-black sm:text-5xl">
                Find a better place for your next business.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#5A4A14] sm:text-base">
                Create your account to explore location intelligence and build
                your business shortlist.
              </p>
            </div>
            <Link
              href="/sign-up"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-black px-6 py-4 text-sm font-extrabold text-white transition hover:bg-[#363636]"
            >
              Get Started <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-brand-black py-9 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <Brand inverted />
          <p className="text-xs leading-6 text-[#ABB3AA]">
            Geospatial decision support for Filipino MSMEs.
          </p>
          <ScrollToSectionLink
            href="#features"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-yellow hover:underline"
          >
            Back to features <ChevronRight size={14} />
          </ScrollToSectionLink>
        </div>
      </footer>
    </div>
  );
}
