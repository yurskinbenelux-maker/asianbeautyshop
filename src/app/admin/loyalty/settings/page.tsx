// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/settings — singleton config edit form.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { getLoyaltySettings } from "@/lib/loyalty/settings";
import { LoyaltySettingsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltySettingsPage() {
  await requireCapability("loyalty.edit");
  const settings = await getLoyaltySettings();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/loyalty"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Loyalty hub
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Settings
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
        Every economic lever for the YU.R Club. Changes apply immediately.
        Past balances are never recalculated when you change a rule.
      </p>

      <LoyaltySettingsForm initial={settings} />
    </div>
  );
}
