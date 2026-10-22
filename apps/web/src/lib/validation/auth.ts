import { z } from "zod";

// Clerk remains responsible for authentication and password security.
// These are SiteSuri's client-side registration requirements.

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;
const ASCII_EMAIL = /^[\x21-\x7E]*$/;

// Single source of truth for password requirements.
export const passwordRequirements = [
  {
    id: "uppercase",
    label: "At least one uppercase letter",
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter",
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "At least one number",
    test: (value: string) => /[0-9]/.test(value),
  },
  {
    id: "special",
    label: "At least one special character",
    test: (value: string) => /[^A-Za-z0-9 ]/.test(value),
  },
  {
    id: "length",
    label: "At least 15 characters",
    test: (value: string) => value.length >= 15,
  },
] as const;

const asciiPassword = z
  .string()
  .regex(
    ASCII_PRINTABLE,
    "Only standard English characters, numbers, and symbols are allowed.",
  );

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required.")
  .max(254, "Email address is too long.")
  .regex(ASCII_EMAIL, "Email contains unsupported characters.")
  .pipe(z.email({ error: "Enter a valid email address." }));

// Strong password validation for NEW accounts.
export const strongPasswordSchema = z.string().superRefine((password, ctx) => {
  if (!password) {
    ctx.addIssue({
      code: "custom",
      message: "Password is required.",
    });
    return;
  }

  if (!ASCII_PRINTABLE.test(password)) {
    ctx.addIssue({
      code: "custom",
      message: "Password contains unsupported characters.",
    });
    return;
  }

  for (const requirement of passwordRequirements) {
    if (!requirement.test(password)) {
      ctx.addIssue({
        code: "custom",
        message: requirement.label + ".",
      });
    }
  }
});

export const signInSchema = z.object({
  email: emailSchema,
  // Don't enforce the new strength rules on existing accounts.
  password: asciiPassword.min(1, "Password is required."),
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: strongPasswordSchema,
    confirmPassword: asciiPassword.min(1, "Please confirm your password."),
  })
  .refine(
    ({ password, confirmPassword }) =>
      confirmPassword.length === 0 || password === confirmPassword,
    {
      path: ["confirmPassword"],
      message: "Passwords do not match.",
    },
  );

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
