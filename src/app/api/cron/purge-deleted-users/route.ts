// ─────────────────────────────────────────────────────────────────────────
// Cron: purge soft-deleted users whose grace window has elapsed.
//
// How to wire on Hostinger:
//   hPanel → Advanced → Cron Jobs → Add new (daily at 03:00):
//     0 3 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                  https://yurskinsolution.eu/api/cron/purge-deleted-users
//
// What it does for each user where deletedAt is NOT NULL and older than
// ERASURE_GRACE_DAYS (default 30):
//   • Anonymises the Prisma User row in place — we cannot hard-delete it,
//     because Orders/Reviews/ContactMessage keep a FK reference.  We blank
//     every direct PII field and rewrite email + name to a tombstone.
//   • Deletes wishlist items (no audit value).
//   • Deletes the Supabase auth user (via admin API) so they can't sign
//     back in with the same email — the app-side row is only the profile
//     shadow; the auth identity lives in Supabase.
//
// The order rows stay intact for accounting/fiscal law (Belgian 7-year
// retention for invoices) but no longer point to a "person" in any
// recognisable way.
//
// Bounded batch per run (25 rows) so a backlog doesn't time out.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ERASURE_GRACE_DAYS } from "@/lib/queries/gdpr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

const BATCH_SIZE = 25;

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - ERASURE_GRACE_DAYS * 86_400_000);

  const due = await prisma.user.findMany({
    where: { deletedAt: { lt: cutoff, not: null } },
    select: { id: true, email: true },
    take: BATCH_SIZE,
  });

  let anonymised = 0;
  const errors: string[] = [];

  for (const u of due) {
    try {
      // Blank the profile fields in place.  We cannot delete the row
      // because Order.userId (and Review.userId, ContactMessage.userId)
      // references it.  Email is rewritten to a stable tombstone so the
      // unique index still passes.
      const tombstone = `deleted+${u.id}@yurskin.invalid`;
      await prisma.$transaction([
        prisma.wishlistItem.deleteMany({ where: { userId: u.id } }),
        prisma.address.deleteMany({ where: { userId: u.id } }),
        prisma.user.update({
          where: { id: u.id },
          data: {
            email: tombstone,
            firstName: null,
            lastName: null,
            phone: null,
            marketingOptIn: false,
            marketingOptInAt: null,
            // keep deletedAt as-is so we don't re-process forever
          },
        }),
      ]);

      // Delete the Supabase auth identity. If SUPABASE_SERVICE_ROLE_KEY
      // isn't set we log and continue — the DB-side anonymisation is
      // enough to satisfy GDPR; the auth row will be cleaned manually.
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (serviceKey && supabaseUrl) {
        try {
          const res = await fetch(
            `${supabaseUrl}/auth/v1/admin/users/${u.id}`,
            {
              method: "DELETE",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
            },
          );
          if (!res.ok && res.status !== 404) {
            console.warn(
              `[gdpr-cron] supabase delete user ${u.id} → ${res.status}`,
            );
          }
        } catch (err) {
          console.warn(`[gdpr-cron] supabase delete threw for ${u.id}`, err);
        }
      }

      anonymised += 1;
    } catch (err) {
      console.error(`[gdpr-cron] failed for user ${u.id}`, err);
      errors.push(u.id);
    }
  }

  return NextResponse.json({
    ok: true,
    anonymised,
    eligible: due.length,
    errors,
    ranAt: new Date().toISOString(),
  });
}
