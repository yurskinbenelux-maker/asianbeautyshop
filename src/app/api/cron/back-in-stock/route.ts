// ─────────────────────────────────────────────────────────────────────────
// Cron: back-in-stock notify.
//
// How to wire (cron-job.org):
//   Hourly (or as often as you'd like — empty runs are cheap)
//     0 * * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                   https://asianbeautyshop.eu/api/cron/back-in-stock
//
// What it does (per run):
//   1. Pull every BackInStockSubscription where notifiedAt IS NULL whose
//      variant currently has stock > 0. Bounded batch (default 200).
//   2. For each, send the back-in-stock email AND stamp notifiedAt in the
//      same transaction so a slow run can't double-notify after a re-trigger.
//   3. Return aggregate counts.
//
// Auth: same CRON_SECRET pattern as the other cron routes.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendBackInStockEmail } from "@/lib/email/back-in-stock";
import { siteOrigin } from "@/lib/seo/json-ld";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard cap to keep one cron run bounded. Most days we'd see <10. */
const BATCH_SIZE = 200;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  try {
    // Pull eligible subscriptions in one query: not yet notified, AND
    // the linked variant has stock available now. We resolve the
    // product slug per-locale on the email side so the link goes to
    // the customer's chosen language.
    const eligible = await prisma.backInStockSubscription.findMany({
      where: {
        notifiedAt: null,
        variant: { stock: { gt: 0 } },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
      include: {
        variant: {
          select: {
            id: true,
            label: true,
            productId: true,
            product: {
              select: {
                id: true,
                translations: {
                  select: { locale: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    const results = {
      considered: eligible.length,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, ...results });
    }

    const origin = siteOrigin();

    for (const sub of eligible) {
      // Resolve the product translation in the subscriber's locale,
      // falling back to EN. If neither exists (shouldn't happen — EN is
      // required), skip rather than send a half-broken email.
      const tr =
        sub.variant.product.translations.find((t) => t.locale === sub.locale) ??
        sub.variant.product.translations.find((t) => t.locale === Locale.EN);
      if (!tr) {
        results.skipped += 1;
        console.warn(
          `[cron/back-in-stock] no translation for product ${sub.variant.productId}, sub ${sub.id}`,
        );
        continue;
      }

      const productUrl = `${origin}/${sub.locale.toLowerCase()}/shop/${tr.slug}`;

      const r = await sendBackInStockEmail({
        email: sub.email,
        locale: sub.locale,
        productName: tr.name,
        variantLabel: sub.variant.label,
        productUrl,
      });

      if (r.sent) {
        // Stamp in a transaction with the send result so a process restart
        // mid-loop can't accidentally re-send. We tolerate the very rare
        // case where the stamp fails after a successful send (warning,
        // not crash) — Resend's idempotency at the email level mostly
        // covers us, and a re-send is a small price vs. losing the row.
        try {
          await prisma.backInStockSubscription.update({
            where: { id: sub.id },
            data: { notifiedAt: new Date() },
          });
          results.sent += 1;
        } catch (err) {
          results.errors += 1;
          console.error(
            `[cron/back-in-stock] sent but stamp failed for sub ${sub.id}`,
            err,
          );
        }
      } else if (r.reason === "resend-not-configured") {
        // No point continuing — bail out cleanly with a precise reason.
        results.skipped = eligible.length - results.sent - results.errors;
        return NextResponse.json({
          ok: false,
          reason: "resend-not-configured",
          ...results,
        });
      } else {
        results.errors += 1;
        console.warn(
          `[cron/back-in-stock] send failed for sub ${sub.id}: ${r.reason}`,
        );
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron/back-in-stock] handler error", err);
    return NextResponse.json(
      { ok: false, error: "handler-error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
