# A-Beauty Club — Phase A (schema + accrual + reminders)

**Shipped in this PR.** Read this before merging — you'll need to run a
migration and configure two new cron schedules.

## What's live after deploy

- All paid orders earn points: `LoyaltySettings.pointsPerEur × subtotal`
  (default 5 pts / €1). Hooked into the Mollie sync's PAID transition.
- Every Nth paid order awards a milestone bonus (default: 5 orders → 250
  pts). Tweakable per `LoyaltySettings.milestoneOrders`/`milestonePoints`.
- Daily birthday cron awards `birthdayPoints` (default 150) to anyone
  whose DoB matches today. Independent sentinel from the existing
  birthday-EMAIL cron — both can run side by side.
- Daily coupon-expiry-reminder cron sends a localised "your code expires
  in N days" email for any user-bound coupon flagged
  `sendExpiryReminder=true`. N is `LoyaltySettings.couponExpiryReminderDays`
  (default 7). Idempotent via `Coupon.reminderSentAt`.
- `LoyaltyAccount` auto-creates on signup with a unique referral code
  shaped `FIRSTNAME-AB12`. Healing path also runs on every authenticated
  request — anyone who signed up before this PR gets one on next login.

## What's NOT live yet (later phases)

- Customer-facing drawer UI (Phase B)
- Admin CRUD pages (Phase C)
- Customer redeem flow (Phase D)
- Manual-task submission + admin review (Phase E)
- Referral cookie capture, signup form referral input, second-coupon
  minting (Phase F) — the schema + auto-create exist but no UI yet
- Tier badges + transactional emails for points-earned / tier-upgraded
  (Phase G)

## Deploy steps

### 1. Run the migration

The schema added: `LoyaltySettings`, `LoyaltyTier`, `LoyaltyTask`,
`LoyaltyTaskClaim`, `LoyaltyReward` — plus enum extensions on
`LoyaltyEventKind`, new fields on `User` (`lastBirthdayLoyaltyYear`),
new fields on `Coupon` (`userId`, `sendExpiryReminder`,
`reminderSentAt`), and new optional FKs on `LoyaltyEvent`
(`taskClaimId`, `rewardId`, `referralId`).

```bash
pnpm prisma db push
```

Use `db push` (not `migrate dev`) since previous migrations have drift —
same approach we used for the quiz reward feature.

### 2. Add cron schedules on cron-job.org

Two new endpoints. Both auth via `Authorization: Bearer $CRON_SECRET`
(same secret as the existing crons).

| Path                                       | Schedule (Brussels) | Cron expression |
|-------------------------------------------|---------------------|-----------------|
| `/api/cron/loyalty-birthday`              | Daily at 00:15      | `15 0 * * *`    |
| `/api/cron/coupon-expiry-reminder`        | Daily at 09:00      | `0 9 * * *`     |

The birthday cron offsets 10 minutes after the existing `/api/cron/birthday`
(00:05) so the email always lands before the points show up — feels
right to the customer.

### 3. (Optional) Verify the singleton settings row exists

The first request that touches `getLoyaltySettings()` lazily creates the
singleton row with defaults. To pre-warm it before the first customer
hits anything loyalty-related:

```bash
curl -s 'https://asianbeautyshop.eu/api/cron/loyalty-birthday' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Even if no birthdays match, the cron's `isLoyaltyProgramActive()` check
calls `getLoyaltySettings()` which seeds the row. After this, an admin can
edit values via `/admin/loyalty/settings` (Phase C).

## Sentry notes

`accrueOrderPoints`, `accrueMilestone`, and `accrueBirthday` all
swallow their errors back to the caller and `console.error()` rather
than throw. This is deliberate — a loyalty failure must NEVER roll back
a real-money payment or break a sign-up. If something starts failing
silently, watch for `[sync-mollie] loyalty accrual failed` in logs.
