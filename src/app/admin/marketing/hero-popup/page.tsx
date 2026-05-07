// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/hero-popup — editor for the homepage hero popup.
//
// Server component: loads current settings + the full product picker
// list, hands the bundle to the <HeroPopupForm> client. Save success
// arrives back via ?saved=1 (server action redirect) so we render a
// quiet sage-green confirmation chip.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import { requireCapability } from "@/lib/auth-roles";
import {
  listHeroPopupPickerOptions,
  readHeroPopupSettings,
} from "@/lib/queries/hero-popup";
import { HeroPopupForm } from "@/components/admin/marketing/hero-popup-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function AdminHeroPopupPage({ searchParams }: Props) {
  await requireCapability("homepage.edit", "/admin");

  const [settings, options, sp] = await Promise.all([
    readHeroPopupSettings(),
    listHeroPopupPickerOptions(),
    searchParams,
  ]);

  const justSaved = sp.saved === "1";

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link
        href="/admin/marketing"
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Marketing
      </Link>

      <header className="mt-6 border-b border-ink/10 pb-6">
        <div className="eyebrow">Marketing · hero popup</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Homepage hero popup
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
          A centred editorial card that lands after the welcome popup.
          Pick 3–6 products, write the copy in EN, and DeepL fans the
          rest out. The popup never overlaps with the welcome popup or
          the quiz popup — they queue automatically.
        </p>
        {justSaved && (
          <div className="mt-4 inline-flex items-center gap-2 border border-celadon/40 bg-celadon/5 px-3 py-1.5 text-[12px] text-celadon">
            <Check className="h-3.5 w-3.5" />
            Saved. Refresh the homepage to see the change.
          </div>
        )}
      </header>

      <div className="mt-8">
        <HeroPopupForm initial={settings} pickerOptions={options} />
      </div>
    </div>
  );
}
