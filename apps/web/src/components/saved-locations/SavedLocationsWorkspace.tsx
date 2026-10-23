"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, MapPinned, Save, Trash2, ChartNoAxesCombined } from "lucide-react";
import { useClerkApi } from "@/lib/api/client";
import {
  SAVED_LOCATIONS_KEY, getSavedLocations, removeSavedLocation,
  updateSavedLocationNotes, type SavedLocation,
} from "@/features/saved-locations/saved-location-service";
import { getSuitabilityLevel, SUITABILITY_STYLES } from "@/features/analyses/suitability";

function SavedLocationRow({ item, checked, onCheckedChange, onRemove, onNotes, busy }: {
  item: SavedLocation;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  onRemove: () => void;
  onNotes: (notes: string | null) => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const style = SUITABILITY_STYLES[getSuitabilityLevel(item.location_score)];
  return (
    <article className="rounded-2xl border border-[#E5EAE4] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`Compare ${item.address ?? item.location_id}`}
          checked={checked} onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-2 size-4 accent-green-700" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-[#17251B]">{item.address ?? item.source_location_id ?? "Candidate location"}</h2>
          <p className="mt-1 text-xs capitalize text-[#68756D]">{item.business_type} · {new Date(item.created_at).toLocaleDateString()}</p>
          <p className="mt-1 text-xs text-[#68756D]">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</p>
        </div>
        <span className={`shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold ${style.background} ${style.text}`}>
          {item.location_score === null ? "N/A" : `${item.location_score.toFixed(1)}/100`}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
          placeholder="Private notes (optional)" aria-label="Personal notes"
          className="min-w-0 flex-1 rounded-xl border border-[#DDE4DC] bg-white px-3 py-2 text-sm" />
        <button type="button" disabled={busy} onClick={() => onNotes(notes.trim() || null)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#DDE4DC] px-3 py-2 text-xs font-bold hover:bg-[#F5F7F3] disabled:opacity-50">
          <Save size={15} /> Save notes
        </button>
        <button type="button" disabled={busy} onClick={onRemove}
          aria-label={`Remove bookmark for ${item.address ?? item.location_id}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
          <Trash2 size={15} /> Remove
        </button>
      </div>
    </article>
  );
}

export default function SavedLocationsWorkspace() {
  const api = useClerkApi();
  const qc = useQueryClient();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const query = useQuery({ queryKey: SAVED_LOCATIONS_KEY, queryFn: () => getSavedLocations(api), staleTime: 60_000 });
  const remove = useMutation({
    mutationFn: (id: string) => removeSavedLocation(api, id),
    onSuccess: async (_, id) => { setSelectedIds((old) => old.filter((value) => value !== id)); await qc.invalidateQueries({queryKey: SAVED_LOCATIONS_KEY}); },
    onError: () => setActionError("Could not remove this bookmark."),
  });
  const update = useMutation({
    mutationFn: ({id, notes}: {id: string; notes: string | null}) => updateSavedLocationNotes(api, id, notes),
    onSuccess: async () => { await qc.invalidateQueries({queryKey: SAVED_LOCATIONS_KEY}); },
    onError: () => setActionError("Could not update notes."),
  });
  const saved = query.data ?? [];
  function compare() {
    if (!selectedIds.length) return;
    const params = new URLSearchParams({ mode: "saved", ids: selectedIds.join(",") });
    router.push(`/dashboard/analytics?${params.toString()}`);
  }
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand-green">My workspace</p>
          <h1 className="font-display mt-2 text-3xl font-extrabold">Saved locations</h1>
          <p className="mt-2 text-sm text-[#66736B]">Your personal shortlist of SiteSuri candidate locations.</p>
        </div>
        <button type="button" onClick={compare} disabled={selectedIds.length < 1 || selectedIds.length > 20}
          className="inline-flex items-center gap-2 rounded-xl bg-[#171717] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          <ChartNoAxesCombined size={17}/> Compare {selectedIds.length ? `(${selectedIds.length})` : "selected"}
        </button>
      </div>
      {actionError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
      {query.isPending && <p role="status" className="text-sm text-[#66736B]">Loading your saved candidates…</p>}
      {query.isError && <div role="alert" className="space-y-2 text-sm text-red-700"><p>Could not load saved locations.</p><button className="font-bold underline" onClick={() => void query.refetch()}>Retry</button></div>}
      {query.isSuccess && saved.length === 0 && (
        <div className="rounded-2xl border border-[#E5EAE4] bg-white p-8 text-center">
          <BookmarkCheck className="mx-auto text-[#7B867D]" size={36}/>
          <h2 className="mt-3 font-bold">Nothing saved yet</h2>
          <p className="mt-2 text-sm text-[#66736B]">Browse an area and bookmark candidate locations that interest you.</p>
          <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-yellow px-4 py-3 text-sm font-bold"><MapPinned size={17}/> Explore locations</Link>
        </div>
      )}
      {query.isSuccess && saved.length > 0 && (
        <>
          <p className="text-xs text-[#647369]">{saved.length} saved candidate-category entries. Select 1–20 to compare; results are based on the latest stored model scores.</p>
          <div className="space-y-3">{saved.map((item) => (
            <SavedLocationRow key={item.id} item={item} checked={selectedIds.includes(item.id)} busy={remove.isPending || update.isPending}
              onCheckedChange={(value) => setSelectedIds((old) => value ? [...old.filter((id) => id !== item.id), item.id].slice(0,20) : old.filter((id) => id !== item.id))}
              onRemove={() => {setActionError(""); remove.mutate(item.id);}}
              onNotes={(notes) => {setActionError(""); update.mutate({id: item.id, notes});}} />
          ))}</div>
        </>
      )}
      <p className="text-xs text-[#66736B]">Bookmarked locations are private to your authenticated account. Suitability values are synthetic prototype scores, not guaranteed business outcomes.</p>
    </div>
  );
}
