"use client";

// ─────────────────────────────────────────────────────────────────────────
// LocaleDropdown — mobile-friendly variant of the locale switcher.
//
// Desktop (md+) uses the inline LocaleSwitcher (EN · NL · FR · RU pills).
// Mobile shows just the current locale code as a tap target; tapping
// opens a small dropdown menu of all four locales. Click-outside +
// Escape close the menu.
//
// Keeps the same routing logic as LocaleSwitcher (per-locale alternates
// when a page provides them, fallback to same path + new prefix).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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

export function LocaleDropdown() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const alternates = useLocaleAlternates();

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside the wrapper.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleSwitch(target: string) {
    setOpen(false);
    const explicit = alternates?.[target];
    if (explicit) {
      router.replace(explicit, { locale: target });
      return;
    }
    router.replace(pathname, { locale: target });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Language"
        className="flex h-9 items-center gap-1 px-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        <span className="font-medium text-ink">{LABELS[locale] ?? "EN"}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
          aria-hidden
        />
      </button>

      {/* Dropdown menu — anchored to the trigger, slides in.
          Right-aligned so it doesn't push off-screen on narrow phones. */}
      {open && (
        <div
          role="menu"
          aria-label="Choose language"
          className="absolute right-0 top-full z-[70] mt-1 min-w-[88px] origin-top-right border border-ink/10 bg-rice shadow-lg"
        >
          {routing.locales.map((l) => {
            const isActive = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="menuitem"
                onClick={() => handleSwitch(l)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] uppercase tracking-label transition-colors",
                  isActive
                    ? "bg-ink/5 text-ink"
                    : "text-ink-mid hover:bg-ink/5 hover:text-ink",
                )}
              >
                <span>{LABELS[l]}</span>
                {isActive && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-vermilion"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
