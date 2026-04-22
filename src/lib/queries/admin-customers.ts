// ─────────────────────────────────────────────────────────────────────────
// Admin-side customer queries.
//
// Two shapes:
//   • list  — paginated rows with stats joined in (order count, total
//     spent). Aggregation is done per-row via a two-query approach
//     rather than one gigantic join so pagination stays fast on large
//     tables.
//   • detail — single user, plus recent orders, addresses, wishlist.
//
// We treat deletedAt as the "not really there" signal. By default the
// list hides soft-deleted users; the UI can pass includeDeleted to see
// them (e.g. for GDPR right-of-access audits).
//
// Two kinds of row live on this page:
//   • kind: "user"       — someone with a customer account (User table).
//     May have orders, addresses, wishlist, a preferred locale, etc.
//   • kind: "subscriber" — anonymous email-only signup from the homepage
//     newsletter form (NewsletterSubscriber table). No account, no
//     orders; only email + locale + source + opt-in status.
//
// We merge both sources so Sofia sees the full mailing list in one view
// under the "Newsletter" segment. The `kind` discriminator lets the
// table renderer degrade subscriber rows gracefully (no name, no orders,
// no click-through to a customer detail page).
// ─────────────────────────────────────────────────────────────────────────

import { Prisma, Role, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminCustomerRow = {
  /** "user" = real customer account; "subscriber" = email-only signup. */
  kind: "user" | "subscriber";
  id: string;
  email: string;
  /** Null for subscribers — they have no role. */
  role: Role | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  marketingOptIn: boolean;
  preferredLocale: string;
  createdAt: Date;
  /** For users: soft-delete. For subscribers: mirrors unsubscribedAt. */
  deletedAt: Date | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  /** Subscriber-only: "confirmed" | "pending" | "unsubscribed". Null for users. */
  subscriberStatus: "confirmed" | "pending" | "unsubscribed" | null;
  /** Subscriber-only: "homepage", "checkout", etc. Null for users. */
  source: string | null;
};

export type AdminCustomersListParams = {
  q?: string;
  role?: Role;
  /** "customers" → people with at least one order; "newsletter" → opted-in, no orders */
  segment?: "customers" | "newsletter" | "all";
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
  /** default = recent signup */
  sort?: "recent" | "spend" | "orders" | "name";
};

export type AdminCustomersListResult = {
  rows: AdminCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listAdminCustomers(
  params: AdminCustomersListParams = {},
): Promise<AdminCustomersListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 25));
  const sort = params.sort ?? "recent";
  const segment = params.segment ?? "all";
  const q = params.q?.trim() ?? "";

  // Subscribers get folded in for "newsletter" and "all". For the
  // "customers" segment (people with orders) they're irrelevant.
  const includeSubscribers = segment === "newsletter" || segment === "all";
  // When the admin filters by role, subscribers can't match (no role
  // column) so skip them to avoid confusing zero-context rows.
  const subscribersExcludedByFilter = Boolean(params.role);

  // ── User-side query (unchanged core logic, just extracted) ─────────
  const where: Prisma.UserWhereInput = {};

  if (!params.includeDeleted) where.deletedAt = null;
  if (params.role) where.role = params.role;

  if (segment === "customers") {
    where.orders = { some: {} };
  } else if (segment === "newsletter") {
    // User-account people who ticked the marketing box but haven't
    // ordered yet. Subscribers are unioned in below.
    where.AND = [{ marketingOptIn: true }, { orders: { none: {} } }];
  }

  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  // We always aggregate in memory when subscribers are being unioned in,
  // because Prisma can't sort across two tables. To keep pagination
  // correct we need the full candidate set.
  const aggregateInMemory =
    includeSubscribers && !subscribersExcludedByFilter
      ? true
      : sort === "spend" || sort === "orders";

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sort === "name" ? { lastName: "asc" } : { createdAt: "desc" };

  const [userTotal, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: aggregateInMemory ? 0 : (page - 1) * pageSize,
      take: aggregateInMemory ? 2_000 : pageSize,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        marketingOptIn: true,
        preferredLocale: true,
        createdAt: true,
        deletedAt: true,
      },
    }),
  ]);

  // Aggregate order stats for the user batch we just fetched.
  let statsByUser = new Map<
    string,
    { orderCount: number; totalSpent: number; lastOrderAt: Date | null }
  >();
  if (users.length > 0) {
    const userIds = users.map((u) => u.id);
    const aggregates = await prisma.order.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        paymentStatus: {
          in: [
            PaymentStatus.PAID,
            PaymentStatus.PARTIALLY_REFUNDED,
            PaymentStatus.REFUNDED,
          ],
        },
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
      _max: { placedAt: true },
    });
    statsByUser = new Map(
      aggregates
        .filter((a) => a.userId)
        .map((a) => [
          a.userId as string,
          {
            orderCount: a._count._all,
            totalSpent: a._sum.grandTotal ? Number(a._sum.grandTotal) : 0,
            lastOrderAt: a._max.placedAt ?? null,
          },
        ]),
    );
  }

  const userRows: AdminCustomerRow[] = users.map((u) => {
    const s = statsByUser.get(u.id);
    return {
      kind: "user",
      id: u.id,
      email: u.email,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      marketingOptIn: u.marketingOptIn,
      preferredLocale: u.preferredLocale,
      createdAt: u.createdAt,
      deletedAt: u.deletedAt,
      orderCount: s?.orderCount ?? 0,
      totalSpent: s?.totalSpent ?? 0,
      lastOrderAt: s?.lastOrderAt ?? null,
      subscriberStatus: null,
      source: null,
    };
  });

  // ── Subscriber-side query ──────────────────────────────────────────
  let subscriberRows: AdminCustomerRow[] = [];
  let subscriberTotal = 0;

  if (includeSubscribers && !subscribersExcludedByFilter) {
    const subWhere: Prisma.NewsletterSubscriberWhereInput = {};
    // Hide unsubscribed rows by default (same semantic as deletedAt
    // for users); admins can opt into seeing them with ?deleted=1.
    if (!params.includeDeleted) subWhere.unsubscribedAt = null;
    if (q) subWhere.email = { contains: q, mode: "insensitive" };

    // If Sofia is also searching for a name/phone — fields subscribers
    // don't have — we still want email matches to land. The block above
    // already narrows by email, so no extra action needed.

    const [count, subs] = await Promise.all([
      prisma.newsletterSubscriber.count({ where: subWhere }),
      prisma.newsletterSubscriber.findMany({
        where: subWhere,
        orderBy: { createdAt: "desc" },
        // We always need the full set for merged sorting + paging.
        take: 2_000,
        select: {
          id: true,
          email: true,
          locale: true,
          source: true,
          confirmedAt: true,
          unsubscribedAt: true,
          createdAt: true,
        },
      }),
    ]);
    subscriberTotal = count;
    subscriberRows = subs.map((s) => ({
      kind: "subscriber",
      id: s.id,
      email: s.email,
      role: null,
      firstName: null,
      lastName: null,
      phone: null,
      // Being on the list IS the opt-in, by definition. The extra status
      // field below tells Sofia whether they've confirmed the double
      // opt-in yet.
      marketingOptIn: true,
      preferredLocale: s.locale,
      createdAt: s.createdAt,
      deletedAt: s.unsubscribedAt,
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      subscriberStatus: s.unsubscribedAt
        ? "unsubscribed"
        : s.confirmedAt
          ? "confirmed"
          : "pending",
      source: s.source,
    }));
  }

  // ── Merge, sort, paginate ──────────────────────────────────────────
  let rows: AdminCustomerRow[] = [...userRows, ...subscriberRows];

  if (sort === "spend") {
    rows.sort((a, b) => b.totalSpent - a.totalSpent);
  } else if (sort === "orders") {
    rows.sort((a, b) => b.orderCount - a.orderCount);
  } else if (sort === "name") {
    // Rows without a last name sink to the bottom (subscribers mainly).
    rows.sort((a, b) => {
      const an = (a.lastName ?? "").toLowerCase();
      const bn = (b.lastName ?? "").toLowerCase();
      if (an && !bn) return -1;
      if (!an && bn) return 1;
      return an.localeCompare(bn);
    });
  } else {
    // recent — newest first, works identically across both kinds.
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const total = userTotal + subscriberTotal;

  if (aggregateInMemory) {
    rows = rows.slice((page - 1) * pageSize, page * pageSize);
  }

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ──────── detail view ────────────────────────────────────────────────────

export type AdminCustomerDetail = Awaited<ReturnType<typeof getAdminCustomer>>;

export async function getAdminCustomer(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
      orders: {
        orderBy: { placedAt: "desc" },
        take: 50,
        select: {
          id: true,
          publicNumber: true,
          placedAt: true,
          status: true,
          paymentStatus: true,
          grandTotal: true,
          currency: true,
          items: { select: { quantity: true } },
        },
      },
      wishlist: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              price: true,
              translations: {
                where: { locale: "EN" },
                select: { name: true, slug: true },
              },
              media: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  // Lifetime stats — same rules as the list view for parity.
  const stats = await prisma.order.aggregate({
    where: {
      userId: id,
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
      },
    },
    _count: { _all: true },
    _sum: { grandTotal: true },
    _min: { placedAt: true },
    _max: { placedAt: true },
  });

  // Grand-total across ALL orders (including pending/failed) so admin sees
  // "attempted" revenue too. Separate number to avoid confusing the
  // lifetime-paid metric.
  const attemptedAgg = await prisma.order.aggregate({
    where: { userId: id },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });

  return {
    user,
    stats: {
      paidOrderCount: stats._count._all,
      totalSpent: stats._sum.grandTotal ? Number(stats._sum.grandTotal) : 0,
      firstOrderAt: stats._min.placedAt ?? null,
      lastOrderAt: stats._max.placedAt ?? null,
      allOrderCount: attemptedAgg._count._all,
      allOrderTotal: attemptedAgg._sum.grandTotal
        ? Number(attemptedAgg._sum.grandTotal)
        : 0,
    },
  };
}

/** Headline counts for the filter pills on the list page. */
export async function adminCustomerCounts(): Promise<{
  total: number;
  byRole: Record<Role, number>;
  /** Combined mailing list size: opted-in users + active subscribers. */
  newsletter: number;
  deleted: number;
}> {
  const [
    total,
    byRoleRows,
    newsletterUsers,
    newsletterSubscribers,
    deleted,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.groupBy({
      where: { deletedAt: null },
      by: ["role"],
      _count: { _all: true },
    }),
    // Account holders who ticked the marketing box but haven't ordered.
    prisma.user.count({
      where: {
        deletedAt: null,
        marketingOptIn: true,
        orders: { none: {} },
      },
    }),
    // Anonymous email-only signups that haven't unsubscribed. We count
    // pending AND confirmed here so the pill reflects "everyone we could
    // potentially mail once they confirm" — parity with the list view.
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
  ]);

  const byRole = Object.values(Role).reduce(
    (acc, r) => {
      acc[r] = 0;
      return acc;
    },
    {} as Record<Role, number>,
  );
  for (const r of byRoleRows) byRole[r.role] = r._count._all;

  return {
    total,
    byRole,
    newsletter: newsletterUsers + newsletterSubscribers,
    deleted,
  };
}
