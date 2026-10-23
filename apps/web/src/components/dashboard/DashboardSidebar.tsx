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

interface DashboardSidebarProps {
  expanded: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  analyticsHref?: string;
}

interface NavigationItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  disabled?: boolean;
}

const navItems: NavigationItem[] = [
  {
    label: "Location explorer",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    label: "Analytics",
    icon: ChartNoAxesCombined,
    href: "/dashboard/analytics",
  },
  {
    label: "Saved Locations",
    icon: Bookmark,
    href: "/dashboard/saved",
  },
];

export default function DashboardSidebar({
  expanded,
  mobileOpen,
  onCloseMobile,
  analyticsHref,
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
    if (!signingOut) {
      logoutDialogRef.current?.close();
    }
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

  const labelClass = expanded
    ? "md:max-w-[180px] md:opacity-100"
    : "md:max-w-0 md:opacity-0";

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onCloseMobile}
          className="fixed inset-x-0 bottom-0 top-20 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sitesuri-sidebar"
        aria-label="SiteSuri workspace navigation"
        className={`
          fixed bottom-0 left-0 top-20 z-40
          flex w-[260px] shrink-0 flex-col
          border-r border-[#E7EBE5]
          bg-white text-sm shadow-lg

          transition-[width,transform]
          duration-300 ease-in-out
          motion-reduce:transition-none

          md:sticky md:bottom-auto md:top-20
          md:h-[calc(100dvh-5rem)]
          md:self-start md:translate-x-0
          md:shadow-none

          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}

          ${expanded ? "md:w-[248px]" : "md:w-[72px]"}
        `}
      >
        {/* Main navigation */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-8">
          {/* Menu heading */}
          <div className="mb-5 h-5 overflow-hidden px-3">
            <span
              className={`
                block whitespace-nowrap
                text-[11px] font-extrabold
                uppercase tracking-[0.12em]
                text-[#7B867D]

                ${expanded ? "md:opacity-100" : "md:opacity-0"}
              `}
            >
              Menu
            </span>
          </div>

          <nav aria-label="Main navigation" className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : Boolean(
                      item.href &&
                      (pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)),
                    );

              const itemClass = `
                flex min-h-11 w-full items-center
                gap-3 overflow-hidden rounded-xl
                px-3 text-sm font-semibold
                transition-colors duration-150

                ${
                  active
                    ? "bg-[#FFF1AF] text-[#171717]"
                    : item.disabled
                      ? "cursor-not-allowed text-[#98A29A]"
                      : "text-[#435047] hover:bg-[#F4F7F1]"
                }
              `;

              const content = (
                <>
                  <Icon size={20} className="shrink-0" aria-hidden="true" />

                  <span
                    className={`
                      max-w-[180px] overflow-hidden
                      whitespace-nowrap opacity-100
                      transition-[max-width,opacity]
                      duration-200 ease-out
                      ${labelClass}
                    `}
                  >
                    {item.label}
                  </span>
                </>
              );

              if (item.href && !item.disabled) {
                return (
                  <Link
                    key={item.label}
                    href={
                      item.href === "/dashboard/analytics"
                        ? (analyticsHref ?? item.href)
                        : item.href
                    }
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={onCloseMobile}
                    className={itemClass}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <span
                  key={item.label}
                  title={item.label}
                  aria-disabled="true"
                  className={itemClass}
                >
                  {content}
                </span>
              );
            })}
          </nav>
        </div>

        {/* Logout section */}
        <div className="mt-auto border-t border-[#E7EBE5] bg-white px-3 py-4">
          <button
            type="button"
            ref={logoutTriggerRef}
            onClick={askToLogout}
            disabled={signingOut}
            title="Log out"
            className="
              flex min-h-11 w-full items-center
              gap-3 overflow-hidden rounded-xl
              px-3 text-sm font-semibold
              text-[#D12C37]
              transition-colors duration-150
              hover:bg-red-50
              disabled:opacity-50
            "
          >
            <LogOut size={20} className="shrink-0" />

            <span
              className={`
                max-w-[180px] overflow-hidden
                whitespace-nowrap opacity-100
                transition-[max-width,opacity]
                duration-200 ease-out
                ${labelClass}
              `}
            >
              {signingOut ? "Signing out..." : "Log out"}
            </span>
          </button>
        </div>
      </aside>

      {/* Logout confirmation */}
      <dialog
        ref={logoutDialogRef}
        aria-labelledby="sitesuri-logout-title"
        aria-describedby="sitesuri-logout-description"
        onCancel={(event) => {
          if (signingOut) {
            event.preventDefault();
          }
        }}
        onClose={() => {
          if (!signingOut) {
            logoutTriggerRef.current?.focus();
          }
        }}
        className="
          m-auto w-[min(92vw,440px)]
          max-h-[calc(100dvh-2rem)]
          max-w-none overflow-y-auto
          rounded-[24px] border
          border-[#E5EAE3]
          bg-white p-0 text-[#141414]
          shadow-2xl
          backdrop:bg-black/55
        "
      >
        <div className="p-6 sm:p-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#FFF1AF]">
            <LogOut size={23} />
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
              className="min-h-11 rounded-xl border border-[#DDE4DC] px-5 text-sm font-bold text-[#435047] hover:bg-[#F5F7F3]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="min-h-11 rounded-xl bg-[#D12C37] px-5 text-sm font-bold text-white hover:bg-[#B92530] disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Yes, log out"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
