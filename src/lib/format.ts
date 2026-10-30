export type Locale = "en" | "bn";

export function formatBDT(amount: number, locale: Locale = "en"): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Price must be a non-negative finite number.");
  return `৳${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

/** Accepts local, 880, or +880 input; stores canonical +880 mobile numbers. */
export function normalizeBDPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  const normalized = compact.startsWith("+880") ? compact
    : compact.startsWith("880") ? `+${compact}`
    : compact.startsWith("01") ? `+88${compact}` : compact;
  return /^\+8801[3-9]\d{8}$/.test(normalized) ? normalized : null;
}
