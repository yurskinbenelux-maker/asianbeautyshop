# Shipping & VAT audit

**Date:** 2026-04-23
**Scope:** `src/lib/settings.ts`, `src/lib/checkout/pricing.ts`, `prisma/schema.prisma` (Order/Address), `src/app/admin/settings/{shipping,tax}`.
**Goal:** Confirm the shipping-and-tax pipeline is correct for Sofia's Benelux launch (BE/NL/FR/LU/DE) and flag the gaps before we open the shop to real orders.

---

## 1. Summary

The pipeline is **correct for a single-rate, single-zone, VAT-inclusive Dutch/Belgian launch**. It will bill the right amount, show the right free-shipping threshold, and let the admin edit both without redeploying.

It is **not ready** for any of the following:
- Per-zone or per-country shipping rates (e.g. NL €4.95, FR €8.95, DE €6.95).
- Weight-based or volume-based shipping (even though `Product.weightGrams` already exists).
- B2B / VAT-ID reverse-charge checkout.
- Product-level reduced-VAT categories (all goods are charged the single store rate).
- Carrier integration (Sendcloud / PostNL / bpost) — we only quote a price, we don't book a label.

Severity: **Moderate.** Launch-blocking only if Sofia wants non-flat shipping on day one. Everything else is post-launch scope.

---

## 2. What's wired today

### 2.1 Shipping settings — `src/lib/settings.ts`

```ts
ShippingSettings {
  freeThresholdCents: number   // default 7500  (€75)
  flatRateCents: number        // default 595   (€5.95)
  allowedCountries: string[]   // default ["BE","NL","FR","LU","DE"]
  disclaimer: string           // editorial microcopy
}
```

- Single flat rate, applied to every destination we ship to.
- Single free-shipping threshold, applied to every destination we ship to.
- `allowedCountries` is an **allow-list**: any ISO-3166 alpha-2 outside it gets `shippable: false` and cannot check out.
- Edited via `/admin/settings/shipping` (server action in `src/app/admin/settings/actions.ts`).

### 2.2 Tax settings — `src/lib/settings.ts`

```ts
TaxSettings {
  ratePercent: number          // default 21  (NL/BE standard rate)
  includedInPrice: boolean     // default true — prices on the shop are gross
  overrides: Record<CC, number> // e.g. { "FR": 20, "DE": 19, "LU": 17 }
}
```

- `includedInPrice: true` means subtotal already contains VAT; we decompose to show it on the invoice.
- `overrides[country]` lets admin set a **different standard rate** per destination country.
- Edited via `/admin/settings/tax`.

### 2.3 Pricing pipeline — `src/lib/checkout/pricing.ts :: computeOrderTotals()`

Order of operations:

1. **Subtotal** — sum of `qty × unitCents` over cart lines.
2. **Shippability** — if destination country is not in `allowedCountries`, return early with `shippable: false`.
3. **Shipping** — if subtotal ≥ `freeThresholdCents` → €0 (reason `free_threshold`). Otherwise `flatRateCents` (reason `flat_rate`).
4. **Coupon** — `PERCENT`, `FIXED`, or `FREE_SHIPPING`. `FREE_SHIPPING` zeroes shipping and marks reason `coupon_free_shipping`.
5. **Tax** — rate = `tax.overrides[country] ?? tax.ratePercent`. If `includedInPrice`, we **decompose** the tax out of the gross subtotal (no change to grand total). If not, we add it on top.
6. **Grand total** = `subtotal_after_discount + shipping`.

Return shape exposes `shippingReason` and `shippable` so the checkout client can show the right copy ("Free over €75", "We don't ship to …").

### 2.4 Addresses — `prisma/schema.prisma :: Address`

Separate `shippingAddressId` + `billingAddressId` on `Order`, both nullable, both linked to the same `Address` model with full fields (firstName/lastName/company/line1/line2/city/postcode/region/**country ISO-2**/phone). Billing-same-as-shipping is handled at checkout time by creating two rows (or pointing the FK at the same row).

---

## 3. Gaps

| # | Gap | Impact | Launch blocker? |
|---|-----|--------|------|
| G1 | No per-country shipping cost. NL and DE pay the same €5.95. | Either we over-charge NL or under-charge DE/FR. | **Maybe** — depends on Sofia's carrier contract. |
| G2 | No weight-based shipping despite `Product.weightGrams` already populated. | Heavy bundles (3× cleansers) ship at the same rate as a single serum. Margin risk. | No. |
| G3 | No B2B / VAT-ID checkout (reverse-charge). | B2B EU buyers pay VAT they shouldn't, then reclaim it later. Minor brand hit. | No. Sofia targets B2C. |
| G4 | No product-category VAT. The whole catalogue is charged at `ratePercent`. | Fine for cosmetics (standard rate everywhere). Would bite if we ever add food/supplements. | No. |
| G5 | No Sendcloud/PostNL/bpost integration — we quote a price, we don't print a label. | Manual fulfilment in the admin. | No. Fine at <50 orders/mo. |
| G6 | Disclaimer is a single-language string — stored in `Setting` table, not i18n'd. | Sofia has to re-edit it per locale, or rely on one neutral EN string. | No. Already noted in i18n backlog. |
| G7 | `FREE_SHIPPING` coupons + free-threshold are both checked — but there is no dedicated shipping tax (today shipping is treated as VAT-inclusive via the gross subtotal). For EU invoicing, shipping should carry its own VAT line. | Invoice format; ledger. | No — we don't issue PDF invoices yet. |

---

## 4. Recommended fixes (post-launch, ordered)

1. **G1 — per-country shipping table.** Extend `ShippingSettings` to
   ```ts
   rates: { [cc: string]: { flatCents: number; freeThresholdCents: number } }
   ```
   Fall back to the current single rate when a country has no entry. One migration, one admin screen change.
2. **G2 — weight-tiered rates.** Add `ShippingSettings.tiers: Array<{ maxGrams: number; flatCents: number }>`. Use `Sum(variant.weightGrams × qty)` from the cart. Ship zone × tier.
3. **G3 — VAT-ID field on checkout.** Add `Order.vatId: string?` and `Order.businessName: string?`. When `vatId` is set + destination is an EU country that is **not** Sofia's home country, zero out the VAT line and add "reverse-charge" copy to the invoice. Needs VIES validation (or skip validation at launch and flag suspect IDs for manual review).
4. **G7 — explicit `shippingTaxCents` on Order.** Stop folding shipping into the gross subtotal; tax shipping separately. Requires an order-model migration and a pricing-pipeline refactor.

None of these change the pricing **math** for the default Benelux buyer today.

---

## 5. Admin UI observations (post-audit nits)

- `/admin/settings/shipping` has no preview of "what does this look like for a €50 NL order vs a €80 FR order". A tiny 2-cart simulator would catch mis-edits.
- `allowedCountries` is a free-text CSV in the form. Switch to a multiselect of the full ISO list so Sofia can't mis-type `NLD` and silently break checkout.
- Tax overrides JSON has no "add row" UI — it's a raw JSON textarea. Migrate to a key/value repeater.

These are UX polish, not correctness issues.

---

## 6. Verdict

**Launch-safe for the Benelux flat-rate scenario Sofia asked for.** Ship the site as-is. When Sofia has real carrier pricing, tackle G1 + G2 in one migration.

The "missing" features (G3–G7) are not unusual to skip at v1 for a DTC beauty brand of this size.
