# Admin role granularity

**Date:** 2026-04-23
**Status:** Scaffolding landed (layout guard, sidebar filtering, page gates on sensitive sections).
**Still to do:** gate the remaining write-actions (see §4). Left undone to keep the overnight change-set small.

---

## Why

Up to now the admin was a single club: an email was either on
`ADMIN_ALLOWED_EMAILS` or it wasn't. Once Sofia starts working with a VA
or a freelance copywriter, she'll want to hand out narrower keys — a
copywriter should never see the customer export, and a fulfilment
helper should never be able to change the VAT rate.

---

## Three roles

```
OWNER       full access                 env: ADMIN_ALLOWED_EMAILS
EDITOR      content work                env: EDITOR_ALLOWED_EMAILS
FULFILMENT  operations work             env: FULFILMENT_ALLOWED_EMAILS
```

A user in multiple lists gets the highest privilege (OWNER > EDITOR >
FULFILMENT). The DB `Role` enum is unchanged — role is purely
allow-list-derived.

### Capability matrix (short form)

```
                         OWNER   EDITOR   FULFILMENT
products.view              ✓       ✓         ✓
products.edit              ✓       ✓         —
products.delete            ✓       —         —
categories.edit            ✓       ✓         —
banners.edit               ✓       ✓         —
journal.edit               ✓       ✓         —
pages.edit                 ✓       ✓         —
homepage.edit              ✓       ✓         —
testimonials.edit          ✓       ✓         —
media.edit                 ✓       ✓         —
reviews.moderate           ✓       ✓         —
orders.view                ✓       ✓ ¹       ✓
orders.edit                ✓       —         ✓
orders.export              ✓       —         ✓
returns.view               ✓       ✓ ¹       ✓
returns.edit               ✓       —         ✓
contact.view               ✓       ✓ ¹       ✓
contact.reply              ✓       —         ✓
inventory.adjust           ✓       ✓         ✓
customers.view             ✓       —         ✓
customers.export           ✓       —         —
customers.edit             ✓       —         —
settings.view              ✓       —         —
settings.edit              ✓       —         —
coupons.edit               ✓       —         —
emails.send                ✓       —         —
redirects.edit             ✓       —         —
audit.view                 ✓       —         —
```

¹ Editors get read-only access so they can check copy against real
order/returns/contact data. Financial actions stay owner/fulfilment.

See `src/lib/auth-roles.ts` for the canonical matrix.

---

## How to use

### New pages — gate at the top

```ts
import { requireCapability } from "@/lib/auth-roles";

export default async function Page() {
  await requireCapability("settings.view");
  // …
}
```

Returns `{ user, role }` if allowed; redirects to `/no-access` otherwise.

### Layouts that cover many pages

Prefer gating at the layout level when every child page shares a
capability (we do this for `/admin/settings/*`).

### UI filtering (no guard, just hiding)

```tsx
import { hasCapability } from "@/lib/auth-roles";

{hasCapability(role, "customers.export") && (
  <Link href="/admin/customers/export">Export CSV</Link>
)}
```

### Env var setup

```
ADMIN_ALLOWED_EMAILS=sofia@yurskin.eu,maxim.sahnevich@gmail.com
EDITOR_ALLOWED_EMAILS=freelancer-copy@example.com
FULFILMENT_ALLOWED_EMAILS=va-shipping@example.com
```

Missing env vars just mean empty lists — existing behaviour (allow-list
only has owners) is preserved.

---

## What is wired as of this change

- `src/lib/auth-roles.ts` — new: role resolution + capability matrix + guards.
- `src/app/admin/layout.tsx` — switched to `requireAdminWithRole`, passes role to sidebar.
- `src/components/admin/sidebar.tsx` — nav filtered per role; shows a role pill next to the signed-in email.
- `src/app/no-access/page.tsx` — updated copy so editors/fulfilment see their resolved role and a "back to admin" link (not just a dead end).
- Page-level capability gates added to:
  - `/admin/settings/*` (layout → `settings.view`)
  - `/admin/customers` → `customers.view`
  - `/admin/customers/export` → `customers.export`
  - `/admin/audit` → `audit.view`
  - `/admin/redirects` → `redirects.edit`
  - `/admin/coupons` → `coupons.edit`
  - `/admin/emails` → `emails.send`

---

## 4. Still to do (Sofia's next pass)

These already have the matrix entries — they just need a
`requireCapability(...)` added at the top of each handler.

| Area | Pages / routes | Cap to enforce |
|---|---|---|
| Orders write-actions | `src/app/admin/orders/actions.ts` (status, refund, cancel) | `orders.edit` |
| Orders export | `src/app/admin/orders/export/route.ts` | `orders.export` |
| Returns write-actions | `src/app/admin/returns/[id]/actions.ts` | `returns.edit` |
| Contact replies | `src/app/admin/contact/actions.ts` | `contact.reply` |
| Product delete | `src/app/admin/products/actions.ts` (delete) | `products.delete` |
| Customers edit | `src/app/admin/customers/actions.ts` | `customers.edit` |

Server-action guards are low-risk to add — each is one line. Doing them
in a separate pass keeps this overnight change-set easier to review.

---

## Why allow-list instead of DB-level roles

- Sofia never has to think about a "user management UI".
- Role grants are auditable via git/Hostinger env-var history.
- No migration needed.
- Matches how the existing `ADMIN_ALLOWED_EMAILS` already works — we're
  just extending the pattern.

If YU.R ever grows to >10 admins, we migrate the allow-lists into a DB
table with an admin screen. For 2-4 people, env-vars are the right tool.
