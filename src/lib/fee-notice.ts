import { MIN_APPOINTMENT_PRICE_CENTS } from "@/lib/services";

/**
 * Patient acknowledgement shown before booking and before account creation:
 * the visit fee covers the nurse appointment only, not medications.
 */
export function feeNoticeOptions(priceCents: number = MIN_APPOINTMENT_PRICE_CENTS) {
  const dollars = `$${(priceCents / 100).toFixed(0)}`;
  return {
    title: "Before you continue",
    message: `I understand the ${dollars} fee is for the nurse appointment and does not include the cost of medications, which are filled by the partner pharmacy.`,
    confirmLabel: "OK",
    cancelLabel: "Go Back",
  };
}
