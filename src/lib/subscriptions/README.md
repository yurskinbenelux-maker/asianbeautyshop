# Subscribe & Save — Phase 1 (schema only)

Status: **schema staged, runtime deferred to Phase 2**.

## What's shipped here in Phase 1

- `ProductSubscription` model on `prisma/schema.prisma`
- `SubscriptionStatus` enum
- Inverse relations on `User`, `Product`, `ProductVariant`, `Order`
  (the `subscription_orders` named relation lets one subscription own
  many child orders, one per cycle)
- `Order.subscriptionId` linking orders back to their parent sub

The data model captures everything we need: customer + product + variant
+ cadence + Mollie mandate id + run schedule + failure tracking.

## Phase 2 work (next session)

Each piece below needs an editable session — Mollie's recurring flow
has a few moving parts and verifying with a test payment is essential.

### 1. Mollie recurring integration (~2 hrs)

- `src/lib/subscriptions/mollie.ts`
  - `createRecurringFirstPayment({ userId, productId, variantId, cadenceDays })`
    - Find or create Mollie customer
    - Create a "first payment" payment with `sequenceType: 'first'`
    - Returns checkoutUrl for the customer to complete
  - `chargeRecurringCycle({ subscriptionId })`
    - Pull the cached mandate, create a payment with
      `sequenceType: 'recurring'`, `customerId`, `mandateId`
    - Mark consecutiveFailures + lastFailureAt on Mollie failure
- Mollie webhook (`/api/webhooks/mollie`) needs to recognise
  subscription payments and:
  - On first payment paid → flip subscription to ACTIVE, store mandateId
  - On recurring payment paid → mint a child Order, decrement stock
  - On payment failed → bump consecutiveFailures, after 3 → flip to
    PAYMENT_FAILED + email customer

### 2. Customer signup UX on the PDP (~1.5 hrs)

- New `<SubscribeAndSave>` block under the price on PDP
  - Two radios: "One-time" / "Subscribe & Save 10%"
  - When "Subscribe" picked, show cadence selector (30 / 60 / 90 days)
  - On add-to-cart (or a separate "Start subscription" CTA):
    - Calls `createRecurringFirstPayment(...)`
    - Redirects to Mollie's first-payment checkout
- Translation keys: `subscribe.label`, `subscribe.cadence_30`, etc. × 4 locales

### 3. Customer self-service (~1 hr)

- `/account/subscriptions` page
  - List all the user's subs: product, cadence, next run, status, past 6 cycles
  - Pause / Resume / Cancel actions (server actions)
  - "Skip next cycle" button (push nextRunAt by one cadence)
  - "Change cadence" inline picker

### 4. Daily cron (~30 min)

- `/api/cron/subscriptions`
  - Find subs where `status=ACTIVE AND nextRunAt <= now()`
  - For each: chargeRecurringCycle, on success bump nextRunAt by cadenceDays
  - Bounded batch (50)

### 5. Admin dashboard panel (~30 min)

- `/admin/subscriptions` — list with filters (status, cadence)
- Aggregate stats on `/admin` dashboard:
  active subs, MRR, churn rate

### 6. Email templates (~30 min)

- "Welcome to your subscription"
- "Next shipment in 3 days" (lead-up reminder, optional)
- "Payment failed — please update card" (when consecutiveFailures hits 1)
- "We've cancelled your subscription due to repeated payment failures"
  (after 3 failures)

## Total Phase 2 estimate

~6 hours of focused work, best done in a single session so the Mollie
test flow can be exercised end-to-end before shipping.
