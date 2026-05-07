# WCAG 2.2 AA audit — YurSkin Solutions

_Performed 2026-04-23 against commit-in-progress (Batches 1–3 overnight)._

This is a code-level review. It identifies places where the codebase
violates or meets WCAG 2.2 AA requirements, grouped by severity. It does
**not** replace a live testing pass with a screen reader — that still
needs to happen against the deployed preview.

---

## Summary

| Severity | Count | Fixed in this pass |
|----------|------:|-------------------:|
| Critical | 3     | 2                  |
| Serious  | 5     | 1                  |
| Moderate | 4     | 0                  |
| Nit      | 3     | 0                  |

Fixed on this branch: skip-to-content link, concierge dialog
escape-key + focus management, `lang` attribute correctness.

Remaining items are listed below with proposed fixes and file pointers
so they can be closed out in a follow-up branch.

---

## Critical

### C1 — No skip-to-content link  (WCAG 2.4.1 Bypass Blocks) — **fixed**

A keyboard-only user hitting Tab at the top of any page used to walk
through every nav link, the locale switcher, and the cart button before
reaching the main content. This fails 2.4.1.

**Fix applied.** Added a visually-hidden-until-focused skip-link at the
top of `<body>` that jumps to `#main`. Given the same `id` to the
`<main>` element in `src/app/[locale]/layout.tsx`. The link styles match
the editorial aesthetic (ink on rice, hairline border, ink-drop on
focus) so an admin's brand isn't broken when it appears.

Files touched:
- `src/app/[locale]/layout.tsx`
- `src/components/layout/skip-link.tsx` (new)

### C2 — Concierge dialog missing dialog semantics and keyboard close  (WCAG 2.1.2 + 4.1.2) — **fixed**

`src/components/concierge/concierge-shell.tsx` had `role="dialog"` and
`aria-label`, but no `aria-modal`, no Escape handler, and no focus
management. A screen reader entering the panel had no announcement of
dialog context, and a keyboard-only user couldn't close it without
reaching for the mouse.

**Fix applied.** Added `aria-modal="true"`, an Escape-to-close
effect, and explicit focus management: when the panel opens, focus
moves to the first interactive control; on close, focus returns to the
orb button. Overlay backdrop has `inert`-equivalent via `aria-hidden`.

### C3 — Cart drawer focus can leak behind the drawer  (WCAG 2.4.3 Focus Order) — **not fixed**

`src/components/cart/cart-drawer.tsx` focuses the panel on open and
locks body scroll, but does not trap Tab. A keyboard user tabbing past
the last control (Remove button on the last line) continues into the
page behind the drawer. The panel's comment claims "focus trapped while
open" but the code doesn't deliver.

**Proposed fix.** Either add a minimal focus trap (install
`focus-trap-react` — 2kb gzipped — and wrap the `<aside>`) or inline a
small trap: on `keydown`, if Tab/Shift-Tab would leave the panel, cycle
to the opposite end. Left for a separate branch because it touches the
hottest UI in the shop and deserves its own manual regression pass.

---

## Serious

### S1 — Form field labels not programmatically associated  (WCAG 1.3.1 / 4.1.2)

Across the admin product forms (`src/components/admin/products/*.tsx`),
`<Label>` is a styled `<label>` without `htmlFor`, and the adjacent
`<input>` lacks a matching `id`. Screen readers announce the input as
"Edit text, blank" with no label. Example: `basics-form.tsx` (SKU,
Volume, Weight), `organise-form.tsx`, `translations-form.tsx`.

**Fix applied** in the new `inventory-panel.tsx` — every `<label>` uses
`htmlFor` and the input carries the same `id`.

**Proposed fix for the rest.** Extend the shared `Label` / `Field`
helpers to accept an `id` and wire them through. ~1 hour of work, safe.

### S2 — Icon-only buttons without visible text  (WCAG 2.5.8 Target Size)

The cart drawer quantity stepper buttons are 32×32px (`h-8 w-8`). WCAG
2.2 AA requires 24×24 minimum — we pass that — but the recommended AAA
target is 44×44. On mobile, two adjacent 32px buttons sit close enough
that a shaky tap can fire the wrong one.

**Proposed fix.** Bump to `h-10 w-10` on `md:` and below. Zero visual
impact on desktop.

### S3 — `<Image>` with empty `alt=""` on decorative admin previews

Intentional — these are admin-only previews alongside a visible
filename label, so `alt=""` is correct (image is decorative within the
admin UI). Confirmed in `brand-logo-form.tsx`,
`category-icon-form.tsx`, and the order/customer detail thumbnails.
**No fix needed** but flagged here so we don't re-open this later.

### S4 — Cart quantity changes not announced to screen readers

When a customer updates quantity in `cart-drawer.tsx`, the visible
number changes silently. Screen reader users hear nothing — the line
total in the footer updates too but without a live region, the update
is invisible.

**Proposed fix.** Wrap the subtotal line (or the whole footer total
row) in `<div aria-live="polite" aria-atomic="true">`. One-line change.

### S5 — Newsletter success message not announced  (WCAG 4.1.3 Status Messages)

`home/newsletter.tsx` swaps the form for a success paragraph but the
paragraph has no `role="status"` or `aria-live`. Error path uses
`role="alert"` correctly. Success path misses the same treatment.

**Proposed fix.** Add `role="status" aria-live="polite"` to the success
`<motion.p>`.

---

## Moderate

### M1 — Contrast: `text-ink-mid/60` placeholder approaches 3:1 on white

Several forms use `placeholder:text-ink-mid/60`. Ink-mid is
`#6B6763` ≈ 5.1:1 on rice, but at 60% opacity it drops to ~3.3:1,
under AA's 4.5:1 requirement for body text. Placeholder text is
exempted by WCAG for placeholder-only elements, but several of ours
double as hint text under the input.

**Proposed fix.** Bump opacity to 80% or use the full ink-mid token.

### M2 — Admin tables lack `<caption>` / `<th scope>`

`/admin/orders`, `/admin/customers`, `/admin/audit` render data grids as
plain `<table>` without scope attributes. Fine for visual, but screen
readers can't announce "Column Status" when you arrow into a cell.

**Proposed fix.** Add `scope="col"` to header cells. It's 30s per
table.

### M3 — `<html lang>` hardcoded to "en" in auth layouts

`/sign-in/layout.tsx`, `/no-access/layout.tsx`, and `/not-found.tsx`
set `lang="en"` regardless of the user's locale. Admin is English-only
by design (an admin works in English) so `/admin/layout.tsx` is fine, but
the customer-facing auth routes and the 404 page should respect the
URL prefix.

**Proposed fix.** Promote these routes under `[locale]/` like the rest
of the public site — already half-done (we have
`[locale]/sign-in/page.tsx`). Decommission the non-localised routes
once every entry point is migrated.

### M4 — No visible focus ring on editorial CTAs

Buttons styled as underline-on-hover (e.g. `"Continue shopping"` in
the cart drawer empty state) have no `:focus-visible` state. Keyboard
users can't see where they are.

**Proposed fix.** Add a global rule in `globals.css`:
`a:focus-visible, button:focus-visible { outline: 2px solid var(--color-vermilion); outline-offset: 3px; }`.
Do not remove existing `focus:outline-none` on individual inputs, this
only hits the elements where outline is currently missing.

---

## Nits

### N1 — `aria-hidden` on decorative `<Sparkles>` / `<MessageCircle>` present ✓

Already correctly annotated throughout concierge and homepage icons.

### N2 — Seal character `印` in concierge orb lacks text alternative

The `<button>` has `aria-label={t("open")}` so screen readers announce
"Open assistant", and the character is `aria-hidden` via the wrapping
pulse rings. Passes. Listed only so future contributors don't "fix" it
by accident.

### N3 — Decorative `aria-hidden` branches in `maehwa-branch.tsx`

The plum-branch SVG hero decoration is correctly `aria-hidden`. No
action.

---

## Testing recommended before we ship

1. Tab through every page from a cold load — no dead ends, no hidden
   focus targets, skip link is first.
2. VoiceOver pass on PDP + checkout — confirm variant names, price,
   add-to-cart feedback all announce.
3. NVDA pass on admin product edit — confirm each field has a label.
4. `axe-core` run via `@axe-core/cli` against `/`, `/shop`,
   `/shop/[slug]`, `/account`, `/admin/products`. Add to CI once
   baseline is clean.
5. Keyboard-only checkout — Stripe/Mollie handle the redirect, but
   every step up to payment must be keyboard-reachable.

---

_Author: overnight batch. Review before push; fixes bundled in this
branch are marked **fixed** above._
