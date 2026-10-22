"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

type SelectOption = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  disabled?: boolean;
};

/** Accessible custom select, shared by SiteSuri's location filters. */
export default function CustomSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  disabled = false,
}: CustomSelectProps) {
  return (
    <div className="space-y-2">
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="block text-xs font-bold text-[#4E5B52]"
      >
        {label}
      </label>

      <Select.Root
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <Select.Trigger
          id={id}
          aria-labelledby={`${id}-label ${id}`}
          className="flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-[#DDE4DC] bg-[#FAFBF9] px-3 py-3 text-left text-sm text-[#141414] outline-none transition hover:border-[#B5C4B6] focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20 data-[state=open]:border-brand-green data-[state=open]:ring-2 data-[state=open]:ring-brand-green/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="min-w-0 truncate">
            <Select.Value placeholder="Choose an option" />
          </span>
          <Select.Icon asChild>
            <ChevronDown
              size={17}
              className="shrink-0 text-[#64736A] transition-transform duration-150"
              aria-hidden="true"
            />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            position="popper"
            side="bottom"
            sideOffset={6}
            align="start"
            collisionPadding={12}
            className="z-[100] w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)] overflow-hidden rounded-xl border border-[#E3E9E0] bg-white p-1 shadow-[0_16px_40px_#0000001A] outline-none"
          >
            <Select.Viewport className="max-h-[min(300px,var(--radix-select-content-available-height))] overflow-auto">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex min-h-11 cursor-pointer select-none items-center rounded-lg py-2.5 pl-3 pr-10 text-sm text-[#27342B] outline-none data-[highlighted]:bg-[#FFF2B3] data-[highlighted]:text-[#141414] data-[state=checked]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3 inline-flex items-center text-brand-green">
                    <Check size={17} strokeWidth={2.6} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
