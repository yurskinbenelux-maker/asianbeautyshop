# Link + translation sweep

**Date:** 2026-04-23
**Command:** `node scripts/sweep-links-translations.mjs` (this file).

## Summary

- Files scanned: **367**
- `<Link>` + `<a>` internal hrefs found: **86**
- Broken internal links: **0**
- Translation calls found: **614**
- Missing translations (any locale): **0**
- Dynamic `t(`...`)` calls (skipped — need manual check): **17**

## 1. Broken internal links

_None._ Every `<Link href>` resolves to a real page segment.

## 2. Locale parity

EN is the source of truth. Other locales should have the same key set.

### nl.json

- Missing keys (present in EN, missing here): **0**
- Extra keys (present here, missing in EN): **0**

### fr.json

- Missing keys (present in EN, missing here): **0**
- Extra keys (present here, missing in EN): **0**

### ru.json

- Missing keys (present in EN, missing here): **0**
- Extra keys (present here, missing in EN): **0**

## 3. Missing translation keys (code → messages)

_None._ Every static `t("...")` resolves in every locale.

## 4. Dynamic translation keys (skipped by script)

These use template literals, so the script can't verify them statically. Check by hand.

- `src/app/[locale]/account/addresses/address-form.tsx` — `t(`address_error.${state.message}`
- `src/app/[locale]/account/orders/[number]/page.tsx` — `t(`order_status.${order.status}`
- `src/app/[locale]/account/orders/[number]/page.tsx` — `t(`order_payment_status.${order.paymentStatus}`
- `src/app/[locale]/account/orders/[number]/return/return-form.tsx` — `t(`form_field_err_${fieldErr}`
- `src/app/[locale]/account/orders/[number]/return/return-form.tsx` — `t(`reason.${r}`
- `src/app/[locale]/account/orders/[number]/return/return-form.tsx` — `t(`form_error.${state.errorCode}`
- `src/app/[locale]/account/orders/page.tsx` — `t(`order_status.${o.status as OrderStatusKey}`
- `src/app/[locale]/account/page.tsx` — `t(`order_status.${o.status as OrderStatusKey}`
- `src/app/[locale]/account/profile/profile-form.tsx` — `t(`field_error.${key}`
- `src/app/[locale]/account/profile/profile-form.tsx` — `t(`${tPrefix}.${state.message}`
- `src/app/[locale]/account/returns/[number]/page.tsx` — `t(`reason.${ret.reason}`
- `src/app/[locale]/checkout/checkout-client.tsx` — `t(`error.${topLevelError}`
- `src/components/account/return-status-pill.tsx` — `t(`status.${status}`
- `src/components/account/sidebar.tsx` — `t(`nav_${s.key}`
- `src/components/concierge/concierge-quiz.tsx` — `t(`quiz.${current.id}.question`
- `src/components/concierge/concierge-quiz.tsx` — `t(`quiz.${current.id}.options.${opt.id}`
- `src/components/shop/sort-select.tsx` — `t(`sort_${o}`

## 5. Orphaned keys (in messages, never referenced)

Rough heuristic — may include keys used via dynamic lookup.

151 keys present in `en.json` that this script did not see in the code.

<details><summary>List</summary>

- `brand.tagline`
- `hero.title_pre`
- `hero.title_kr`
- `hero.title_post`
- `hero.cta_primary`
- `hero.cta_secondary`
- `section.bestsellers`
- `section.bestsellers_lede`
- `section.ritual`
- `section.ritual_lede`
- `section.testimonials`
- `section.testimonials_lede`
- `section.testimonial_verified`
- `section.journal`
- `section.journal_lede`
- `section.journal_read_all`
- `section.journal_coming_soon`
- `section.newsletter_title`
- `section.newsletter_lede`
- `section.newsletter_cta`
- `section.newsletter_placeholder`
- `ritual.cleanse`
- `ritual.treat`
- `ritual.moisturise`
- `ritual.protect`
- `product.sold_out`
- `product.new`
- `product.bestseller`
- `product.description`
- `product.ingredients`
- `product.volume`
- `product.cart_coming_soon`
- `shop.sort_newest`
- `shop.sort_price_asc`
- `shop.sort_price_desc`
- `cart.added_toast`
- `cart.add_failed`
- `cart.added_inline`
- `checkout.error.VALIDATION_FAILED`
- `checkout.error.CART_EMPTY`
- `checkout.error.NO_CART`
- `checkout.error.COUNTRY_NOT_SHIPPABLE`
- `checkout.error.CHECKOUT_UNAVAILABLE`
- `checkout.error.PAYMENT_PROVIDER_ERROR`
- `checkout.error.UNKNOWN`
- `concierge.step_cleanse`
- `concierge.step_essence`
- `concierge.step_moisturise`
- `concierge.step_protect`
- `concierge.quiz.skinType.question`
- `concierge.quiz.skinType.options.dry`
- `concierge.quiz.skinType.options.oily`
- `concierge.quiz.skinType.options.combo`
- `concierge.quiz.skinType.options.sensitive`
- `concierge.quiz.skinType.options.normal`
- `concierge.quiz.concern.question`
- `concierge.quiz.concern.options.hydration`
- `concierge.quiz.concern.options.dullness`
- `concierge.quiz.concern.options.acne`
- `concierge.quiz.concern.options.ageing`
- `concierge.quiz.concern.options.sensitivity`
- `concierge.quiz.concern.options.darkSpots`
- `concierge.quiz.concern.options.pores`
- `concierge.quiz.sensitivity.question`
- `concierge.quiz.sensitivity.options.never`
- `concierge.quiz.sensitivity.options.sometimes`
- `concierge.quiz.sensitivity.options.often`
- `concierge.quiz.ritualDepth.question`
- `concierge.quiz.ritualDepth.options.minimal`
- `concierge.quiz.ritualDepth.options.balanced`
- `concierge.quiz.ritualDepth.options.complete`
- `concierge.quiz.budget.question`
- `concierge.quiz.budget.options.under_30`
- `concierge.quiz.budget.options.30_to_60`
- `concierge.quiz.budget.options.over_60`
- `concierge.quiz.budget.options.no_limit`
- `legal.last_updated`
- `legal.fallback_notice`
- `legal.nav.privacy`
- `legal.nav.terms`
- `legal.nav.cookies`
- `legal.nav.returns`
- `legal.nav.imprint`
- `auth.sign_in_generic_error`
- `auth.sign_up_generic_error`
- `auth.sign_up_email_taken`
- `auth.forgot_sending`
- `auth.error_invalid`
- `account.nav_overview`
- `account.nav_orders`
- `account.nav_returns`
- `account.nav_addresses`
- `account.nav_wishlist`
- `account.nav_profile`
- `account.nav_privacy`
- `account.order_payment_status.UNPAID`
- `account.order_payment_status.AUTHORIZED`
- `account.order_payment_status.PAID`
- `account.order_payment_status.FAILED`
- `account.order_payment_status.REFUNDED`
- … (+51 more)

</details>

## Notes

- Admin routes (`/admin/*`) are excluded from the 404 check because they don't sit under `[locale]`.
- API routes (`/api/*`) are excluded for the same reason.
- Dynamic hrefs (template literals with `${...}`) are normalised before matching — false positives/negatives are possible.