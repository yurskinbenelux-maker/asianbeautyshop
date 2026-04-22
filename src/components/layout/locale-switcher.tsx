// ─────────────────────────────────────────────────────────────────────────
// Locale switcher — EN / NL / FR / RU.
// Uses next-intl typed navigation so the current path carries across.
//
// On most pages, swapping locale = same pathname + different prefix.
// On pages with per-locale slugs (product detail, for example), the
// page wraps its content in <LocaleAlternatesProvider> so we can send
// the user to the correct translated URL instead of 404ing.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useLocaleAlternates } from "./locale-alternates";

const LABELS: Record<string, string> = {
  en: "EN",
  nl: "NL",
  fr: "FR",
  ru: "RU",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const alternates = useLocaleAlternates();

  function handleSwitch(target: string) {
    const explicit = alternates?.[target];
    if (explicit) {
      // Page provided a per-locale alternate (e.g. translated product slug).
      // next-intl's router prepends the correct locale prefix.
      router.replace(explicit, { locale: target });
      return;
    }
    // Fallback: keep the same path, just switch locales.
    router.replace(pathname, { locale: target });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="hidden items-center gap-1 text-[11px] uppercase tracking-caps text-ink-mid md:flex"
    >
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span className="mx-1 text-ink/20">·</span>}
          <button
            type="button"
            onClick={() => handleSwitch(l)}
            className={cn(
              "transition-colors hover:text-vermilion",
              l === locale && "text-ink",
            )}
            aria-current={l === locale ? "true" : undefined}
          >
            {LABELS[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
