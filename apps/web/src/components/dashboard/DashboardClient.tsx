"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  ArrowRight,
  MapPinned,
  Menu,
  X,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useClerkApi } from "@/lib/api/client";
import {
  getCurrentUser,
  syncUser,
  type UserSyncPayload,
} from "@/features/users/user-service";
import MapWorkspace, { type GeoPoint } from "./MapWorkspace";
import DashboardSidebar from "./DashboardSidebar";
import CustomSelect from "@/components/ui/CustomSelect";
import AccountMenu from "./AccountMenu";

type PlaceResult = { id: string; name: string; lat: number; lng: number };
const initialPoint: GeoPoint = { lat: 14.5995, lng: 120.9842 }; // Manila center, not a scored candidate.

const BUSINESS_CATEGORY_OPTIONS = [
  { value: "bakery", label: "Bakery" },
  { value: "cafe", label: "Café" },
  { value: "retail", label: "Retail" },
] as const;

const RADIUS_OPTIONS = [250, 500, 1000, 2000].map((meters) => ({
  value: String(meters),
  label: meters >= 1000 ? `${meters / 1000} km` : `${meters} meters`,
}));

function DashboardContent() {
  const { user, isLoaded } = useUser();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const api = useClerkApi();
  const [point, setPoint] = useState<GeoPoint>(initialPoint);
  const [radius, setRadius] = useState(500);
  const [category, setCategory] = useState("bakery");
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const hasBackend = Boolean(process.env.NEXT_PUBLIC_API_URL);

  const profilePayload: UserSyncPayload | null = useMemo(() => {
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return null;
    return {
      email,
      first_name: user?.firstName ?? null,
      last_name: user?.lastName ?? null,
      username: user?.username ?? null,
    };
  }, [user]);

  const account = useQuery({
    queryKey: ["current-user", user?.id],
    enabled: Boolean(hasBackend && user?.id && profilePayload),
    retry: 1,
    staleTime: 300_000,
    queryFn: async () => {
      if (!profilePayload) throw new Error("Clerk profile is unavailable.");
      await syncUser(api, profilePayload);
      return getCurrentUser(api);
    },
  });

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResults([]);
    setSearchMessage("");
    const query = searchTerm.trim();
    if (query.length < 3) {
      setSearchMessage("Enter at least three characters.");
      return;
    }
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      setSearchMessage(
        "Address search is not configured yet. Click anywhere on the map to select a point.",
      );
      return;
    }
    setSearching(true);
    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&country=ph&limit=5`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Search is currently unavailable.");
      const data: {
        features?: Array<{
          id: string;
          place_name?: string;
          center?: number[];
        }>;
      } = await response.json();
      const candidates: PlaceResult[] = (data.features ?? [])
        .filter((item) => item.center?.length === 2)
        .map((item) => ({
          id: item.id,
          name: item.place_name || "Unnamed location",
          lng: item.center![0],
          lat: item.center![1],
        }));
      setResults(candidates);
      if (!candidates.length)
        setSearchMessage("No matching Philippine locations were found.");
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : "Unable to search addresses.",
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAF6] text-[#141414]">
      <header className="sticky top-0 z-50 flex h-20 items-center border-b border-[#E5EAE3] bg-white shadow-sm">
        {/* Match the 72px collapsed rail, so the hamburger and sidebar icons
            share the same horizontal center (36px from the left edge). */}
        <div className="flex h-full w-[72px] shrink-0 items-center justify-center">
          <button
            type="button"
            aria-label="Toggle navigation sidebar"
            aria-controls="sitesuri-sidebar"
            aria-expanded={sidebarExpanded || mobileSidebarOpen}
            onClick={() => {
              if (window.matchMedia("(min-width: 768px)").matches) {
                setSidebarExpanded((value) => !value);
              } else {
                setMobileSidebarOpen((value) => !value);
              }
            }}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-[#354138] transition hover:bg-[#F2F5F0] focus-visible:outline-2 focus-visible:outline-brand-green"
          >
            {mobileSidebarOpen ? (
              <X size={22} aria-hidden="true" className="md:hidden" />
            ) : (
              <Menu size={22} aria-hidden="true" className="md:hidden" />
            )}
            <Menu size={22} aria-hidden="true" className="hidden md:block" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-yellow text-brand-black">
              <MapPinned size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display truncate text-lg font-extrabold tracking-tight">
                Site<span className="text-brand-green">Suri</span>
              </p>
              <p className="hidden text-[11px] text-[#66736B] sm:block">
                Location explorer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AccountMenu />
          </div>
        </div>
      </header>

      <DashboardSidebar
        expanded={sidebarExpanded}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <main
        className={`min-w-0 transition-[margin-left] duration-200 ease-out ${
          sidebarExpanded ? "md:ml-[248px]" : "md:ml-[72px]"
        }`}
        onTransitionEnd={(event) => {
          // MapLibre measures its canvas size separately from CSS layout.
          // Notify it when the sidebar changes the workspace width.
          if (
            event.target === event.currentTarget &&
            event.propertyName === "margin-left"
          ) {
            window.dispatchEvent(new Event("resize"));
          }
        }}
      >
        <div className="mx-auto max-w-[1600px] space-y-6 p-5 lg:p-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-green">
                Geographic research
              </div>
              <h2 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                Where could your business thrive?
              </h2>
              <p className="mt-2 text-sm text-[#66736B]">
                Choose a point on the map and define an analysis area. Scoring
                will be connected to verified data later.
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
            <div className="space-y-5">
              <section
                className="rounded-2xl border border-[#E6EAE3] bg-white p-5 shadow-sm"
                aria-label="Analysis controls"
              >
                <div className="mb-5 flex items-center gap-2 font-bold">
                  <SlidersHorizontal size={18} className="text-brand-green" />{" "}
                  Set analysis criteria
                </div>
                <form onSubmit={searchLocation} className="space-y-2">
                  <label
                    htmlFor="location-search"
                    className="text-xs font-bold text-[#4E5B52]"
                  >
                    Search an address or landmark
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="location-search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      maxLength={200}
                      placeholder="e.g., Sampaloc, Manila"
                      className="min-w-0 flex-1 rounded-xl border border-[#DDE4DC] bg-[#FAFBF9] px-3 py-3 text-sm outline-none focus:border-brand-green"
                    />
                    <button
                      type="submit"
                      disabled={searching}
                      aria-label="Search location"
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-yellow disabled:opacity-60"
                    >
                      <Search size={18} />
                    </button>
                  </div>
                  {searchMessage && (
                    <p
                      role="status"
                      className="text-xs leading-5 text-[#865F00]"
                    >
                      {searchMessage}
                    </p>
                  )}
                  {results.length > 0 && (
                    <ul className="max-h-48 space-y-1 overflow-auto rounded-xl border border-[#E2E6DE] p-1">
                      {results.map((place) => (
                        <li key={place.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#F5F5EF]"
                            onClick={() => {
                              setPoint({ lat: place.lat, lng: place.lng });
                              setResults([]);
                              setSearchTerm(place.name);
                            }}
                          >
                            {place.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </form>
                <div className="mt-6">
                  <CustomSelect
                    id="business-category"
                    label="Business category"
                    value={category}
                    onValueChange={setCategory}
                    options={BUSINESS_CATEGORY_OPTIONS}
                  />
                </div>
                <div className="mt-6">
                  <CustomSelect
                    id="analysis-radius"
                    label="Analysis radius"
                    value={String(radius)}
                    onValueChange={(value) => setRadius(Number(value))}
                    options={RADIUS_OPTIONS}
                  />
                </div>
                <div className="mt-6 rounded-xl bg-[#F6F8F3] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#68756D]">
                    Selected coordinates
                  </p>
                  <p className="mt-2 font-mono text-sm font-semibold">
                    {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                  </p>
                  <p className="mt-1 text-xs text-[#718076]">
                    Choose another point by clicking the map.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#171717] px-4 py-3 text-sm font-bold text-white opacity-55"
                  title="Requires location dataset and scoring API"
                >
                  Analyze location <ArrowRight size={16} />
                </button>
                <p className="mt-2 text-center text-[11px] text-[#7A877E]">
                  Analysis activates after geographic scoring integration.
                </p>
              </section>
              <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm">
                <h3 className="text-sm font-extrabold">Account connection</h3>
                <p className="mt-1 text-xs text-[#78847C]">
                  Clerk session → FastAPI → Supabase
                </p>
                <p
                  role="status"
                  className="mt-3 text-xs leading-5 text-[#425348]"
                >
                  {!hasBackend
                    ? "Backend not connected. Add NEXT_PUBLIC_API_URL when FastAPI is running."
                    : account.isPending
                      ? "Syncing your profile..."
                      : account.isError
                        ? "Profile sync unavailable. Confirm the API, Clerk keys, database, and CORS."
                        : `Connected as ${account.data?.email}`}
                </p>
              </section>
            </div>

            <div className="space-y-5">
              <div className="h-[480px] overflow-hidden rounded-2xl bg-white shadow-sm lg:h-[600px]">
                <MapWorkspace
                  point={point}
                  radiusMeters={radius}
                  onPickPoint={setPoint}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#E5EAE4] bg-white p-5">
                  <p className="text-xs text-[#6B786F]">Business type</p>
                  <p className="mt-2 text-xl font-bold capitalize">
                    {category === "cafe" ? "Café" : category}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5EAE4] bg-white p-5">
                  <p className="text-xs text-[#6B786F]">Analysis radius</p>
                  <p className="mt-2 text-xl font-bold">
                    {radius.toLocaleString()} m
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5EAE4] bg-white p-5">
                  <p className="text-xs text-[#6B786F]">Suitability score</p>
                  <p className="mt-2 text-xl font-bold text-[#8A948C]">
                    Not available yet
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-[#F1DEA6] bg-[#FFF9E5] px-5 py-4 text-sm text-[#685721]">
                <ShieldCheck className="mt-0.5 shrink-0" size={18} />
                <p>
                  Map position and radius are real interactive controls. No
                  pedestrian measurements, predictions, or suitability scores
                  are being generated at this stage.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardClient() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <DashboardContent />
    </QueryClientProvider>
  );
}
