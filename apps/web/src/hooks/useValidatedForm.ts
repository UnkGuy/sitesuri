"use client";

import { useState } from "react";
import type { ZodType } from "zod";

type FieldErrors<T> = Partial<Record<keyof T, string>>;
type TouchedFields<T> = Partial<Record<keyof T, boolean>>;

/**
 * onBlur: mark a field as touched and display its current validation result.
 * onChange: revalidate all already-touched fields (including cross-field rules).
 * submit: validate everything before any network request.
 */
export function useValidatedForm<T extends Record<string, string>>(
  schema: ZodType<T>,
  initialValues: T,
) {
  const [values, setValues] = useState<T>(initialValues);
  const [touched, setTouched] = useState<TouchedFields<T>>({});
  const [errors, setErrors] = useState<FieldErrors<T>>({});

  function collectErrors(nextValues: T): FieldErrors<T> {
    const result = schema.safeParse(nextValues);
    if (result.success) return {};

    const fieldErrors: FieldErrors<T> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof T | undefined;
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return fieldErrors;
  }

  function visibleErrors(allErrors: FieldErrors<T>, nextTouched: TouchedFields<T>) {
    const visible: FieldErrors<T> = {};
    for (const key of Object.keys(nextTouched) as Array<keyof T>) {
      if (nextTouched[key] && allErrors[key]) visible[key] = allErrors[key];
    }
    return visible;
  }

  function onChange(field: keyof T, value: string) {
    const nextValues = { ...values, [field]: value } as T;
    setValues(nextValues);
    setErrors(visibleErrors(collectErrors(nextValues), touched));
  }

  function onBlur(field: keyof T) {
    const nextTouched = { ...touched, [field]: true };
    setTouched(nextTouched);
    setErrors(visibleErrors(collectErrors(values), nextTouched));
  }

  function validateSubmit(): { success: true; data: T } | { success: false } {
    const result = schema.safeParse(values);
    setTouched(
      Object.fromEntries(Object.keys(values).map((key) => [key, true])) as TouchedFields<T>,
    );
    setErrors(collectErrors(values));
    return result.success ? { success: true, data: result.data } : { success: false };
  }

  return { values, errors, onChange, onBlur, validateSubmit };
}
