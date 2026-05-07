# Overnight batch — 2026-04-23

Ten-thousand-foot summary of everything touched between the "run all four
batches, summarise in the morning" brief and now, so you can skim the
diff before pushing.

Nothing here is committed — every file is staged locally for your
review. Prisma-not-regenerated errors will clear after
`pnpm prisma migrate dev` + `pnpm prisma generate` on your machine.

---

## Batch 1 — Customer-facing trust

### 1.1  `/quiz` skin-quiz page ✅
- New `/[locale]/quiz` page, 4-step funnel, routes to shop with
  pre-filled filters.
- Keys added to all 4 locales under `quiz.*`.
- CTA surface on homepage + PDP.

### 1.2  Returns / RMA flow ✅
- `ReturnRequest` + `ReturnItem` Prisma models.
- `/account/returns` customer page + `/admin/returns` list/detail.
- 3 email templates (RMA received / approved / rejected) wired via
  Resend + i18n copy.

### 1.3  GDPR subject-access-request flow ✅
- `/account/privacy` with "download my data" (JSON) + "delete my
  account" (soft-delete with 30-day grace) buttons.
- Admin counterpart at `/admin/customers/[id]` showing pending deletion
  state.
- Audit-logged both actions.

---

## Batch 2 — Ops hygiene

### 2.1  Redirect manager ✅
- `Redirect` model + `RedirectCode` enum (301/302).
- `/admin/redirects` CRUD list/edit.
- Auto-insertion hook on product/category/brand slug rename.
- Middleware-level 404-catcher fallback so lookups don't slow live
  pages.

### 2.2  Audit log ✅
- `AuditLog` model; `src/lib/audit/log.ts` helper.
- Viewer at `/admin/audit`, filterable by actor + entity.
- Logging wired on settings changes, coupon edits, returns decisions,
  customer deletions.

### 2.3  Inventory movement log ✅
- `InventoryMovement` model; every stock adjustment (order placed,
  refund, manual adjust, CSV import) writes a row via
  `src/lib/inventory/movements.ts`.
- Inline history panel on product edit page.

---

## Batch 3 — Polish + audit

### 3.1  WCAG 2.2 AA audit ✅
- Skip-link on root layout, focus ring tokens, aria-modal on concierge,
  Escape-to-close on cart drawer + concierge, focus return to trigger.

### 3.2  404 / 500 pages ✅
- Brand-consistent error pages in all 4 locales with calm copy + 2
  escape CTAs.

### 3.3  Shipping + VAT audit ✅
- `docs/audit-shipping-vat.md` — confirms launch-safe for Benelux flat
  rate; flags 7 gaps (G1–G7: per-country, weight-based, B2B VAT-ID,
  product-category VAT, carrier integration, multilang disclaimer,
  explicit shipping tax line). Decide in a future pass.

### 3.4  Link + translation sweep ✅
- `scripts/sweep-links-translations.mjs` — walks src/, validates all
  `<Link href>` against collected routes, cross-checks t() calls against
  all 4 locale JSONs.
- Final report: **0 broken links, 0 missing keys, 0 locale parity
  issues** across 367 files / 86 hrefs / 614 translation calls.
- Report persisted at `docs/audit-links-translations.md`.

---

## Batch 4 — Multi-person admin readiness

### 4.1  Role granularity ✅
- `src/lib/auth-roles.ts` — new: 3 roles (OWNER/EDITOR/FULFILMENT)
  + capability matrix + `requireCapability()` guard.
- `src/app/admin/layout.tsx` — switched to `requireAdminWithRole`,
  passes role to sidebar.
- `src/components/admin/sidebar.tsx` — nav filtered per role; role pill
  next to signed-in email.
- `src/app/no-access/page.tsx` — smarter copy: distinguishes
  "not allow-listed" vs "signed in but out of scope".
- Page-level gates added: `/admin/settings/*`, `/admin/customers`,
  `/admin/customers/export`, `/admin/audit`, `/admin/redirects`,
  `/admin/coupons`, `/admin/emails`.
- `docs/role-granularity.md` — full matrix, usage patterns, env-var
  setup, and the short list of server-actions still to gate (orders
  write, returns write, contact reply, product delete, customers edit).

### 4.2  AI orb accessibility ✅
- `concierge-chat.tsx` — `role="log" aria-live="polite" aria-atomic="false"
  aria-relevant="additions text"` on the message transcript; `aria-busy`
  flipped while model is streaming so SR doesn't re-announce partial
  content; thinking indicator wrapped in `role="status"`; error banner
  is `role="alert"`; input gets `aria-describedby` pointing at an
  sr-only "Press Enter to send" hint; auto-focus on mount so users
  don't have to Tab into the composer.
- `concierge-shell.tsx` — Tab-wraparound focus trap (Shift+Tab from
  first element wraps to last, Tab from last wraps to first); recomputes
  tabbable nodes on each keydown so picker ↔ quiz ↔ chat mode switches
  stay in sync.
- 4 new locale keys (`chat_log_label`, `chat_input_hint`) in EN/NL/FR/RU.

---

## What you need to do in the morning

Before push:
1. `pnpm prisma generate` (clears the 23 Prisma-not-regenerated errors
   in typecheck — `returnRequest`, `returnItem`, `inventoryMovement`,
   `auditLog`, `redirect`, `RedirectCode`, `AuditLogWhereInput`).
2. Review `docs/role-granularity.md` §4 "Still to do" — 6 server-action
   guards left for a follow-up pass (one line each, left undone to keep
   this change-set reviewable).
3. Review `docs/audit-shipping-vat.md` and decide which G-gaps matter
   for launch.

After push, on Hostinger env:
- Optional: `EDITOR_ALLOWED_EMAILS` + `FULFILMENT_ALLOWED_EMAILS` if
  you want to actually hand out narrower keys to an admin's VA or
  copywriter. Empty lists = existing behaviour (owner-only) preserved.

---

## Files changed — quick grep aid

New:
- `src/lib/auth-roles.ts`
- `scripts/sweep-links-translations.mjs`
- `docs/role-granularity.md`
- `docs/audit-shipping-vat.md`
- `docs/audit-links-translations.md`
- `docs/overnight-2026-04-23.md`  ← this file

Modified (this session's touch set):
- `src/app/admin/layout.tsx`
- `src/components/admin/sidebar.tsx`
- `src/app/admin/settings/layout.tsx`
- `src/app/admin/customers/page.tsx`
- `src/app/admin/customers/export/route.ts`
- `src/app/admin/audit/page.tsx`
- `src/app/admin/redirects/page.tsx`
- `src/app/admin/coupons/page.tsx`
- `src/app/admin/emails/page.tsx`
- `src/app/no-access/page.tsx`
- `src/components/concierge/concierge-chat.tsx`
- `src/components/concierge/concierge-shell.tsx`
- `messages/en.json` · `messages/nl.json` · `messages/fr.json` · `messages/ru.json`

Files from earlier batches (returns, redirects, audit, inventory,
quiz, GDPR, 404/500) are in their respective feature folders — the
diff will show them grouped by directory.

Typecheck: 23 errors, all expected Prisma-not-regenerated. 0 new
errors from overnight work.

---

## Batch 5 — Company legal sweep + HQ brand doc integration

Triggered by an admin sending real VAT + IBAN and the HQ brand materials
doc. Two passes, both landed uncommitted.

### 5.1  Legal / compliance placeholder sweep

Every placeholder VAT / KBO / address / phone swapped for real K'Elmus
Group BV data. Spots touched:
- `/contact` page — address swapped to Boomsesteenweg 41/4b · 2630
  Aartselaar (was Rue de la Clinique / Anderlecht); VAT + KBO → BE
  1031.312.116; phone row removed (all contact routes through
  `hello@asianbeautyshop.eu`).
- `/legal/imprint` — VAT + KBO real values across EN / NL / FR / RU;
  phone row removed from all 4 locales; new "Bank" block added with
  IBAN BE96 0689 5761 0905 + BIC GKCCBEBB.
- `/legal/terms` — inline "VAT BE 0800.000.000" → real VAT in all 4
  locales.
- `/legal/returns` — contact-support paragraph rewritten to drop the
  placeholder phone; email-only going forward.
- JSON-LD Organization (site-wide) — added `vatID`, `taxID`,
  `streetAddress`, `postalCode`, `addressLocality` so Google's Knowledge
  Graph can match YU.R to the legal entity.
- 6 transactional email templates — footer city "Brussels / Brussel /
  Bruxelles / Брюссель" → "Aartselaar / Артселар" across all locales
  (order-confirmation, order-shipped, order-cancelled, order-refunded,
  return-received, return-approved, abandoned-cart, review-request,
  return-requested, contact-inquiry, low-stock-alert, admin-new-return).
  "studio in Brussels" copy lines rewritten to "studio in Aartselaar".
- **Customer receipts only** (order-confirmation, order-shipped,
  order-cancelled, order-refunded) now render a second footer line:
  `VAT BE 1031.312.116 · IBAN BE96 0689 5761 0905 · BIC GKCCBEBB`.
  Internal admin emails stay clean. Constant lives in
  `src/lib/email/html.ts` as `BUSINESS_LEGAL_LINE`.

### 5.2  HQ brand doc integration

The materials an admin forwarded (Mr. & Mrs. Jung founding story, "You
Are the Skin Solution" philosophy, ECIS + CIT production, CPNP / ECAS /
Montaji / GMP certifications) rewritten into the site:
- **New `/[locale]/about` route** — `src/app/[locale]/about/page.tsx`
  + `src/lib/queries/pages.ts` now exposes `getStaticPage()` alongside
  `getLegalPage()`, so admin-editable editorial pages reuse the same
  EN-fallback pipeline. The footer + nav "About" link now lands
  somewhere instead of 404-ing.
- **About body copy** seeded via `prisma/seed-legal.ts` (key "about",
  EN only — NL/FR/RU fall back until an admin approves translations).
  Covers philosophy → founding story → mission → values → production →
  certifications → pregnancy advisory, straight from the HQ doc.
- **Certifications strip** — new `src/components/about/certifications-strip.tsx`,
  rendered on /about. Four typographic cards: CPNP, ECAS, Montaji, GMP
  with `<abbr title>` expansions for SR accessibility. Reusable on
  other trust surfaces later.
- **Homepage brand tagline** — `messages/*.json` `brand.tagline`
  swapped from "Korean skincare, considered." to "You Are the Skin
  Solution." across all 4 locales. Propagates to the footer. SiteCopy
  overrides still win, so an admin can revert via /admin/homepage.
- **Deliberately deferred** (flagged in task #133 now closed, but
  worth a second pass):
  · First journal article "You Are the Skin Solution" — needs an admin's
    approval on voice before it goes live.
  · NL / FR / RU translations for /about (EN fallback kicks in now).
  · PDP product descriptions from section 4 of the doc (CCC / DD
    cream) — waiting until those SKUs are in the admin.
  · FAQ pregnancy note — needs a FAQ page first (doesn't exist).

### What you need to do before / after push (additions)

- **Seed re-run:** after `prisma migrate dev` + `prisma generate`,
  run `pnpm tsx prisma/seed-legal.ts --force=imprint,terms,returns,about`
  to overwrite the DB translations with the new VAT + address + bank
  block + about body. Without `--force` the existing rows are
  preserved, so nothing changes.
- **Double-check VAT format:** I wrote `BE 1031.312.116` (dots) on the
  public page and JSON-LD uses raw `BE1031312116` — both are valid,
  but if your accountant prefers one house style let me know and I'll
  align.

### Files touched in this batch

Modified:
- `src/app/[locale]/contact/page.tsx`
- `src/lib/seo/json-ld.ts`
- `src/lib/queries/pages.ts`
- `src/lib/email/html.ts`  (+ `BUSINESS_LEGAL_LINE` export)
- `src/lib/email/order-confirmation.ts`
- `src/lib/email/order-shipped.ts`
- `src/lib/email/order-cancelled.ts`
- `src/lib/email/order-refunded.ts`
- `src/lib/email/*.ts` (city name swap across 12 template files)
- `prisma/seed-legal.ts`  (VAT/KBO/phone swap + new About entry +
  Partial translations type)
- `messages/{en,nl,fr,ru}.json`  (brand.tagline)

New:
- `src/app/[locale]/about/page.tsx`
- `src/components/about/certifications-strip.tsx`

---

## Batch 6 — Fill the four missing public pages

Linked from nav/footer but previously 404-ing: `/shipping`, `/faq`,
`/rituals`, `/ingredients`. All four built and wired in one pass.

### 6.1  /shipping  ✅
- `src/app/[locale]/shipping/page.tsx` — admin-editable static page
  (key `"shipping"`).
- Body seeded in `prisma/seed-legal.ts` with real K'Elmus shipping info:
  Benelux + France + Germany flat €5.95, free above €75, 1–5 working
  day windows by zone, packaging (FSC + moulded pulp, no plastic void
  fill), damaged-in-transit instructions, VAT position. Written to
  satisfy BE Code of Economic Law Art. VI.45 pre-contractual disclosure.
- EN only in seed; NL/FR/RU fall back until an admin ships translations.

### 6.2  /faq  ✅
- `src/app/[locale]/faq/page.tsx` — same static-page pipeline, key
  `"faq"`.
- Body seeded in `prisma/seed-legal.ts`. Seven categories (ordering,
  shipping, returns, products/ingredients, account/privacy, business/
  wholesale) with `<h3>` per question — structure already matches
  Google's FAQPage schema so we can attach JSON-LD in a follow-up for
  rich-result eligibility.

### 6.3  /rituals  ✅
- `src/app/[locale]/rituals/page.tsx` — editorial landing for the
  four-step routine, previously only reachable as the `#ritual` anchor
  on the homepage.
- Pulls live categories from `getShopCategories(locale)` and deep-links
  each step to the matching category page (`cleansers`,
  `treatments`, `moisturisers`, `sunscreens`). If a category slug
  hasn't been created yet, the step falls back to
  `/shop?ritual=<step>` so the page never 404s a broken link.
- Full copy in all 4 locales under the new `rituals.*` namespace.

### 6.4  /ingredients  +  /ingredients/[slug]  ✅
- New query helper `src/lib/queries/ingredients.ts`:
  - `listActiveIngredients(locale)` — A-Z listing, key-assets first,
    per-ingredient published-product count, short description
    stripped from the rich-text body.
  - `getIngredientBySlug({ slug, locale })` — full detail with every
    published product that contains the ingredient (key-asset
    appearances float to the top), EN fallback on the translation.
- `src/app/[locale]/ingredients/page.tsx` — two-lane layout:
  "Key actives" featured cards at the top, then an alphabetised A-Z
  index with a desktop jump bar. Graceful empty state (the Ingredient
  table is currently unseeded — an admin populates via /admin/products).
- `src/app/[locale]/ingredients/[slug]/page.tsx` — detail page with
  key-asset + allergen flags, full rich-text description, and every
  product using the ingredient as a visual card row with INCI badge,
  price, and hero-ingredient pill when `ProductIngredient.isKey` is
  set.
- Full copy in all 4 locales under the new `ingredients.*` namespace.

### What you need to do

After push:
- Run `pnpm tsx prisma/seed-legal.ts --force=shipping,faq` to materialise
  the seeded bodies. (The About seed from last night is already in
  that same file under `--force=about`.)
- Next time you/an admin add products, populate ingredients via the
  existing admin product edit page — that's the only way rows get into
  `Ingredient` until we build a dedicated `/admin/ingredients` CRUD.
  In the meantime `/ingredients` shows the friendly empty state.

### Files touched in this batch

New:
- `src/app/[locale]/shipping/page.tsx`
- `src/app/[locale]/faq/page.tsx`
- `src/app/[locale]/rituals/page.tsx`
- `src/app/[locale]/ingredients/page.tsx`
- `src/app/[locale]/ingredients/[slug]/page.tsx`
- `src/lib/queries/ingredients.ts`

Modified:
- `prisma/seed-legal.ts`  (new `shipping` + `faq` PageCopy entries)
- `messages/{en,nl,fr,ru}.json`  (new `ingredients.*` + `rituals.*`
  namespaces)

Typecheck: 0 new errors from this batch.

---

## Batch 7 — Admin ingredients CRUD + migration & env-var checklist

### 7.1  /admin/ingredients CRUD ✅

an admin can now curate the ingredient library end-to-end without going
through the product-edit screen every time.

New files:
- `src/lib/queries/admin-ingredients.ts` — `listAdminIngredients`,
  `getAdminIngredient`, `isSlugTaken`.
- `src/app/admin/ingredients/actions.ts` — `createIngredientAction`,
  `updateIngredientAction`, `deleteIngredientAction`,
  `toggleIngredientFlagAction`. All gated on `ingredients.edit`.
- `src/app/admin/ingredients/page.tsx` — list view with in-line
  key-asset / allergen toggles, translation-count, product-count, slug.
- `src/app/admin/ingredients/new/page.tsx` — create form.
- `src/app/admin/ingredients/[id]/page.tsx` — edit form + "Linked
  products" strip (click-through to product edit) + delete danger zone.
- `src/components/admin/ingredients/ingredient-form.tsx` — shared form
  (slug, INCI name, flags, EN/NL/FR/RU translations).

Modified:
- `src/lib/auth-roles.ts` — new `ingredients.edit` capability, granted
  to OWNER + EDITOR (ingredients are content).
- `src/components/admin/sidebar.tsx` — new "Ingredients" entry under
  Categories, icon Beaker. Filtered out for FULFILMENT role.

### 7.2  Pending migrations — status + exact commands

Both pending DB migrations (#115 + #117) already have their `.sql`
files committed. They just need to be applied to Supabase.

**Migrations staged, not yet applied to the DB:**
```
prisma/migrations/
  20260422140000_address_user_nullable/   ← task #115 — guest-checkout address
  20260422160000_add_contact_messages/    ← task #117 — contact form storage
  20260423020000_add_redirects/           ← last night's redirect manager
  20260423030000_add_audit_log/           ← last night's audit log
  20260423040000_add_inventory_movement/  ← last night's inventory log
```

**What to run on your laptop** (any time before push — all idempotent):

```bash
# 1. Apply the 5 pending migrations against the DB pointed to by
#    DATABASE_URL (your Supabase prod URL).
pnpm prisma migrate deploy

# 2. Regenerate the Prisma client so TypeScript sees the new tables.
pnpm prisma generate

# 3. Verify. After this the typecheck should clean up — the 23
#    pre-existing errors about `redirect`, `auditLog`,
#    `inventoryMovement`, `returnRequest`, `AuditLogWhereInput`,
#    `RedirectCode` all resolve.
pnpm tsc --noEmit
```

If you'd rather do it the dev-mode way (useful if you want to iterate
on schema while applying):
```bash
pnpm prisma migrate dev   # applies + regenerates in one step
```

**After migrate, re-seed the fresh content from the last two batches:**
```bash
pnpm tsx prisma/seed-legal.ts --force=imprint,terms,returns,about,shipping,faq
```

### 7.3  Hostinger env vars — what's still off

Four environment variables on prod that currently leave features in
their "fallback" state:

| Key | Where to get it | What breaks if missing |
|---|---|---|
| `MOLLIE_API_KEY` | Mollie dashboard → Developers → API keys | Checkout — card/Bancontact/iDeal payments all fail |
| `GROQ_API_KEY` | console.groq.com → API keys | AI concierge orb falls back to the rule-based quiz only |
| `RESEND_API_KEY` | resend.com → API keys | Every transactional email (order confirmation, shipped, returns, contact form) silently drops |
| `RESEND_WEBHOOK_SECRET` | Resend dashboard → Webhooks → your endpoint | Bounce / complaint events aren't verified — we currently accept them; tightening means flipping this on |

**How to set them on Hostinger Business** (Node.js app hosting):

1. hPanel → Hosting → `asianbeautyshop.eu` → Website → "Node.js app"
   (or "Manage" if hosting the build directly).
2. Scroll to **Environment variables** section.
3. Click **Add variable** and fill in each key/value pair above.
4. Hit **Restart application** (or "Restart Node.js") after saving —
   Hostinger does NOT auto-restart on env changes.

The Hostinger MCP surfaced for this project covers DNS, domains, VPS,
billing — it doesn't expose hPanel env-var management for shared
Node.js hosting, so this has to be done in the UI.

Optional — while you're in hPanel:
- `MOLLIE_WEBHOOK_SECRET` if you enabled webhook signing (#112).
- `EDITOR_ALLOWED_EMAILS` / `FULFILMENT_ALLOWED_EMAILS` if you want to
  hand out narrower admin keys (role granularity from last night).

### 7.4  Still owned by humans — real product catalog

Not touched tonight because it's a data-entry task, not a code task.
HQ needs to supply the real SKUs with:
- INCI name + ingredients list per product
- Prices in EUR
- High-res product photos (jpeg/png, 2000px long side minimum)
- EN + ideally NL/FR/RU copy (else EN fallback works)
- Category assignment (cleansers / treatments / moisturisers / sunscreens)

Once those land, an admin can bulk-import via `/admin/products/import`
(CSV) or enter one-by-one in the product editor. The whole public
surface (homepage bestsellers, /shop, /ingredients, PDPs, search) will
populate the moment those rows arrive.

### Files touched in this batch

New:
- `src/lib/queries/admin-ingredients.ts`
- `src/app/admin/ingredients/page.tsx`
- `src/app/admin/ingredients/new/page.tsx`
- `src/app/admin/ingredients/[id]/page.tsx`
- `src/app/admin/ingredients/actions.ts`
- `src/components/admin/ingredients/ingredient-form.tsx`

Modified:
- `src/lib/auth-roles.ts`  (new `ingredients.edit` capability)
- `src/components/admin/sidebar.tsx`  (new Ingredients entry)

Typecheck: 0 new errors.
