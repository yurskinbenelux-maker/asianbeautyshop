// ─────────────────────────────────────────────────────────────────────────
// /admin/banners/new — create a new homepage banner.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listMediaForPicker } from "@/lib/queries/admin-banners";
import { BannerForm } from "@/components/admin/banners/banner-form";

export const dynamic = "force-dynamic";

export default async function NewBannerPage() {
  const library = await listMediaForPicker();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/banners"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Banners
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">New banner</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Add a homepage banner
        </h1>
        <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
          Choose where it appears, pick an image from the media library, and
          write the copy. English is required — the other languages fall back
          to it when blank.
        </p>
      </header>
      <BannerForm mode="create" library={library} />
    </div>
  );
}
