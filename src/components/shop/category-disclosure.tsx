// ─────────────────────────────────────────────────────────────────────────
// CategoryDisclosure — "+ more" popover that lists secondary (singleton)
// categories beneath the primary chip strip on /shop. Quiet by default;
// expands on click into a small panel anchored under the trigger.
//
// We don't use shadcn/Radix Popover here on purpose — the disclosure is
// a single short list of plain links and we don't want to load the
// extra deps just for one widget. A custom click-outside + Esc handler
// covers the interactions a popover gives us.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Option = {
  slug: string;
  name: string;
  href: string;
  active: boolean;
};

export function CategoryDisclosure({
  options,
  label,
}: {
  options: Option[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Esc — the two interactions a popover owes
  // its caller. Pointerdown beats click here so the menu collapses
  // before the underlying link's hover/focus state shifts.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // If any option is active (deep-linked or filtered), surface that to
  // the trigger so the dot affordance hints "your selection is in here".
  const hasActive = options.some((o) => o.active);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex items-center gap-1.5 text-[12px] uppercase tracking-label transition-colors",
          hasActive
            ? "text-ink"
            : "text-ink-mid hover:text-ink",
        )}
      >
        {hasActive && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-vermilion"
          />
        )}
        {label}
        <span aria-hidden className="translate-y-px text-[10px]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          // Anchored below the trigger, generous padding so options
          // breathe. Width capped to avoid a tall narrow panel; if more
          // than ~12 options exist the panel scrolls vertically.
          className="absolute left-0 top-full z-30 mt-3 max-h-[60vh] w-[min(20rem,90vw)] overflow-y-auto border border-ink/10 bg-rice/95 p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] backdrop-blur-sm"
        >
          <ul className="flex flex-col">
            {options.map((o) => (
              <li key={o.slug} role="none">
                <Link
                  href={o.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between gap-3 px-2 py-2 text-[13px] uppercase tracking-label transition-colors",
                    o.active
                      ? "text-ink"
                      : "text-ink-mid hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <span>{o.name}</span>
                  {o.active && (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-vermilion"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
