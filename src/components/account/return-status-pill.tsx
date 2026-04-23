// ─────────────────────────────────────────────────────────────────────────
// ReturnStatusPill — small coloured label for a return's current state.
//
// Matches the ink palette (no rainbow) — each status earns a subtle tint
// via the border/background combination.  Status names come from
// next-intl; the pill itself is visually unambiguous regardless of locale.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ReturnStatus } from "@/lib/returns/types";

const TONE: Record<ReturnStatus, string> = {
  REQUESTED: "border-ink/20 bg-ink/5 text-ink",
  APPROVED: "border-celadon/50 bg-celadon/10 text-celadon",
  RECEIVED: "border-gold/40 bg-gold/10 text-gold",
  REFUNDED: "border-vermilion/40 bg-vermilion/5 text-vermilion",
  REJECTED: "border-ink/20 bg-ink/5 text-ink-mid line-through",
  CANCELLED: "border-ink/20 bg-ink/5 text-ink-mid",
};

export function ReturnStatusPill({ status }: { status: ReturnStatus }) {
  const t = useTranslations("returns");
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-label",
        TONE[status],
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
