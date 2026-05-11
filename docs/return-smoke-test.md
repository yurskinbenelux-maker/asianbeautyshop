# Return / refund smoke test

Five scenarios that exercise the full RMA pipeline end-to-end on
asianbeautyshop.eu. Run these against a real test order placed with
your own card so Mollie actually fires a refund — Stripe test cards
won't surface the Mollie-specific paths.

Each scenario lists the **artefacts to verify** so you can tick them off
as you go. The artefacts cover the four customer-visible surfaces
(order page, return tracking page, return-received email, credit note
PDF), the four admin-visible surfaces (returns list, return detail,
audit log, VAT YTD widget), and the three financial-record surfaces
(Mollie dashboard, inventory movements, A-Beauty Club balance).

Scenarios 1–3 are the original H5 happy / partial / rejected cases.
Scenarios 4–5 are new and specifically exercise the 2026-05 refund
redesign (per-item adjudication, gift-card hardening, per-line
credit-note breakdown, accept/reject email layout).

---

## Pre-flight

Same setup for every scenario:

1. Sign in to admin as yourself
2. Place a real Mollie order with your own card — see each scenario for
   the line composition
3. Wait for the order to land at `PAID` (webhook fires) → `FULFILLING`
4. (Scenarios with parcel returns) Optionally walk it through SHIPPED
   → DELIVERED via Sendcloud panel or admin status flips
5. As the customer, open `/account/orders/[number]/return`

The pipeline is the same regardless of whether you let Sendcloud
deliver "for real" — the admin can flip status manually.

---

## Scenario 1 — Happy path, full refund

**Setup.** One-line standard order, EUR 39.95.

**Steps.**

1. As customer, submit return for the full quantity
2. As admin on `/admin/returns/[id]`, click Approve
3. Flip to RECEIVED with the default adjudication (single line, accept
   at line total) and submit Step 2 "Mark received & refund"

**Verify.**

- Mollie dashboard: refund `re_xxxx` for EUR 39.95
- Order page: status RECEIVED, refund banner shown
- Customer return tracking page: timeline reaches "Refund issued"
- Customer email "Your return has arrived":
  - Lede reads ledeAllAccepted ("Everything is in order")
  - Refunding section lists the product + EUR 39.95
  - No "Not refunded" section
  - Total refund callout shows EUR 39.95
- Credit note PDF:
  - One line, EUR 39.95 inc. VAT, 21% column populated
  - Totals: subtotal excl. VAT + VAT total = grand total EUR 39.95
  - Sum of line totals matches grand total exactly
- Admin VAT YTD widget: cross-border total decreased by line subtotal
  excl. VAT
- Inventory movement log: +1 of the SKU with reason "return.received"
- A-Beauty Club balance: clawback recorded if order accrued points

---

## Scenario 2 — Partial refund (one line of three rejected)

**Setup.** Three-line standard order — 3 different products, e.g.
EUR 32 + EUR 25 + EUR 18 = EUR 75.

**Steps.**

1. As customer, return all three lines
2. As admin on `/admin/returns/[id]`:
   - Line 1 (EUR 32) — Accept at full
   - Line 2 (EUR 25) — Accept at EUR 20 (mark down to reflect minor wear)
   - Line 3 (EUR 18) — Reject with reason "Opened and used"
3. Click Save adjudication. Verify the running total at bottom of the
   form shows EUR 52.00
4. Click "Mark received & refund"

**Verify.**

- Mollie dashboard: refund `re_xxxx` for EUR 52.00
- Customer email:
  - Lede reads ledeMixed ("We're refunding most of what you sent")
  - Refunding section: Line 1 EUR 32 + Line 2 EUR 20
  - Not refunded section: Line 3 + reason text "Opened and used"
    visible in italic vermilion
  - Total refund callout: EUR 52.00
- Credit note PDF:
  - Two lines only (Line 3 absent)
  - Line 1 at EUR 32, Line 2 at EUR 20, VAT 21% on both
  - Grand total EUR 52.00, lines sum to EUR 52.00
- VAT YTD: decreased by (52 / 1.21) = EUR 42.98 ex VAT
- Inventory: +1 for Line 1, +1 for Line 2, ZERO for Line 3 (rejected
  lines don't replenish stock)
- A-Beauty Club: clawback proportional to EUR 52, not EUR 75

---

## Scenario 3 — All-rejected return

**Setup.** One-line standard order, EUR 28.

**Steps.**

1. As customer, return the line
2. As admin, on the adjudication form click Reject, pick reason
   "Item missing from parcel"
3. Try to click "Mark received & refund" — confirm the button is
   disabled when total = EUR 0 (Step 1 hard gate from H1 still applies)
4. Instead, transition the return to REJECTED via the "Other actions"
   section, typing the same reason in admin notes

**Verify.**

- No Mollie refund fires
- No credit note created
- Customer gets the REJECTED email (not return-received), with
  admin-notes reason visible
- Order page: status flips to REJECTED, no refund banner
- Inventory: no movement (parcel never marked received)
- VAT YTD: unchanged
- Audit log: kind = `return.transition` to REJECTED, actor = your
  admin user

---

## Scenario 4 — Mixed cart with gift card (Step 2 + Step 4 hardening)

This scenario specifically catches the test #3 bug class — proportional
split applying 21% VAT to a gift card line that should be out-of-scope.

**Setup.** Two-line order:
- 1× standard skincare item, EUR 45
- 1× gift card EUR 50 face value

Place the order, pay with Mollie. After webhook lands, the gift card
is issued and emailed to you.

**Steps.**

1. As customer, open `/account/orders/[number]/return`
2. **Verify the gift card line is NOT in the form** (Step 2). Only the
   skincare item should be selectable
3. Submit return for the skincare line
4. As admin, open the return. The adjudication form should show one
   row only — the skincare item. If you somehow have a return that
   contains a gift card row (e.g. legacy data), verify it renders
   with the Lock icon, "Non-refundable" badge, disabled inputs, and
   the reason locked to "Non-refundable gift card"
5. Accept the skincare line at full EUR 45, click "Mark received &
   refund"

**Verify.**

- Mollie refund for EUR 45.00 only — never EUR 95 or any proportional
  split that includes the gift card
- Customer email:
  - Refunding section: skincare item EUR 45.00 only
  - Total refund EUR 45.00
  - Gift card never mentioned (it's not in the return)
- Credit note PDF:
  - One line: skincare item EUR 45.00
  - VAT 21% applied to that one line
  - Grand total EUR 45.00
  - **No gift card line anywhere** — and therefore no "VAT 21% on a
    gift card" bug

**Bonus negative check (optional).** If you're comfortable in DevTools
or curl, hand-craft a POST to the adjudication action that tries to
Accept the gift card at EUR 50. The server should silently coerce it
back to EUR 0 + "Non-refundable gift card" reason. The Mollie refund
should still be EUR 45.00.

---

## Scenario 5 — Total consistency, last-line rounding (Step 5)

This scenario catches the kind of rounding mismatch that would show
up as a "doesn't add up" credit note.

**Setup.** Three-line order with awkward prices that don't divide
cleanly: EUR 13.33 + EUR 17.99 + EUR 9.95 = EUR 41.27.

**Steps.**

1. As customer, return all three lines
2. As admin, Accept all three at full line total
3. "Mark received & refund"

**Verify.**

- Mollie refund: EUR 41.27 exactly
- Credit note PDF — this is the key check:
  - Three lines with the EUR values above
  - Sum of "Line total" column = EUR 41.27 exactly (last-line delta
    absorbs any sub-cent rounding)
  - Totals block: subtotal excl. VAT + VAT total = grand total EUR 41.27
    exactly
- Customer email Total refund: EUR 41.27
- All four numbers — Mollie, CN grand total, sum of CN lines, email
  total — match to the cent

**Variant: legacy return (optional).** If you have any returns in the
DB from before Step 1 (acceptedRefundEur is null on every line), open
one in the admin and click "Mark received & refund" without touching
the adjudication form. The pipeline should treat null as "accept at
line total" and produce a working CN. Useful only if you have a
pre-2026-05 return to test against.

---

## Cross-cutting checks (run once across all scenarios)

After running all five, verify the cross-scenario state:

- `/admin/audit-log` shows one `return.adjudicate` entry per scenario
  where the adjudication form was saved, and one `return.transition`
  per status flip
- `/admin/returns` list shows the right status badge for each return
- `/admin/credit-notes` shows the three CNs (Scenarios 1, 2, 5) — none
  for Scenario 3 (rejected) or any all-rejected variant
- The CN-2026-NNNNN sequence is gap-free (Belgian Code TVA Art.
  53octies requirement)
- Resend dashboard shows the return-received emails with tag
  `type=return_received` and matching order numbers
- `/admin` dashboard cross-border tracker and last-30d revenue
  ledger both decreased by the correct amount

If everything ticks, the refund pipeline is launch-ready.
