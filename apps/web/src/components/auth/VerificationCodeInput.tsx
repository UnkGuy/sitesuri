"use client";

import {
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react";

type VerificationCodeInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

const CODE_LENGTH = 6;
const DIGITS_ONLY = /^[0-9]*$/;

/**
 * One accessible native input with six visual slots.
 * A single underlying input makes paste, mobile keyboards and OTP autofill
 * more reliable than manually coordinating six different input elements.
 */
export default function VerificationCodeInput({
  id,
  value,
  onChange,
  label = "Verification code",
  error,
  disabled = false,
  autoFocus = false,
}: VerificationCodeInputProps) {
  const [focused, setFocused] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value;
    // Reject invalid input, including unsupported autofill and IME results.
    if (next.length <= CODE_LENGTH && DIGITS_ONLY.test(next)) {
      onChange(next);
    }
  };

  const handleBeforeInput = (event: FormEvent<HTMLInputElement>) => {
    const inserted = (event.nativeEvent as InputEvent).data;
    if (
      inserted !== null &&
      inserted !== undefined &&
      !DIGITS_ONLY.test(inserted)
    ) {
      event.preventDefault();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const clipboardText = event.clipboardData.getData("text").trim();
    // Only accept a fully valid six-digit code; never silently rewrite a paste.
    if (/^[0-9]{6}$/.test(clipboardText)) {
      onChange(clipboardText);
    }
  };

  const activeSlot = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-bold text-brand-black">
        {label}
      </label>

      <div className="relative mt-3">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
        />

        <div aria-hidden="true" className="grid grid-cols-6 gap-2 sm:gap-3">
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <span
              key={index}
              className={`flex aspect-square min-w-0 items-center justify-center rounded-xl border-2 bg-white font-display text-xl font-extrabold text-brand-black transition sm:text-2xl ${
                error
                  ? "border-red-400"
                  : focused && index === activeSlot
                    ? "border-brand-yellow ring-2 ring-brand-yellow/25"
                    : value[index]
                      ? "border-[#D6DCCF]"
                      : "border-[#E3E7DE]"
              } ${disabled ? "opacity-60" : ""}`}
            >
              {value[index] ?? ""}
            </span>
          ))}
        </div>
      </div>

      <p id={`${id}-hint`} className="mt-2 text-xs text-[#738078]">
        Enter all 6 digits, or paste the code from your email.
      </p>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
