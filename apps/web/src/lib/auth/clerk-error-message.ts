import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

export function clerkErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    return first?.longMessage || first?.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
