"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useRef, useState } from "react";
import {
  Bookmark,
  ChartNoAxesCombined,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
} from "lucide-react";

type DashboardSidebarProps = {
  expanded: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  disabled?: boolean;
};

const mainItems: NavigationItem[] = [
  { label: "Location explorer", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Analytics (soon)", icon: ChartNoAxesCombined, disabled: true },
  { label: "Saved locations (soon)", icon: Bookmark, disabled: true },
];

export default function DashboardSidebar({
  expanded,
  mobileOpen,
  onCloseMobile,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutDialogRef = useRef<HTMLDialogElement>(null);
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);

  function askToLogout() {
    if (signingOut) return;
    setLogoutError("");
    logoutDialogRef.current?.showModal();
  }

  function cancelLogout() {
    if (!signingOut) logoutDialogRef.current?.close();
  }

  async function handleLogout() {
    if (signingOut) return;
    setLogoutError("");
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setLogoutError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onCloseMobile}
          className="fixed inset-x-0 bottom-0 top-20 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        id="sitesuri-sidebar"
        aria-label="SiteSuri workspace navigation"
        className={`fixed bottom-0 left-0 top-20 z-40 flex flex-col overflow-hidden border-r border-[#E7EBE5] bg-white shadow-lg transition-[width,transform] duration-200 ease-out md:translate-x-0 md:shadow-none ${
          mobileOpen ? "w-[260px] translate-x-0" : "w-[260px] -translate-x-full"
        } ${expanded ? "md:w-[248px]" : "md:w-[72px]"}`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-6">
          <div
            className={`mb-3 px-5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#7B867D] ${expanded ? "md:block" : "md:sr-only"}`}
          >
            Menu
          </div>

          <nav aria-label="Main navigation" className="space-y-1.5 px-3">
            {mainItems.map(({ label, icon: Icon, href, disabled }) => {
              const current = href
                ? pathname === href || pathname.startsWith(`${href}/`)
                : false;
              const itemClass = `flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                current
                  ? "bg-[#FFF1AF] text-[#171717]"
                  : disabled
                    ? "cursor-not-allowed text-[#98A29A]"
                    : "text-[#435047] hover:bg-[#F4F7F1]"
              } ${expanded ? "md:justify-start" : "md:justify-center md:px-0"}`;

              const content = (
                <>
                  <Icon size={20} className="shrink-0" aria-hidden="true" />
                  <span
                    className={`truncate ${expanded ? "md:inline" : "md:sr-only"}`}
                  >
                    {label}
                  </span>
                </>
              );

              return href && !disabled ? (
                <Link
                  key={label}
                  href={href}
                  title={label}
                  aria-current={current ? "page" : undefined}
                  onClick={onCloseMobile}
                  className={itemClass}
                >
                  {content}
                </Link>
              ) : (
                <span
                  key={label}
                  title={label}
                  aria-disabled="true"
                  className={itemClass}
                >
                  {content}
                </span>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#E7EBE5] p-3">
          <button
            type="button"
            ref={logoutTriggerRef}
            onClick={askToLogout}
            disabled={signingOut}
            title="Log out"
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#D12C37] transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D12C37] disabled:opacity-50 ${
              expanded ? "md:justify-start" : "md:justify-center md:px-0"
            }`}
          >
            <LogOut size={20} className="shrink-0" aria-hidden="true" />
            <span className={expanded ? "md:inline" : "md:sr-only"}>
              {signingOut ? "Signing out..." : "Log out"}
            </span>
          </button>
        </div>
      </aside>

      {/* Native modal dialog: Escape key, focus containment, and backdrop
          behavior are provided by the browser's dialog top layer. */}
      <dialog
        ref={logoutDialogRef}
        aria-labelledby="sitesuri-logout-title"
        aria-describedby="sitesuri-logout-description"
        aria-modal="true"
        onCancel={(event) => {
          if (signingOut) event.preventDefault();
        }}
        onClose={() => {
          if (!signingOut) logoutTriggerRef.current?.focus();
        }}
        className="m-auto w-[min(92vw,440px)] max-w-none max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] border border-[#E5EAE3] bg-white p-0 text-[#141414] shadow-2xl backdrop:bg-black/55"
      >
        <div className="p-6 sm:p-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#FFF1AF] text-[#141414]">
            <LogOut size={23} aria-hidden="true" />
          </div>
          <h2
            id="sitesuri-logout-title"
            className="font-display text-2xl font-extrabold tracking-tight"
          >
            Log out of SiteSuri?
          </h2>
          <p
            id="sitesuri-logout-description"
            className="mt-3 text-sm leading-6 text-[#65736A]"
          >
            You will be signed out of your account and returned to the home
            page.
          </p>
          {logoutError && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {logoutError}
            </p>
          )}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelLogout}
              disabled={signingOut}
              className="min-h-11 rounded-xl border border-[#DDE4DC] px-5 text-sm font-bold text-[#435047] transition hover:bg-[#F5F7F3] focus-visible:outline-2 focus-visible:outline-brand-green disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="min-h-11 rounded-xl bg-[#D12C37] px-5 text-sm font-bold text-white transition hover:bg-[#B92530] focus-visible:outline-2 focus-visible:outline-[#D12C37] disabled:cursor-wait disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Yes, log out"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
