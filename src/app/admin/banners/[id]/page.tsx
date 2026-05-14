// ─────────────────────────────────────────────────────────────────────────
// /admin/banners/[id] — edit one banner.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getAdminBanner,
  listMediaForPicker,
} from "@/lib/queries/admin-banners";
import { BannerForm } from "@/components/admin/banners/banner-form";
import { BannerDangerZone } from "@/components/admin/banners/banner-danger-zone";
import { PLACEMENTS } from "../placements";

export const dynamic = "force-dynamic";

export default async function EditBannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [banner, library] = await Promise.all([
    getAdminBanner(id),
    listMediaForPicker(),
  ]);
  if (!banner) notFound();

  const placementLabel =
    PLACEMENTS.find((p) => p.id === banner.placement)?.label ?? banner.placement;
  const englishHeadline = banner.translations.EN.headline || "Untitled banner";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/banners"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Banners
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">Edit banner</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {englishHeadline}
        </h1>
        <p className="mt-2 text-[13px] text-ink-mid">{placementLabel}</p>
      </header>

      <BannerForm
        mode="edit"
        library={library}
        initial={{
          id: banner.id,
          placement: banner.placement,
          ctaHref: banner.ctaHref,
          sortOrder: banner.sortOrder,
          isActive: banner.isActive,
          startsAt: banner.startsAt,
          endsAt: banner.endsAt,
          mediaId: banner.mediaId,
          mediaUrl: banner.mediaUrl,
          mediaAlt: banner.mediaAlt,
          translations: banner.translations,
        }}
      />

      <div className="mt-12">
        <BannerDangerZone id={banner.id} />
      </div>
    </div>
  );
}
