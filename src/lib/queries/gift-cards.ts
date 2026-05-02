// ─────────────────────────────────────────────────────────────────────────
// Gift card query helpers — both customer-facing (listMyGiftCards) and
// admin-facing (listGiftCards / getGiftCard).
//
// Why a single module: the same row shape is used on both sides; pulling
// it into one place keeps the redaction (admin sees code, customer sees
// the last 4) consistent.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { GiftCardStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type GiftCardListRow = {
  id: string;
  code: string;
  initialBalanceEur: number;
  balanceEur: number;
  status: GiftCardStatus;
  recipientEmail: string;
  recipientName: string | null;
  senderEmail: string | null;
  senderName: string | null;
  deliveryMode: "self" | "friend" | null;
  expiresAt: Date | null;
  createdAt: Date;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  /** Total amount drawn down so far (sum of redemptions). */
  redeemedEur: number;
};

export type GiftCardFilter = {
  status?: GiftCardStatus | "ALL";
  query?: string; // matches code or recipient email
  page?: number;
  perPage?: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Customer side: list cards owned-by-recipient OR purchased-by-buyer
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cards visible to a customer:
 *   · cards where recipientEmail === user.email (sent to me)
 *   · cards where senderEmail === user.email (I bought, possibly for
 *     someone else — useful for resend / tracking)
 *
 * Returned newest-first, with redeemed total joined.
 */
export async function listMyGiftCards(
  userEmail: string,
): Promise<GiftCardListRow[]> {
  const lc = userEmail.toLowerCase();

  const cards = await prisma.giftCard.findMany({
    where: {
      OR: [{ recipientEmail: lc }, { senderEmail: lc }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      redemptions: { select: { amountUsed: true } },
      // The order public number, for "this card came from order YUR-1042".
      // Joining via raw FK because Prisma doesn't expose the relation
      // (purchaseOrderId is plain — no `@relation`).
    },
  });

  // Resolve order public numbers in one round-trip.
  const orderIds = cards
    .map((c) => c.purchaseOrderId)
    .filter((v): v is string => v !== null);
  const orderRows = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, publicNumber: true },
      })
    : [];
  const orderNumberById = new Map(
    orderRows.map((o) => [o.id, o.publicNumber]),
  );

  return cards.map((c) => toRow(c, orderNumberById));
}

// ─────────────────────────────────────────────────────────────────────────
// Admin side: paginated list with filters
// ─────────────────────────────────────────────────────────────────────────

const PER_PAGE_DEFAULT = 25;

export async function listGiftCards(
  filter: GiftCardFilter = {},
): Promise<{
  rows: GiftCardListRow[];
  total: number;
  page: number;
  perPage: number;
}> {
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const perPage = Math.min(
    100,
    Math.max(1, Math.floor(filter.perPage ?? PER_PAGE_DEFAULT)),
  );

  const where: Prisma.GiftCardWhereInput = {};
  if (filter.status && filter.status !== "ALL") {
    where.status = filter.status;
  }
  if (filter.query && filter.query.trim().length > 0) {
    const q = filter.query.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { recipientEmail: { contains: q.toLowerCase() } },
      { senderEmail: { contains: q.toLowerCase() } },
    ];
  }

  const [total, cards] = await Promise.all([
    prisma.giftCard.count({ where }),
    prisma.giftCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { redemptions: { select: { amountUsed: true } } },
    }),
  ]);

  const orderIds = cards
    .map((c) => c.purchaseOrderId)
    .filter((v): v is string => v !== null);
  const orderRows = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, publicNumber: true },
      })
    : [];
  const orderNumberById = new Map(
    orderRows.map((o) => [o.id, o.publicNumber]),
  );

  return {
    rows: cards.map((c) => toRow(c, orderNumberById)),
    total,
    page,
    perPage,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Single-card detail (admin)
// ─────────────────────────────────────────────────────────────────────────

export type GiftCardDetail = GiftCardListRow & {
  message: string | null;
  redemptions: Array<{
    id: string;
    orderId: string;
    orderPublicNumber: string | null;
    amountUsedEur: number;
    createdAt: Date;
  }>;
};

export async function getGiftCard(
  id: string,
): Promise<GiftCardDetail | null> {
  const card = await prisma.giftCard.findUnique({
    where: { id },
    include: {
      redemptions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderId: true,
          amountUsed: true,
          createdAt: true,
        },
      },
    },
  });
  if (!card) return null;

  // Resolve order public numbers — purchase order + every redemption order
  // — in one go.
  const allOrderIds = [
    card.purchaseOrderId,
    ...card.redemptions.map((r) => r.orderId),
  ].filter((v): v is string => v !== null);
  const orderRows = allOrderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: allOrderIds } },
        select: { id: true, publicNumber: true },
      })
    : [];
  const orderNumberById = new Map(
    orderRows.map((o) => [o.id, o.publicNumber]),
  );

  const redemptions = card.redemptions.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    orderPublicNumber: orderNumberById.get(r.orderId) ?? null,
    amountUsedEur: Number(r.amountUsed),
    createdAt: r.createdAt,
  }));

  const base = toRow(
    { ...card, redemptions: card.redemptions },
    orderNumberById,
  );

  return {
    ...base,
    message: card.message,
    redemptions,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Mapping helper (private)
// ─────────────────────────────────────────────────────────────────────────

function toRow(
  c: {
    id: string;
    code: string;
    initialBalance: Prisma.Decimal;
    balance: Prisma.Decimal;
    status: GiftCardStatus;
    recipientEmail: string;
    recipientName: string | null;
    senderName: string | null;
    senderEmail: string | null;
    deliveryMode: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    purchaseOrderId: string | null;
    redemptions: Array<{ amountUsed: Prisma.Decimal }>;
  },
  orderNumberById: Map<string, string>,
): GiftCardListRow {
  const redeemedEur = c.redemptions.reduce(
    (sum, r) => sum + Number(r.amountUsed),
    0,
  );
  const mode =
    c.deliveryMode === "self" || c.deliveryMode === "friend"
      ? c.deliveryMode
      : null;
  return {
    id: c.id,
    code: c.code,
    initialBalanceEur: Number(c.initialBalance),
    balanceEur: Number(c.balance),
    status: c.status,
    recipientEmail: c.recipientEmail,
    recipientName: c.recipientName,
    senderEmail: c.senderEmail,
    senderName: c.senderName,
    deliveryMode: mode,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
    purchaseOrderId: c.purchaseOrderId,
    purchaseOrderNumber: c.purchaseOrderId
      ? (orderNumberById.get(c.purchaseOrderId) ?? null)
      : null,
    redeemedEur,
  };
}
