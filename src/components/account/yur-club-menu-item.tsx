// ─────────────────────────────────────────────────────────────────────────
// YurClubMenuItem — sidebar entry that visually matches the other rows
// but, instead of navigating, opens the YurClubDrawer.
//
// Reads drawer data prefetched by the account layout — keeps the sidebar
// DB-free even though it surfaces points balance.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { YurClubDrawer } from "./yur-club-drawer";
import type { DrawerData } from "@/lib/loyalty/drawer-data";

export function YurClubMenuItem({ data }: { data: DrawerData | null }) {
  const t = useTranslations("account");
  const tClub = useTranslations("yur_club");
  const [open, setOpen] = useState(false);

  // Program disabled by an admin → don't render the entry at all. Customers
  // mid-flow won't see the drawer disappear because the layout re-fetches
  // on every render; she'd have to disable it then refresh for it to go.
  if (!data || !data.programActive) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-between gap-3 whitespace-nowrap px-3 py-2 text-left text-[13px] transition-colors",
          "text-ink-mid hover:bg-ink/5 hover:text-ink",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-vermilion" />
          <span>{t("nav_yur_club")}</span>
        </span>
        {/* Live points pill — concise hint that the program is active and
            theirs has a balance worth checking. */}
        {data.account.pointsBalance > 0 ? (
          <span
            aria-label={tClub("points")}
            className="shrink-0 font-display text-[12px] text-vermilion"
          >
            {data.account.pointsBalance.toLocaleString()}
          </span>
        ) : null}
      </button>

      <YurClubDrawer
        data={data}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
