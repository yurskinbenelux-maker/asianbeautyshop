// ─────────────────────────────────────────────────────────────────────────
// SearchOverlay — full-width search panel that slides down from the top
// of the viewport when the nav's search icon is pressed.
//
// Interaction:
//   · Opens on nav search button → scrolls lock, input auto-focuses
//   · ESC or backdrop click closes
//   · On submit: push to /search?q=… (keeps back button + shareable URL)
//   · Live preview: fetches top 5 hits via server action on debounce,
//     renders as a compact list beneath the input. Clicking a hit
//     navigates straight to the PDP and dismisses the overlay.
//
// The component owns the overlay chrome; the search *logic* lives in a
// server action (searchProductsLive) so we don't ship Prisma to the
// client. The action is rate-limited in practice by the 250 ms debounce.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/routing";
import { searchProductsLive } from "@/app/[locale]/search/actions";
import type { ProductCardData } from "@/lib/queries/products";
import { formatEur, priceLocale } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SearchOverlay({ open, onClose }: Props) {
  const t = useTranslations("search");
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Lock background scroll + auto-focus input on open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Small delay so Framer Motion has already mounted the input before
    // we grab focus — otherwise the focus call is a no-op.
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(id);
    };
  }, [open]);

  // ESC closes the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset local state every time we close so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced live preview — hits the server action 250 ms after the last
  // keystroke so we don't fire a request per character. Two-char minimum
  // to avoid a firehose of single-letter queries (and useless results).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = window.setTimeout(() => {
      startTransition(async () => {
        const hits = await searchProductsLive({ locale, query: q, take: 5 });
        // Guard against a stale response: only commit if the input still
        // matches the query we fired off.
        if (inputRef.current?.value.trim() === q) {
          setResults(hits);
        }
      });
    }, 250);
    return () => window.clearTimeout(id);
  }, [query, locale, open]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      router.push(`/search?q=${encodeURIComponent(q)}`);
      onClose();
    },
    [query, router, onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── backdrop ───────────────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* ── panel ──────────────────────────────────────────── */}
          <motion.div
            key="panel"
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            className="fixed inset-x-0 top-0 z-50 bg-rice shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={t("overlay_label")}
          >
            <div className="container py-8 md:py-12">
              <div className="flex items-start justify-between gap-8">
                <form onSubmit={submit} className="flex-1">
                  <label className="eyebrow block" htmlFor="search-input">
                    {t("overlay_label")}
                  </label>
                  <div className="mt-3 flex items-center border-b border-ink/20 pb-3">
                    <Search
                      className="mr-4 h-5 w-5 text-ink-mid"
                      aria-hidden
                    />
                    <input
                      ref={inputRef}
                      id="search-input"
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("placeholder")}
                      autoComplete="off"
                      maxLength={120}
                      className="w-full bg-transparent font-display text-display-md leading-tight text-ink placeholder:text-ink-mid/60 focus:outline-none"
                    />
                  </div>
                  <p className="mt-3 text-[11px] uppercase tracking-label text-ink-mid">
                    {t("hint")}
                  </p>
                </form>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("close")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-ink-mid transition-colors hover:text-ink"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* ── live preview ──────────────────────────────── */}
              {query.trim().length >= 2 && (
                <div className="mt-8">
                  {isPending && results.length === 0 && (
                    <p className="text-[12px] uppercase tracking-label text-ink-mid">
                      {t("searching")}
                    </p>
                  )}

                  {!isPending && results.length === 0 && (
                    <p className="text-[13px] text-ink-mid">
                      {t("no_results")}
                    </p>
                  )}

                  {results.length > 0 && (
                    <ul className="divide-y divide-ink/10">
                      {results.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/shop/${p.slug}`}
                            onClick={onClose}
                            className="group flex items-center gap-6 py-4 transition-colors hover:bg-rice-dim"
                          >
                            {/* thumbnail */}
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-rice-dim">
                              {p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.imageUrl}
                                  alt={p.imageAlt ?? p.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-display text-[14px] text-ink-mid">
                                  YU.R
                                </div>
                              )}
                            </div>

                            {/* text */}
                            <div className="flex-1 min-w-0">
                              <div className="font-display text-[18px] leading-tight text-ink transition-colors group-hover:text-vermilion">
                                {p.name}
                              </div>
                              {p.tagline && (
                                <div className="mt-1 truncate text-[13px] text-ink-mid">
                                  {p.tagline}
                                </div>
                              )}
                            </div>

                            {/* price */}
                            <div className="shrink-0 text-[14px] text-ink">
                              {formatEur(p.priceEur, priceLocale(locale))}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* "See all" — jumps to the full /search results page */}
                  {results.length > 0 && (
                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={submit}
                        className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
                      >
                        {t("see_all")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
