// ─────────────────────────────────────────────────────────────────────────
// Admin-side order queries.
//
// Mirrors the customer-facing queries in queries/orders.ts but unconstrained
// by userId — admins see every order, including guest checkouts.  Keeps
// column selection tight so list pages stay snappy with thousands of rows.
// ─────────────────────────────────────────────────────────────────────────

import { Prisma, OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminOrderRow = {
  id: string;
  publicNumber: string;
  placedAt: Date;
  email: string;
  customerName: string | null;
  itemCount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  grandTotal: number;
  currency: string;
  isGuest: boolean;
  /** H4: number of ReturnRequests in non-terminal states (REQUESTED /
   *  APPROVED / RECEIVED). Drives the per-row vermilion 'Return' pill
   *  on the admin orders list. 0 means no badge. */
  activeReturnCount: number;
};

export type AdminOrdersListParams = {
  q?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export type AdminOrdersListResult = {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listAdminOrders(
  params: AdminOrdersListParams = {},
): Promise<AdminOrdersListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 25));

  const where: Prisma.OrderWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.paymentStatus) where.paymentStatus = params.paymentStatus;
  if (params.from || params.to) {
    where.placedAt = {};
    if (params.from) where.placedAt.gte = params.from;
    if (params.to) where.placedAt.lte = params.to;
  }
  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    where.OR = [
      { publicNumber: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { mollieId: { contains: q, mode: "insensitive" } },
      {
        user: {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        publicNumber: true,
        placedAt: true,
        email: true,
        status: true,
        paymentStatus: true,
        grandTotal: true,
        currency: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
        // H4: count active returns per order so the orders list can flag
        // rows that have an open return request without admin having to
        // click into each one. "Active" = not yet refunded / rejected /
        // cancelled — same definition the sidebar pill uses.
        _count: {
          select: {
            items: true,
            returns: {
              where: {
                status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] },
              },
            },
          },
        },
        items: { select: { quantity: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((o) => {
      const customerName = o.user
        ? [o.user.firstName, o.user.lastName].filter(Boolean).join(" ").trim() ||
          null
        : null;
      const itemCount = o.items.reduce((n, i) => n + i.quantity, 0);
      return {
        id: o.id,
        publicNumber: o.publicNumber,
        placedAt: o.placedAt,
        email: o.email,
        customerName,
        itemCount,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotal: Number(o.grandTotal),
        currency: o.currency,
        isGuest: o.userId === null,
        // H4: number of active (non-terminal) ReturnRequests on this
        // order. Drives the vermilion "Return" pill on the row.
        activeReturnCount: o._count.returns,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type AdminOrderDetail = Awaited<ReturnType<typeof getAdminOrder>>;

export async function getAdminOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
        },
      },
      shippingAddress: true,
      billingAddress: true,
      items: {
        orderBy: { lineTotal: "desc" },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              kind: true,
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
          variant: { select: { id: true, sku: true, label: true } },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

/** Summary counts for the filter pills on the list page. */
export async function adminOrderCounts(
  base: Pick<AdminOrdersListParams, "q" | "from" | "to"> = {},
): Promise<{
  total: number;
  byStatus: Record<OrderStatus, number>;
  byPayment: Record<PaymentStatus, number>;
  revenue: number;
}> {
  const where: Prisma.OrderWhereInput = {};
  if (base.from || base.to) {
    where.placedAt = {};
    if (base.from) where.placedAt.gte = base.from;
    if (base.to) where.placedAt.lte = base.to;
  }
  if (base.q && base.q.trim()) {
    const q = base.q.trim();
    where.OR = [
      { publicNumber: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { mollieId: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, statusRows, paymentRows, revenueAgg] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.groupBy({
      where,
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      where,
      by: ["paymentStatus"],
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        ...where,
        paymentStatus: { in: [PaymentStatus.PAID] },
      },
      _sum: { grandTotal: true },
    }),
  ]);

  const byStatus: Record<OrderStatus, number> = Object.values(
    OrderStatus,
  ).reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<OrderStatus, number>,
  );
  for (const r of statusRows) byStatus[r.status] = r._count._all;

  const byPayment: Record<PaymentStatus, number> = Object.values(
    PaymentStatus,
  ).reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<PaymentStatus, number>,
  );
  for (const r of paymentRows) byPayment[r.paymentStatus] = r._count._all;

  return {
    total,
    byStatus,
    byPayment,
    revenue: revenueAgg._sum.grandTotal ? Number(revenueAgg._sum.grandTotal) : 0,
  };
}
