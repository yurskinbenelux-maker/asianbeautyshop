# ABS rebrand audit — surface map

Generated 2026-05-07. **Read-only audit — no edits made yet.**

## How to read this

Every file containing one of these flagged strings was classified by path heuristic into one of the buckets below.

Flagged strings: `YU.R`, `Yu.R`, `YU·R`, `yurskin`, `yurskinsolution`, `an admin`, `YurClub`, `yur-club`.

## The three-tier rule (recap)

- **REPLACE** — storefront identity (customer-visible "YU.R Skin Solution" / `asianbeautyshop.eu` / "an admin, founder").
- **PRESERVE** — K'Elmus Group BV (legal entity, owns the corp).
- **PRESERVE** — YU.R / Yu.R Pro / Yu.R Me as a Brand row in the catalog (we still sell it).
- **DELETE** — "an admin" entirely (no replacement; she's no longer the public face).
- **RENAME** — "YurClub" → "A-Beauty Club" sitewide.

## Bucket counts

| Bucket | Files | Hits | Action |
|---|---|---|---|
| **HIGH · i18n strings** | 4 | 122 | REPLACE — bulk find-replace, leave brand-row references alone |
| **HIGH · legal page seeds** | 1 | 105 | REPLACE — an admin footer line + YU.R brand voice; K'Elmus stays |
| **HIGH · journal post seeds** | 1 | 13 | REPLACE — `authorName: "an admin · YU.R"` → "The Asian Beauty Shop team" |
| **HIGH · email shell scaffold** | 1 | 5 | REPLACE — logo URL, wordmark text, default footer |
| **HIGH · email body copy** | 34 | 295 | REPLACE — subject, signoff, brand mentions in 18+ templates |
| **HIGH · JSON-LD schema.org** | 1 | 10 | REPLACE — Organization name, sameAs URLs (legalName stays K'Elmus) |
| **HIGH · PWA manifest** | 1 | 2 | REPLACE — name, short_name, theme color |
| **HIGH · sitemap.ts** | 1 | 3 | REPLACE — base URL |
| **HIGH · nav / footer / logo** | 6 | 14 | REPLACE — alt text, footer copy, social URLs |
| **HIGH · popups + marketing** | 2 | 8 | REPLACE — copy, default brand mentions |
| **HIGH · public pages** | 74 | 165 | REPLACE — page-level brand mentions |
| **MED · admin UI labels** | 88 | 226 | REPLACE — admin chrome (defer to second pass; admin-only audience) |
| **MED · AI prompts** | 7 | 31 | REPLACE — Groq system prompt brand name |
| **MED · GTM / analytics** | 1 | 2 | REPLACE if any URL hardcodes; verify |
| **LOW · prisma comments** | 5 | 46 | DEFER — schema/migration comments, no runtime effect |
| **LOW · lib internals + APIs** | 82 | 204 | DEFER — most are dev comments inside route handlers |
| **SKIP · brand entity** | 5 | 39 | LEAVE ALONE — YU.R as catalog brand row |
| **DOC · markdown docs** | 10 | 77 | DEFER — internal documentation |
| **CONFIG · env / configs / public/** | 14 | 46 | REPLACE — `.env.example`, `manifest.ts`, `public/sw.js`, `scripts/seed-yur-brands.ts` URL fallbacks |


## HIGH_I18N

```
  31  ./messages/en.json
  31  ./messages/fr.json
  31  ./messages/nl.json
  29  ./messages/ru.json
```

## HIGH_LEGAL_SEED

```
 105  ./prisma/seed-legal.ts
```

## HIGH_JOURNAL_SEED

```
  13  ./prisma/seed-journal.ts
```

## HIGH_EMAIL_SHELL

```
   5  ./src/lib/email/html.ts
```

## HIGH_EMAIL_COPY

```
  10  ./src/lib/email/abandoned-cart.ts
   6  ./src/lib/email/admin-new-order.ts
   5  ./src/lib/email/admin-new-return.ts
  13  ./src/lib/email/auth-change-email.ts
  21  ./src/lib/email/auth-confirm.ts
   5  ./src/lib/email/auth-magic-link.ts
  12  ./src/lib/email/auth-reset-password.ts
   8  ./src/lib/email/back-in-stock.ts
  10  ./src/lib/email/birthday.ts
   5  ./src/lib/email/contact-inquiry.ts
   3  ./src/lib/email/copy-overrides.ts
   5  ./src/lib/email/coupon-expiry-reminder.ts
   3  ./src/lib/email/gift-card-buyer-confirmation.ts
   4  ./src/lib/email/gift-card-recipient.ts
   2  ./src/lib/email/low-stock-alert.ts
  18  ./src/lib/email/loyalty-club-welcome.ts
   9  ./src/lib/email/loyalty-task-decision.ts
  17  ./src/lib/email/loyalty-tier-up.ts
   9  ./src/lib/email/newsletter-welcome.ts
  11  ./src/lib/email/order-cancelled.ts
  11  ./src/lib/email/order-confirmation.ts
  14  ./src/lib/email/order-refunded.ts
  11  ./src/lib/email/order-shipped.ts
   9  ./src/lib/email/quiz-ritual-ready.ts
   9  ./src/lib/email/referral-rewarded.ts
   3  ./src/lib/email/registration-welcome.ts
   5  ./src/lib/email/replenishment.ts
   5  ./src/lib/email/resend.ts
   6  ./src/lib/email/return-approved.ts
   8  ./src/lib/email/return-received.ts
  10  ./src/lib/email/return-requested.ts
  10  ./src/lib/email/review-request.ts
  17  ./src/lib/newsletter/confirmation-email.ts
   1  ./src/lib/newsletter/welcome-coupon.ts
```

## HIGH_JSONLD

```
  10  ./src/lib/seo/json-ld.ts
```

## HIGH_MANIFEST

```
   2  ./src/app/manifest.ts
```

## HIGH_SITEMAP

```
   3  ./src/app/sitemap.ts
```

## HIGH_LAYOUT

```
   3  ./src/components/brand/logo.tsx
   4  ./src/components/layout/announcement-bar.tsx
   1  ./src/components/layout/brands-mega-menu.tsx
   3  ./src/components/layout/footer.tsx
   2  ./src/components/layout/nav.tsx
   1  ./src/components/layout/search-overlay.tsx
```

## HIGH_MARKETING

```
   1  ./src/components/marketing/hero-popup.tsx
   7  ./src/components/marketing/register-welcome-popup.tsx
```

## HIGH_PUBLIC_PAGE

```
   3  ./src/app/[locale]/about/page.tsx
   2  ./src/app/[locale]/account/club/earn/[slug]/page.tsx
   2  ./src/app/[locale]/account/club/earn/page.tsx
   2  ./src/app/[locale]/account/club/redeem/page.tsx
   1  ./src/app/[locale]/account/layout.tsx
   1  ./src/app/[locale]/account/orders/[number]/review-actions.ts
   1  ./src/app/[locale]/account/page.tsx
   1  ./src/app/[locale]/account/returns/[number]/page.tsx
   5  ./src/app/[locale]/brands/page.tsx
   2  ./src/app/[locale]/checkout/actions.ts
   1  ./src/app/[locale]/checkout/checkout-client.tsx
   1  ./src/app/[locale]/checkout/checkout-unavailable.tsx
   1  ./src/app/[locale]/checkout/page.tsx
   2  ./src/app/[locale]/checkout/success/page.tsx
   2  ./src/app/[locale]/contact/actions.ts
   5  ./src/app/[locale]/contact/page.tsx
   1  ./src/app/[locale]/faq/page.tsx
   1  ./src/app/[locale]/forgot-password/actions.ts
   3  ./src/app/[locale]/ingredients/[slug]/page.tsx
   1  ./src/app/[locale]/journal/[slug]/page.tsx
   2  ./src/app/[locale]/journal/page.tsx
   6  ./src/app/[locale]/layout.tsx
   2  ./src/app/[locale]/legal/[key]/page.tsx
   1  ./src/app/[locale]/new/page.tsx
   2  ./src/app/[locale]/newsletter/confirmed/page.tsx
   2  ./src/app/[locale]/newsletter/invalid/page.tsx
   2  ./src/app/[locale]/newsletter/unsubscribed/page.tsx
   1  ./src/app/[locale]/not-found.tsx
   5  ./src/app/[locale]/page.tsx
   2  ./src/app/[locale]/quiz/restore/page.tsx
   1  ./src/app/[locale]/sale/page.tsx
   2  ./src/app/[locale]/search/page.tsx
   2  ./src/app/[locale]/shipping/page.tsx
   4  ./src/app/[locale]/shop/[slug]/page.tsx
   4  ./src/app/[locale]/shop/[slug]/review-actions.ts
   1  ./src/app/[locale]/shop/brand/[slug]/page.tsx
   2  ./src/app/[locale]/shop/category/[slug]/page.tsx
   1  ./src/app/[locale]/sign-up/actions.ts
   1  ./src/app/no-access/layout.tsx
   2  ./src/app/no-access/page.tsx
   1  ./src/app/not-found.tsx
   2  ./src/app/sign-in/actions.ts
   1  ./src/app/sign-in/layout.tsx
   1  ./src/app/sign-in/page.tsx
   1  ./src/components/about/certifications-strip.tsx
   1  ./src/components/account/order-review-form.tsx
   5  ./src/components/account/sidebar.tsx
  27  ./src/components/account/yur-club-drawer.tsx
   8  ./src/components/account/yur-club-menu-item.tsx
   1  ./src/components/cart/cart-drawer.tsx
   1  ./src/components/cart/cart-provider.tsx
   1  ./src/components/cart/free-shipping-meter.tsx
   1  ./src/components/checkout/address-autocomplete.tsx
   1  ./src/components/concierge/concierge-shell.tsx
   2  ./src/components/home/bestseller-card.tsx
   2  ./src/components/home/bestsellers.tsx
   1  ./src/components/home/hero-collage.tsx
   1  ./src/components/home/hero-moon-jar.tsx
   1  ./src/components/home/homepage-hero.tsx
   1  ./src/components/home/homepage-video-reel.tsx
   1  ./src/components/home/instagram-embed-tile.tsx
   2  ./src/components/home/instagram-section.tsx
   1  ./src/components/home/newsletter.tsx
   2  ./src/components/home/testimonials.tsx
   1  ./src/components/home/your-ritual.tsx
   2  ./src/components/shop/category-filter.tsx
   1  ./src/components/shop/pdp/product-details-panel.tsx
   1  ./src/components/shop/pdp/public-review-form.tsx
   1  ./src/components/shop/pdp/reviews-section.tsx
   2  ./src/components/shop/pdp/ritual-bundle-section.tsx
   2  ./src/components/shop/product-gallery.tsx
   1  ./src/components/shop/quick-view-modal.tsx
   1  ./src/components/shop/recently-viewed-rail.tsx
   4  ./src/components/shop/shop-filters.tsx
```

## MED_ADMIN

```
   1  ./src/app/admin/audit/page.tsx
   1  ./src/app/admin/categories/actions.ts
   1  ./src/app/admin/categories/tags/page.tsx
   1  ./src/app/admin/contact/[id]/page.tsx
   5  ./src/app/admin/contact/actions.ts
   1  ./src/app/admin/coupons/[code]/page.tsx
   1  ./src/app/admin/coupons/actions.ts
   1  ./src/app/admin/customers/[id]/page.tsx
   3  ./src/app/admin/customers/actions.ts
   1  ./src/app/admin/customers/export/route.ts
   2  ./src/app/admin/emails/[key]/page.tsx
   3  ./src/app/admin/emails/actions.ts
   1  ./src/app/admin/emails/field-meta.ts
   1  ./src/app/admin/emails/fixtures.ts
   1  ./src/app/admin/emails/page.tsx
   5  ./src/app/admin/emails/registry.ts
   2  ./src/app/admin/gift-cards/actions.ts
   1  ./src/app/admin/homepage/[section]/page.tsx
   2  ./src/app/admin/homepage/actions.ts
   1  ./src/app/admin/homepage/hero/page.tsx
   2  ./src/app/admin/homepage/page.tsx
   1  ./src/app/admin/ingredients/[id]/page.tsx
   1  ./src/app/admin/ingredients/export/route.ts
   1  ./src/app/admin/ingredients/import/import-client.tsx
   1  ./src/app/admin/ingredients/page.tsx
   3  ./src/app/admin/invoices/page.tsx
   2  ./src/app/admin/layout.tsx
   2  ./src/app/admin/loyalty/page.tsx
   1  ./src/app/admin/loyalty/settings/page.tsx
   1  ./src/app/admin/loyalty/tasks/claims/actions.ts
   1  ./src/app/admin/loyalty/tasks/claims/forms.tsx
   1  ./src/app/admin/loyalty/tasks/form.tsx
   1  ./src/app/admin/loyalty/tasks/page.tsx
   3  ./src/app/admin/marketing/hero-popup/actions.ts
   1  ./src/app/admin/marketing/instagram/[id]/page.tsx
   4  ./src/app/admin/marketing/instagram/actions.ts
   5  ./src/app/admin/marketing/instagram/page.tsx
   2  ./src/app/admin/marketing/page.tsx
   4  ./src/app/admin/marketing/promotions/page.tsx
   2  ./src/app/admin/marketing/welcome-popup/actions.ts
   6  ./src/app/admin/marketing/welcome-popup/page.tsx
   3  ./src/app/admin/media/actions.ts
   1  ./src/app/admin/media/page.tsx
   2  ./src/app/admin/orders/[id]/page.tsx
   6  ./src/app/admin/orders/actions.ts
   2  ./src/app/admin/orders/export/route.ts
   3  ./src/app/admin/orders/page.tsx
   2  ./src/app/admin/page.tsx
   7  ./src/app/admin/products/[id]/page.tsx
  30  ./src/app/admin/products/actions.ts
   4  ./src/app/admin/products/import/actions.ts
   2  ./src/app/admin/products/import/import-client.tsx
   1  ./src/app/admin/products/import/page.tsx
   1  ./src/app/admin/products/import/template/route.ts
   2  ./src/app/admin/products/page.tsx
   2  ./src/app/admin/redirects/actions.ts
   1  ./src/app/admin/returns/[id]/actions.ts
   1  ./src/app/admin/returns/[id]/page.tsx
   1  ./src/app/admin/settings/page.tsx
   1  ./src/app/admin/testimonials/new/page.tsx
   1  ./src/app/admin/testimonials/page.tsx
   1  ./src/components/admin/banners/media-picker.tsx
   1  ./src/components/admin/customers/danger-zone.tsx
   1  ./src/components/admin/dashboard/vat-ytd-widget.tsx
   2  ./src/components/admin/dashboard/visitor-count-widget.tsx
   5  ./src/components/admin/emails/copy-editor.tsx
   1  ./src/components/admin/emails/test-send-form.tsx
   2  ./src/components/admin/homepage/section-copy-form.tsx
   1  ./src/components/admin/ingredients/ingredient-form.tsx
   2  ./src/components/admin/journal/journal-form.tsx
   1  ./src/components/admin/media/media-card.tsx
   2  ./src/components/admin/media/media-drawer.tsx
   1  ./src/components/admin/orders/bulk-actions.tsx
   1  ./src/components/admin/orders/refund-form.tsx
   1  ./src/components/admin/orders/tracking-form.tsx
   1  ./src/components/admin/pages/page-form.tsx
   6  ./src/components/admin/products/ai-polish-translation.tsx
   5  ./src/components/admin/products/ai-suggest-tags.tsx
   4  ./src/components/admin/products/basics-form.tsx
   5  ./src/components/admin/products/inventory-panel.tsx
   1  ./src/components/admin/products/media-manager.tsx
  15  ./src/components/admin/products/organise-form.tsx
   7  ./src/components/admin/products/translations-form.tsx
   1  ./src/components/admin/settings/store-form.tsx
   2  ./src/components/admin/sidebar.tsx
   1  ./src/components/admin/taxonomies/category-form.tsx
   1  ./src/components/admin/taxonomies/tag-new-form.tsx
   2  ./src/components/admin/translate-button.tsx
```

## MED_AI_PROMPT

```
   6  ./src/lib/ai/catalog.ts
   3  ./src/lib/ai/polish-email-text.ts
  12  ./src/lib/ai/polish-text.ts
   4  ./src/lib/ai/quiz.ts
   3  ./src/lib/ai/suggest-tags.ts
   2  ./src/lib/ai/system-prompt.ts
   1  ./src/lib/ai/tools.ts
```

## MED_ANALYTICS

```
   2  ./src/components/analytics/google-tag-manager.tsx
```

## LOW_COMMENTS

```
   2  ./prisma/migrate-categories-7.ts
   1  ./prisma/migrations/20260422160000_add_contact_messages/migration.sql
   1  ./prisma/migrations/20260506200000_instagram_showcase/migration.sql
  41  ./prisma/schema.prisma
   1  ./prisma/seed-gift-card.ts
```

## LOW_LIB

```
   2  ./src/app/api/account/export/route.ts
   1  ./src/app/api/cron/abandoned-carts/route.ts
   1  ./src/app/api/cron/back-in-stock/route.ts
   2  ./src/app/api/cron/birthday/route.ts
   2  ./src/app/api/cron/coupon-expiry-reminder/route.ts
   2  ./src/app/api/cron/instagram-sync/route.ts
   2  ./src/app/api/cron/low-stock/route.ts
   3  ./src/app/api/cron/loyalty-birthday/route.ts
   2  ./src/app/api/cron/purge-deleted-users/route.ts
   1  ./src/app/api/cron/replenishment/route.ts
   1  ./src/app/api/cron/review-requests/route.ts
   1  ./src/app/api/cron/visitor-ping-purge/route.ts
   1  ./src/app/api/newsletter/confirm/route.ts
   1  ./src/app/api/track/route.ts
   1  ./src/app/api/webhooks/mollie/route.ts
   2  ./src/app/api/webhooks/resend/route.ts
   4  ./src/app/api/webhooks/sendcloud/route.ts
   1  ./src/app/auth/confirm/route.ts
   1  ./src/components/visitor/visitor-tracker.tsx
   1  ./src/i18n/request.ts
   1  ./src/i18n/routing.ts
   2  ./src/lib/admin/ingredient-csv.ts
   2  ./src/lib/admin/ingredient-upsert.ts
   1  ./src/lib/admin/native-input.ts
   7  ./src/lib/admin/product-csv.ts
   5  ./src/lib/analytics/track-purchase.ts
   1  ./src/lib/audit/db.ts
   1  ./src/lib/audit/log.ts
   1  ./src/lib/auth-roles-shared.ts
   3  ./src/lib/auth-roles.ts
   1  ./src/lib/auth.ts
   2  ./src/lib/cart/cart.ts
   1  ./src/lib/cart/quiz-ritual.ts
   1  ./src/lib/checkout/place-order.ts
   3  ./src/lib/checkout/sync-mollie.ts
   1  ./src/lib/consent/consent.ts
   2  ./src/lib/coupons/registration-welcome.ts
   1  ./src/lib/gift-cards/issue-from-order.ts
   3  ./src/lib/instagram/graph-api.ts
   2  ./src/lib/instagram/settings.ts
   1  ./src/lib/instagram/sync.ts
   1  ./src/lib/invoices/issue.ts
   4  ./src/lib/invoices/pdf.ts
   3  ./src/lib/loyalty/PHASE_A_README.md
   1  ./src/lib/loyalty/README.md
   2  ./src/lib/loyalty/account.ts
   3  ./src/lib/loyalty/accrue.ts
   6  ./src/lib/loyalty/drawer-data.ts
   2  ./src/lib/loyalty/redeem.ts
   3  ./src/lib/loyalty/settings.ts
   1  ./src/lib/loyalty/tasks.ts
   3  ./src/lib/loyalty/tiers.ts
   1  ./src/lib/marketing/popup-coordinator.ts
   1  ./src/lib/pricing/sale.ts
   4  ./src/lib/queries/admin-analytics.ts
   1  ./src/lib/queries/admin-banners.ts
   2  ./src/lib/queries/admin-coupons.ts
   3  ./src/lib/queries/admin-customers.ts
   1  ./src/lib/queries/admin-ingredients.ts
   4  ./src/lib/queries/admin-media.ts
   3  ./src/lib/queries/admin-testimonials.ts
   1  ./src/lib/queries/home-hero.ts
   1  ./src/lib/queries/home-video.ts
   1  ./src/lib/queries/instagram.ts
   1  ./src/lib/queries/journal.ts
   3  ./src/lib/queries/low-stock.ts
   3  ./src/lib/queries/pages.ts
   2  ./src/lib/queries/pdp.ts
  16  ./src/lib/queries/products.ts
   3  ./src/lib/queries/promotions.ts
   2  ./src/lib/queries/quiz-popup.ts
   6  ./src/lib/queries/site-copy.ts
   1  ./src/lib/queries/testimonial.ts
   1  ./src/lib/queries/vat-ytd.ts
   3  ./src/lib/queries/visitor-count.ts
  12  ./src/lib/queries/welcome-popup.ts
   1  ./src/lib/returns/db.ts
   1  ./src/lib/sendcloud/status-map.ts
  14  ./src/lib/sendcloud/sync.ts
   6  ./src/lib/settings.ts
   2  ./src/lib/translate/deepl.ts
   1  ./src/middleware.ts
```

## SKIP_BRAND

```
   5  ./prisma/seed-supplier.ts
  12  ./prisma/seed.ts
  15  ./scripts/seed-yur-brands.ts
   5  ./src/components/shop/brand-tabs.tsx
   2  ./src/components/shop/line-tabs.tsx
```

## DOC

```
  11  ./README.md
  10  ./docs/abs-rebrand-audit.md
   8  ./docs/audit-shipping-vat.md
   2  ./docs/audit-wcag-2026-04-23.md
  10  ./docs/google-ads-roadmap.md
  13  ./docs/kelmusgroup-migration-runbook.md
  14  ./docs/overnight-2026-04-23.md
   5  ./docs/role-granularity.md
   7  ./docs/yur-club-drawer-variants.html
   2  ./welcome-popup-preview.html
```

## CONFIG

```
   6  ./.env
  11  ./.env.example
   9  ./.env.local
   1  ./next.config.ts
   2  ./package-lock.json
   2  ./package.json
   1  ./public/sw.js
   1  ./scripts/cleanup-category-artifacts.ts
   1  ./scripts/lighthouse-baseline.sh
   4  ./scripts/migrate-to-nested-categories.ts
   5  ./scripts/seed-quiz-taxonomies.ts
   1  ./src/app/globals.css
   1  ./tailwind.config.ts
   1  ./tsconfig.tsbuildinfo
```
