// ─────────────────────────────────────────────────────────────────────────
// Admin banners — read queries.
//
// Banners are grouped by `placement` (e.g. "home.hero", "home.announcement",
// "shop.top"). The admin picks a placement, fills translations + a media
// asset, and the public site reads the first active banner per placement
// on render.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { Locale } from "@prisma/client";

export type BannerRow = {
  id: string;
  placement: string;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  mediaId: string | null;
  mediaUrl: string | null;
  mediaAlt: string | null;
  headlineEn: string | null;
  updatedAt: Date;
};

export type BannerTranslationInput = {
  locale: Locale;
  headline: string;
  subhead: string;
  ctaLabel: string;
};

export type BannerDetail = {
  id: string;
  placement: string;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  mediaId: string | null;
  mediaUrl: string | null;
  mediaAlt: string | null;
  translations: Record<Locale, BannerTranslationInput>;
};

export async function listAdminBanners(): Promise<BannerRow[]> {
  const rows = await prisma.banner.findMany({
    orderBy: [{ placement: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      media: { select: { url: true, alt: true } },
      translations: {
        where: { locale: "EN" },
        select: { headline: true },
        take: 1,
      },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    placement: b.placement,
    ctaHref: b.ctaHref,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    mediaId: b.mediaId,
    mediaUrl: b.media?.url ?? null,
    mediaAlt: b.media?.alt ?? null,
    headlineEn: b.translations[0]?.headline ?? null,
    updatedAt: b.updatedAt,
  }));
}

export async function getAdminBanner(id: string): Promise<BannerDetail | null> {
  const b = await prisma.banner.findUnique({
    where: { id },
    include: {
      media: { select: { url: true, alt: true } },
      translations: true,
    },
  });
  if (!b) return null;

  const byLocale: Record<Locale, BannerTranslationInput> = {
    EN: { locale: "EN", headline: "", subhead: "", ctaLabel: "" },
    NL: { locale: "NL", headline: "", subhead: "", ctaLabel: "" },
    FR: { locale: "FR", headline: "", subhead: "", ctaLabel: "" },
    RU: { locale: "RU", headline: "", subhead: "", ctaLabel: "" },
  };
  for (const t of b.translations) {
    byLocale[t.locale] = {
      locale: t.locale,
      headline: t.headline ?? "",
      subhead: t.subhead ?? "",
      ctaLabel: t.ctaLabel ?? "",
    };
  }

  return {
    id: b.id,
    placement: b.placement,
    ctaHref: b.ctaHref,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    mediaId: b.mediaId,
    mediaUrl: b.media?.url ?? null,
    mediaAlt: b.media?.alt ?? null,
    translations: byLocale,
  };
}

/** Loaded into the media picker. Only returns images (banners aren't videos). */
export async function listMediaForPicker(): Promise<
  { id: string; url: string; alt: string | null }[]
> {
  // Pull the most recent 200 images — an admin's library is unlikely to be
  // bigger than this, but if it grows we can paginate.
  const rows = await prisma.media.findMany({
    where: { kind: "IMAGE" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, url: true, alt: true },
  });
  return rows;
}
