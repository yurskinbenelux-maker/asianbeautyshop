// ─────────────────────────────────────────────────────────────────────────
// GDPR — subject-access-request + erasure helpers.
//
// Two responsibilities:
//
//   1. buildUserDataArchive(userId)  — Article 15: assembles a JSON blob of
//      everything we hold on a given user.  Used by the account/privacy
//      page to give customers a copy of their data on demand.
//
//   2. scheduleAccountDeletion / cancelAccountDeletion  — Article 17:
//      flips User.deletedAt on and off.  A nightly cron purges users that
//      have been soft-deleted for >= ERASURE_GRACE_DAYS.
//
// We intentionally do NOT hard-delete immediately — the grace window lets
// a customer change their mind and keeps consistency with Supabase auth
// (we cascade there only after the grace period, from a cron route).
//
// The archive is a plain JSON object that can be JSON.stringify'd into a
// browser download — no additional formatting, no third-party libs.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

/** Number of days between "account deletion requested" and hard-erasure. */
export const ERASURE_GRACE_DAYS = 30;

/** Thin shape we expose to callers — enough to show "deletion scheduled for …". */
export type AccountDeletionStatus = {
  scheduled: boolean;
  scheduledAt: Date | null;
  hardDeleteOn: Date | null;
};

/** Date on which a soft-deleted user will be hard-purged. */
export function hardDeleteDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + ERASURE_GRACE_DAYS * 86_400_000);
}

/** Current deletion status for one user. */
export async function getAccountDeletionStatus(
  userId: string,
): Promise<AccountDeletionStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });
  const scheduledAt = user?.deletedAt ?? null;
  return {
    scheduled: scheduledAt !== null,
    scheduledAt,
    hardDeleteOn: scheduledAt ? hardDeleteDate(scheduledAt) : null,
  };
}

/** Flip the deletedAt flag on — returns the refreshed status. */
export async function scheduleAccountDeletion(
  userId: string,
): Promise<AccountDeletionStatus> {
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });
  return getAccountDeletionStatus(userId);
}

/** Flip the deletedAt flag off — returns the refreshed status. */
export async function cancelAccountDeletion(
  userId: string,
): Promise<AccountDeletionStatus> {
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null },
  });
  return getAccountDeletionStatus(userId);
}

// ─── archive builders ────────────────────────────────────────────────────

export type UserDataArchive = {
  generatedAt: string;
  schemaVersion: 1;
  profile: unknown;
  addresses: unknown[];
  orders: unknown[];
  reviews: unknown[];
  wishlist: unknown[];
  returns: unknown[];
  contactMessages: unknown[];
  newsletterSubscriptions: unknown[];
};

/**
 * Build a JSON-serialisable archive of everything we hold on this user.
 *
 * We lean on Prisma's default serialisation — dates come out as Date
 * objects and JSON.stringify turns those into ISO strings, which is
 * exactly what we want for an export.
 */
export async function buildUserDataArchive(
  userId: string,
): Promise<UserDataArchive> {
  const [profile, addresses, orders, reviews, wishlist, returns, contacts] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          preferredLocale: true,
          marketingOptIn: true,
          marketingOptInAt: true,
          acceptsTermsAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          role: true,
        },
      }),
      prisma.address.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { placedAt: "desc" },
        include: {
          items: true,
          shippingAddress: true,
          billingAddress: true,
        },
      }),
      prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          productId: true,
          rating: true,
          title: true,
          body: true,
          isVerified: true,
          isPublished: true,
          createdAt: true,
        },
      }),
      prisma.wishlistItem.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          productId: true,
          createdAt: true,
        },
      }),
      prisma.returnRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { items: true },
      }),
      prisma.contactMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          subject: true,
          name: true,
          email: true,
          message: true,
          createdAt: true,
        },
      }),
    ]);

  // NewsletterSubscriber is keyed by email, not userId — match on address.
  const newsletterSubscriptions = profile?.email
    ? await prisma.newsletterSubscriber.findMany({
        where: { email: profile.email },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    profile,
    addresses,
    orders,
    reviews,
    wishlist,
    returns: returns as unknown[],
    contactMessages: contacts,
    newsletterSubscriptions,
  };
}
