"use client";

/* eslint-disable @next/next/no-img-element -- Clerk profile image URLs are dynamic. */

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import { Camera, LoaderCircle, ShieldCheck, UserRound, X } from "lucide-react";
import { strongPasswordSchema } from "@/lib/validation/auth";
import { clerkErrorMessage } from "@/lib/auth/clerk-error-message";

export type AccountTab = "profile" | "security";

type Props = {
  open: boolean;
  activeTab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  onClose: () => void;
};

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[#DFE6DE] bg-white px-3 text-sm text-[#141414] outline-none transition focus:border-[#15803D] focus:ring-2 focus:ring-[#15803D]/15";

export default function AccountSettingsDialog({ open, activeTab, onTabChange, onClose }: Props) {
  const { user } = useUser();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Sensitive account changes may prompt Clerk to reverify the current session.
  const changePassword = useReverification(
    async ({ oldPassword, updatedPassword }: { oldPassword: string; updatedPassword: string }) => {
      if (!user) throw new Error("Account not ready.");
      return user.updatePassword({
        currentPassword: oldPassword,
        newPassword: updatedPassword,
        signOutOfOtherSessions: true,
      });
    },
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setError("");
    setSuccess("");
  }, [open, user?.id]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || busy) return;
    setError("");
    setSuccess("");
    const first = firstName.trim();
    const last = lastName.trim();
    if (first.length > 100 || last.length > 100) {
      setError("Names must contain at most 100 characters.");
      return;
    }
    setBusy(true);
    try {
      await user.update({ firstName: first, lastName: last });
      setSuccess("Profile updated successfully.");
    } catch (error) {
      setError(clerkErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user || busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Use a PNG, JPG, or WebP image smaller than 5 MB.");
      return;
    }
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
      setSuccess("Profile photo updated.");
    } catch (error) {
      setError(clerkErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || busy) return;
    setError("");
    setSuccess("");
    const valid = strongPasswordSchema.safeParse(newPassword);
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? "Enter a valid password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword({ oldPassword: currentPassword, updatedPassword: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated. Other sessions were signed out.");
    } catch (error) {
      setError(clerkErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="sitesuri-account-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(95vw,850px)] max-w-none overflow-y-auto rounded-2xl border border-[#E5E9E3] bg-white p-0 text-brand-black shadow-2xl backdrop:bg-black/55"
    >
      <div className="grid min-h-[500px] md:grid-cols-[220px_1fr]">
        <aside className="border-b border-[#E9EDE7] bg-[#F8FAF6] p-5 md:border-b-0 md:border-r">
          <h2 id="sitesuri-account-title" className="font-display text-2xl font-extrabold tracking-tight">Account</h2>
          <p className="mb-6 mt-1 text-xs text-[#758076]">Manage your SiteSuri account.</p>
          <nav aria-label="Account sections" className="flex gap-2 md:flex-col">
            <button type="button" onClick={() => { onTabChange("profile"); setError(""); setSuccess(""); }}
              className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${activeTab === "profile" ? "bg-[#FFF1AF] text-[#141414]" : "text-[#637367] hover:bg-white"}`}>
              <UserRound size={16} /> Profile
            </button>
            <button type="button" onClick={() => { onTabChange("security"); setError(""); setSuccess(""); }}
              className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${activeTab === "security" ? "bg-[#FFF1AF] text-[#141414]" : "text-[#637367] hover:bg-white"}`}>
              <ShieldCheck size={16} /> Security
            </button>
          </nav>
        </aside>

        <div className="min-w-0 p-5 sm:p-7">
          <div className="mb-6 flex items-center justify-between border-b border-[#EEF1EB] pb-4">
            <h3 className="font-display text-xl font-extrabold">
              {activeTab === "profile" ? "Profile details" : "Account security"}
            </h3>
            <button type="button" onClick={onClose} aria-label="Close account settings"
              className="grid size-8 place-items-center rounded-lg hover:bg-[#F2F5F0]">
              <X size={18} />
            </button>
          </div>

          {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{success}</p>}

          {activeTab === "profile" ? (
            <>
              <section className="mb-6 flex items-center gap-4">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#FFF1AF]">
                  {user?.hasImage ? (
                    <img src={user.imageUrl} alt="Current profile" className="size-full object-cover" />
                  ) : <UserRound size={28} aria-hidden="true" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">Profile photo</p>
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-brand-green hover:underline">
                    <Camera size={15} /> Change photo
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={uploadAvatar} />
                  </label>
                </div>
              </section>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">First name
                    <input className={inputClass} maxLength={100} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </label>
                  <label className="block text-sm font-semibold">Last name
                    <input className={inputClass} maxLength={100} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </label>
                </div>
                <label className="block text-sm font-semibold">Email address
                  <input className={`${inputClass} bg-[#F6F8F5] text-[#68756D]`} value={user?.primaryEmailAddress?.emailAddress ?? ""} readOnly />
                </label>
                <p className="text-xs leading-5 text-[#748075]">Email changes require a separate verified flow and are intentionally not editable here yet.</p>
                <button type="submit" disabled={busy || !user} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-yellow px-5 text-sm font-extrabold text-brand-black hover:bg-[#FDE065] disabled:opacity-60">
                  {busy && <LoaderCircle className="animate-spin" size={16} />} Save changes
                </button>
              </form>
              <div className="mt-8 border-t border-[#EEF1EB] pt-5">
                <p className="text-sm font-semibold">Connected accounts</p>
                <p className="mt-1 text-xs text-[#758076]">{user?.externalAccounts.length ? `${user.externalAccounts.length} account(s) linked with Clerk` : "No social accounts linked."}</p>
                <p className="mt-2 text-xs text-[#758076]">Adding or removing connected accounts is not yet available in this custom form.</p>
              </div>
            </>
          ) : (
            <>
              {!user?.passwordEnabled ? (
                <div className="rounded-xl border border-[#E5EAE3] bg-[#F8FAF6] p-4 text-sm leading-6 text-[#59675E]">
                  This account does not currently have a password. Password updates are not available in this form. Continue signing in with your connected provider.
                </div>
              ) : (
                <form onSubmit={savePassword} className="space-y-4">
                  <p className="text-sm leading-6 text-[#68746D]">Update your password. For security, other active sessions will be signed out.</p>
                  <label className="block text-sm font-semibold">Current password
                    <input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                  </label>
                  <label className="block text-sm font-semibold">New password
                    <input className={inputClass} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  </label>
                  <label className="block text-sm font-semibold">Confirm new password
                    <input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </label>
                  <p className="text-xs leading-5 text-[#748075]">New passwords must follow the same rules as SiteSuri registration (at least 15 characters, uppercase, lowercase, number and symbol).</p>
                  <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-yellow px-5 text-sm font-extrabold text-brand-black hover:bg-[#FDE065] disabled:opacity-60">
                    {busy && <LoaderCircle className="animate-spin" size={16} />} Change password
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
