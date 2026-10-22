"use client";

/* eslint-disable @next/next/no-img-element -- Clerk profile image URLs are dynamic. */

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ChevronDown, ShieldCheck, UserRound } from "lucide-react";
import AccountSettingsDialog, { type AccountTab } from "@/components/auth/AccountSettingsDialog";

/** Header account menu. Logout intentionally lives only in the dashboard sidebar. */
export default function AccountMenu() {
  const { user, isLoaded } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<AccountTab>("profile");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const openAccount = (nextTab: AccountTab) => {
    setTab(nextTab);
    setMenuOpen(false);
    setDialogOpen(true);
  };

  if (!isLoaded || !user) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Account options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E4E8E2] bg-white p-1 pr-2 text-sm font-semibold text-[#314038] transition hover:bg-[#F5F7F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#FFF1AF] text-brand-black">
            {user.hasImage ? (
              // Clerk supplies this URL. No arbitrary user-provided image URLs are accepted.
              <img src={user.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <UserRound size={17} aria-hidden="true" />
            )}
          </span>
          <span className="hidden max-w-40 truncate sm:block">
            {user.firstName || user.username || user.primaryEmailAddress?.emailAddress || "Account"}
          </span>
          <ChevronDown size={15} aria-hidden="true" className="hidden text-[#708075] sm:block" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Account navigation"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-56 overflow-hidden rounded-xl border border-[#E3E8E1] bg-white p-1.5 shadow-[0_16px_45px_#00000018]"
          >
            <div className="border-b border-[#EFF1EC] px-3 py-2.5">
              <p className="truncate text-xs font-semibold text-[#141414]">
                {user.fullName || user.username || "SiteSuri account"}
              </p>
              <p className="truncate text-[11px] text-[#66736B]">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => openAccount("profile")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#25352B] hover:bg-[#FFF2B2]"
            >
              <UserRound size={17} /> My profile
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openAccount("security")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#25352B] hover:bg-[#FFF2B2]"
            >
              <ShieldCheck size={17} /> Security
            </button>
            {/* No logout action: sidebar owns the sign-out confirmation. */}
          </div>
        )}
      </div>
      <AccountSettingsDialog
        open={dialogOpen}
        activeTab={tab}
        onTabChange={setTab}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
