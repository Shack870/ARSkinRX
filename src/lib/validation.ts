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

export const providerApplicationSchema = z.object({
  displayName: z.string().min(2, "Please enter your full name"),
  phone: z.string().min(7, "Please enter a valid phone number"),
  licenseNumber: z.string().min(3, "License number is required"),
  bio: z.string().min(20, "Tell clients a little about yourself (20+ chars)"),
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
