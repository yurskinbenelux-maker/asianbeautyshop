// ─────────────────────────────────────────────────────────────────────────
// Quiz claim server action — the "Add my ritual to cart" button on the
// /[locale]/quiz/result page funnels here.
//
// Does four things atomically (or as close as we can get):
//   1. requireSignedInUser — if the visitor is logged out, returns a
//      redirect URL that points at sign-up with the next= param so they
//      come back here after registration.
//   2. recordQuizCompletion — idempotently upserts the QuizCompletion
//      row, mints the deterministic 15% coupon, rotates the cart-restore
//      token. Skips email send if the user has already redeemed.
//   3. loadQuizRitualIntoCart — replaces the current cart with the
//      recommended products, each line carrying the `quiz_reward`
//      per-line discount marker.
//   4. sendQuizRitualReadyEmail — fire-and-forget so the user can
//      always come back later via the email link.
//
// Returns a tagged result so the client component can pick the right
// next step (redirect to /sign-up or to /cart).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  recordQuizCompletion,
  QUIZ_REWARD_PERCENT,
} from "@/lib/quiz/reward";
import { loadQuizRitualIntoCart } from "@/lib/cart/quiz-ritual";
import { sendQuizRitualReadyEmail } from "@/lib/email/quiz-ritual-ready";

export type ClaimQuizRitualInput = {
  productIds: string[];
  locale: string; // url locale "en" | "nl" | "fr" | "ru"
};

export type ClaimQuizRitualResult =
  | {
      ok: true;
      added: number;
      /** "Add my ritual" client redirects here after a successful claim. */
      redirectTo: string;
    }
  | {
      ok: false;
      reason: "not-signed-in";
      /** Where the client should redirect to start the auth flow. */
      redirectTo: string;
    }
  | { ok: false; reason: "no-products" | "internal" };

export async function claimQuizRitualAction(
  input: ClaimQuizRitualInput,
): Promise<ClaimQuizRitualResult> {
  if (!input.productIds || input.productIds.length === 0) {
    return { ok: false, reason: "no-products" };
  }

  const locale = toPrismaLocale(input.locale);
  const localePrefix = input.locale.toLowerCase();

  const user = await getCurrentUser();
  if (!user) {
    // Logged out — bounce to sign-up with a return URL that comes back
    // here. We URL-encode the product IDs in the next param so the
    // post-auth flow knows what to add. Capped at 6 IDs to keep the URL
    // sensible and to match the max ritual length.
    const ids = input.productIds.slice(0, 6).join(",");
    const next = encodeURIComponent(
      `/${localePrefix}/quiz/result?ritual=${ids}`,
    );
    return {
      ok: false,
      reason: "not-signed-in",
      redirectTo: `/${localePrefix}/sign-up?next=${next}`,
    };
  }

  // Soft-log fields for the per-IP/UA fraud signal.
  const hdrs = await headers();
  const userAgent = hdrs.get("user-agent");
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip");

  let completion;
  try {
    completion = await recordQuizCompletion({
      userId: user.id,
      recommendedProductIds: input.productIds,
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
    });
  } catch (err) {
    console.error("[quiz/claim] recordQuizCompletion failed", err);
    return { ok: false, reason: "internal" };
  }

  // Already redeemed → don't add the discount lines (the coupon would
  // be denied anyway when they checkout). Add at full price by silently
  // falling through to a regular add — easier to explain to the customer
  // than a hard error.
  if (completion.alreadyRedeemed) {
    return {
      ok: true,
      added: 0,
      redirectTo: `/${localePrefix}/quiz/result?already=1`,
    };
  }

  try {
    const result = await loadQuizRitualIntoCart({
      productIds: input.productIds,
      locale,
    });

    // Email is fire-and-forget — never blocks the cart load. We pull a
    // light item list from the cart so the email can show what was
    // queued, with the same locale-aware names the customer just saw.
    // user.email is technically optional on the User type (Supabase can
    // create users without one) — fall through if missing rather than
    // crash. The popup CTA requires email-based signup so this branch
    // is essentially never hit in practice.
    if (completion.cartLinkToken && user.email) {
      void sendCompletionEmail({
        email: user.email,
        productIds: input.productIds,
        cartLinkToken: completion.cartLinkToken,
        expiresAt: completion.expiresAt,
        locale,
      });
    }

    revalidatePath(`/${localePrefix}/cart`);
    return {
      ok: true,
      added: result.added,
      redirectTo: `/${localePrefix}/cart?ritual=quiz`,
    };
  } catch (err) {
    console.error("[quiz/claim] loadQuizRitualIntoCart failed", err);
    return { ok: false, reason: "internal" };
  }
}

// ────────── helpers ─────────────────────────────────────────────────────

function toPrismaLocale(s: string): Locale {
  switch (s.toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}

async function sendCompletionEmail(args: {
  email: string;
  productIds: string[];
  cartLinkToken: string;
  expiresAt: Date;
  locale: Locale;
}): Promise<void> {
  try {
    // Pull lightweight item info for the email body. Same locale resolution
    // as the cart, so RU customers see Cyrillic display names if available.
    const products = await prisma.product.findMany({
      where: { id: { in: args.productIds } },
      select: {
        id: true,
        price: true,
        translations: {
          where: { locale: args.locale },
          select: { name: true },
          take: 1,
        },
      },
    });
    const items = args.productIds
      .map((id) => products.find((p) => p.id === id))
      .filter(<T,>(p: T | undefined): p is T => p !== undefined)
      .map((p) => ({
        name: (p.translations[0]?.name ?? "Skincare item") as string,
        priceEur: Number(p.price),
      }));
    const expiresOn = args.expiresAt.toISOString().slice(0, 10);

    await sendQuizRitualReadyEmail({
      email: args.email,
      cartLinkToken: args.cartLinkToken,
      items,
      expiresOn,
      percentOff: QUIZ_REWARD_PERCENT,
    });
  } catch (err) {
    console.error("[quiz/claim] email send failed", err);
  }
}
