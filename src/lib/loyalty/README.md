# Loyalty + Referrals — Phase 1 (schema only)

Status: **schema staged, runtime deferred to Phase 2**.

## What's shipped here in Phase 1

- `LoyaltyAccount` model — one per User, holds balance + lifetime + referralCode
- `LoyaltyEvent` model — append-only log of every accrual / redemption
- `LoyaltyEventKind` enum (EARNED_ORDER / REDEEMED_COUPON / ADJUSTED_ADMIN / REFERRAL_BONUS / EXPIRED)
- `Referral` model — tracks the referrer ⇄ referee relationship
- `ReferralStatus` enum (PENDING / REWARDED / CANCELLED)
- Inverse relation `User.loyaltyAccount`

## Phase 2 work

### 1. Accrual on paid orders (~1 hr)

- Hook into `place-order.ts` payment-success path
- For each PAID order: append `LoyaltyEvent(EARNED_ORDER, +1 per €1)` and bump `LoyaltyAccount.pointsBalance` + `pointsLifetime`
- Skip when the order itself was paid for entirely with loyalty points (no points-on-points loop)
- Order-cancelled / refunded path: append a negative `EARNED_ORDER` to claw back

### 2. Redemption — customer dashboard (~2 hrs)

- `/account/loyalty` page
  - Current balance + lifetime + tier ladder
  - "Redeem points → coupon" form: pick from 100/250/500-point tiers minting €5/€15/€35 codes
  - Submit creates a `Coupon` (kind: FIXED, single-use, 60-day expiry) and a `LoyaltyEvent(REDEEMED_COUPON, -100)`
  - History table from LoyaltyEvent

### 3. Referral flow (~2 hrs)

- Auto-create LoyaltyAccount + referralCode when a User signs up (or on first order for guests upgrading)
- Customer dashboard: "Share your code" block with copy-link CTA
  - Link: `https://asianbeautyshop.eu/?ref=SOFIA-K4M7`
- Landing page picks up `?ref=` query → sets cookie + (later) auto-fills the coupon code at checkout
- At checkout: if the cookie's referralCode resolves to a real account AND the customer is new (no prior orders), apply 10% off + create `Referral(PENDING, refereeEmail)` row
- On Mollie PAID for a referral order: flip Referral to REWARDED + mint the referrer's bonus coupon + email them

### 4. Admin oversight (~30 min)

- `/admin/loyalty` — list accounts sorted by lifetime points
- Adjust-points modal (positive or negative) — writes ADJUSTED_ADMIN event with admin reason
- Referrals list — filter by status

### 5. Email templates (~30 min)

- "Your referral worked! Here's your reward" — fires on Referral REWARDED
- "Welcome — you've earned X points" — fires on first EARNED_ORDER
- (optional) Annual "Your points expire in 30 days" warning

## Total Phase 2 estimate

~6 hours of focused work. Best done in a single session so the
referral cookie → checkout → reward chain can be exercised end-to-end.
