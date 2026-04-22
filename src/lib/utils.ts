// ─────────────────────────────────────────────────────────────────────────
// Tiny utilities shared across the app.
// ─────────────────────────────────────────────────────────────────────────

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — the only class-name helper we use.
 * Merges conditional classes (clsx) and resolves Tailwind conflicts (twMerge).
 *   cn("px-2", condition && "px-4", "text-ink") → "px-4 text-ink"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * formatEur — EU-style price in euros, rounded to 2 decimals.
 * Use for Product.price / variants (stored as Decimal euros in DB).
 *   formatEur(28)      → "€ 28,00"
 *   formatEur(64.5)    → "€ 64,50"
 */
export function formatEur(amountEur: number, locale = "nl-BE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amountEur);
}

/**
 * formatPrice — same output, but accepts integer cents.
 * Use for orders/line-items if we switch to storing cents later.
 */
export function formatPrice(cents: number, locale = "nl-BE"): string {
  return formatEur(cents / 100, locale);
}

/** Map URL locale ("nl") to the currency/number locale we want to display. */
export function priceLocale(urlLocale: string): string {
  switch (urlLocale) {
    case "nl": return "nl-BE";
    case "fr": return "fr-BE";
    case "ru": return "ru-RU";
    default:   return "en-IE";
  }
}
