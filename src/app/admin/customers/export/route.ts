// ─────────────────────────────────────────────────────────────────────────
// /admin/customers/export — CSV download of the filtered customer list.
//
// Mirrors the filter semantics of /admin/customers so an admin gets "what
// you see is what you export". Joins lifetime paid-order stats per row
// via a single groupBy, same approach as the list view.
//
// Cap: 10,000 rows per request. If the account base ever grows beyond
// that, we'll revisit (streamed exports / date-windowed splits).
//
// Format: RFC 4180-ish CSV with CRLF line endings and standard quoting.
// Excel on macOS and Windows both import this cleanly.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { PaymentStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";

const MAX_ROWS = 10_000;

export async function GET(req: NextRequest) {
  // Customer-list CSV leaks marketing opt-ins + spend history. Owner-only.
  await requireCapability("customers.export");

  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q") ?? undefined;
  const roleRaw = searchParams.get("role") ?? undefined;
  const segmentRaw = searchParams.get("segment") ?? undefined;
  const includeDeleted = searchParams.get("deleted") === "1";

  const role = isRole(roleRaw) ? roleRaw : undefined;
  const segment = isSegment(segmentRaw) ? segmentRaw : "all";

  // Build the same where clause as listAdminCustomers().
  const where: Prisma.UserWhereInput = {};
  if (!includeDeleted) where.deletedAt = null;
  if (role) where.role = role;

  if (segment === "customers") {
    where.orders = { some: {} };
  } else if (segment === "newsletter") {
    where.AND = [{ marketingOptIn: true }, { orders: { none: {} } }];
  }

  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { email: { contains: term, mode: "insensitive" } },
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { phone: { contains: term, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      marketingOptIn: true,
      marketingOptInAt: true,
      preferredLocale: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  // Join lifetime paid-order stats via one groupBy — same rule as the
  // list view (count PAID / PARTIALLY_REFUNDED / REFUNDED).
  const statsByUser = new Map<
    string,
    { orderCount: number; totalSpent: number; lastOrderAt: Date | null }
  >();

  if (users.length > 0) {
    const ids = users.map((u) => u.id);
    const aggregates = await prisma.order.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
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

    for (const a of aggregates) {
      if (!a.userId) continue;
      statsByUser.set(a.userId, {
        orderCount: a._count._all,
        totalSpent: a._sum.grandTotal ? Number(a._sum.grandTotal) : 0,
        lastOrderAt: a._max.placedAt ?? null,
      });
    }
  }

  const header = [
    "Email",
    "First name",
    "Last name",
    "Phone",
    "Role",
    "Locale",
    "Marketing opt-in",
    "Opted in at",
    "Joined",
    "Deleted at",
    "Orders (paid)",
    "Lifetime spend",
    "Last order",
  ];

  const lines: string[] = [header.map(csvCell).join(",")];
  for (const u of users) {
    const s = statsByUser.get(u.id);
    lines.push(
      [
        u.email,
        u.firstName ?? "",
        u.lastName ?? "",
        u.phone ?? "",
        u.role,
        u.preferredLocale,
        u.marketingOptIn ? "yes" : "no",
        iso(u.marketingOptInAt),
        iso(u.createdAt),
        iso(u.deletedAt),
        String(s?.orderCount ?? 0),
        (s?.totalSpent ?? 0).toFixed(2),
        iso(s?.lastOrderAt ?? null),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const body = lines.join("\r\n");
  const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ──────── helpers ──────────────────────────────────────────────────────

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (Object.values(Role) as string[]).includes(v);
}
function isSegment(v: unknown): v is "all" | "customers" | "newsletter" {
  return v === "all" || v === "customers" || v === "newsletter";
}
function iso(d: Date | null | undefined) {
  if (!d) return "";
  return d.toISOString();
}

/** RFC-4180 style cell escaping. */
function csvCell(v: string): string {
  const needsQuoting = /[",\r\n]/.test(v);
  const doubled = v.replace(/"/g, '""');
  return needsQuoting ? `"${doubled}"` : doubled;
}
