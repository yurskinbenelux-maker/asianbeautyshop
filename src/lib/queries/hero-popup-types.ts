// ─────────────────────────────────────────────────────────────────────────
// Hero popup types + constants — split out of hero-popup.ts because the
// admin form (a client component) imports the type list and field meta.
// hero-popup.ts itself is server-only (Prisma + read/write), and Next 15
// refuses to bundle a "server-only" module into a client tree.
//
// This file holds ONLY pure data: types, defaults, field descriptors.
// No imports from Prisma client, no runtime code. Safe to import from
// either side of the RSC boundary.
// ─────────────────────────────────────────────────────────────────────────

import type { Locale } from "@prisma/client";

/** Per-locale copy block. EN is the canonical source. */
export type HeroPopupCopy = {
  eyebrow: string;
  headline: string;
  lede: string;
  skipLabel: string;
  hintLabel: string;
};

export type HeroPopupSettings = {
  enabled: boolean;
  delaySeconds: number;
  productIds: string[];
  copy: Record<Locale, HeroPopupCopy>;
};

/** Public-facing product card the popup renders. */
export type HeroPopupProductCard = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
};

/** Admin product-picker option shape. */
export type HeroPopupPickerOption = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
};

export const EMPTY_COPY: HeroPopupCopy = {
  eyebrow: "",
  headline: "",
  lede: "",
  skipLabel: "",
  hintLabel: "",
};

export const HERO_POPUP_DEFAULT_EN: HeroPopupCopy = {
  eyebrow: "Spring picks",
  headline: "Hand-picked, just for you.",
  lede: "Four pieces we're loving this season — soft, slow, ready for your skincare routine.",
  skipLabel: "Maybe later",
  hintLabel: "Tap any piece →",
};

/** Field keys exposed in the admin form. Order = render order. */
export const HERO_POPUP_FIELDS: Array<{
  key: keyof HeroPopupCopy;
  label: string;
  multiline: boolean;
  hint?: string;
}> = [
  {
    key: "eyebrow",
    label: "Eyebrow tag",
    multiline: false,
    hint: 'Small uppercase line above the headline. e.g. "Spring picks"',
  },
  {
    key: "headline",
    label: "Headline",
    multiline: false,
    hint: "Big serif sentence — keep it under ~6 words.",
  },
  {
    key: "lede",
    label: "Lede paragraph",
    multiline: true,
    hint: "One short sentence framing the product set.",
  },
  {
    key: "skipLabel",
    label: "Skip link label",
    multiline: false,
    hint: 'Bottom-left dismiss link. e.g. "Maybe later"',
  },
  {
    key: "hintLabel",
    label: "Interaction hint",
    multiline: false,
    hint: 'Bottom-right cue. e.g. "Tap any piece →"',
  },
];
