import { z } from "zod";

export const SERVICE_TYPES = [
  "anti-aging",
  "hyperpigmentation",
  "acne",
  "rosacea",
  "hair-loss",
  "hair-growth",
  "toe-nail-health",
  "eczema-psoriasis",
] as const;

/** Minimum bio length for a provider profile shown to patients. */
export const BIO_MIN_CHARS = 80;

export const providerApplicationSchema = z.object({
  displayName: z.string().min(2, "Please enter your full name"),
  phone: z.string().min(7, "Please enter a valid phone number"),
  licenseNumber: z.string().min(3, "License number is required"),
  credentials: z
    .string()
    .trim()
    .min(2, "Enter your credentials, e.g. APRN, FNP-C")
    .max(60, "Keep credentials under 60 characters"),
  yearsExperience: z
    .number()
    .int()
    .min(0, "Years of experience can't be negative")
    .max(60, "Enter a realistic number of years"),
  bio: z
    .string()
    .trim()
    .min(
      BIO_MIN_CHARS,
      `Tell patients about yourself (at least ${BIO_MIN_CHARS} characters)`,
    )
    .max(1200, "Keep your bio under 1,200 characters"),
  photoURL: z.string().url("A profile photo is required"),
  conditions: z
    .array(z.enum(SERVICE_TYPES))
    .min(1, "Select at least one condition you treat"),
  attestations: z.object({
    followsArkansasNursingRules: z.literal(true),
    hasPrescriptiveAuthority: z.literal(true),
    agreesToTerms: z.literal(true),
  }),
});

export type ProviderApplicationInput = z.infer<typeof providerApplicationSchema>;
