"use client";

import { Eye, EyeOff, LockKeyhole, Mail, KeyRound } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

type AuthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
};

export default function AuthInput({
  id, label, type = "text", error, className = "", ...rest
}: AuthInputProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const Icon = type === "email" ? Mail : isPassword ? LockKeyhole : KeyRound;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-bold text-brand-black">{label}</label>
      <div className="relative">
        <Icon aria-hidden="true" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8B948D]" />
        <input
          id={id}
          type={isPassword ? (visible ? "text" : "password") : type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-h-12 w-full rounded-xl border border-[#DDE3DA] bg-white py-3 pl-11 text-sm text-brand-black placeholder:text-[#929C94] outline-none transition focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30 ${isPassword ? "pr-12" : "pr-4"} ${error ? "border-red-500" : ""} ${className}`}
          {...rest}
        />
        {isPassword && (
          <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#637168] hover:bg-[#F2F4EF]">
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
