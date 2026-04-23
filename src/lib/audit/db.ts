// ─────────────────────────────────────────────────────────────────────────
// Audit log queries — read-side helpers for /admin/audit.
//
// The list is always reverse-chronological. We keep filters minimal on
// purpose — free-text search across action/summary/entityId, plus a
// date-range filter. No pagination control yet: we cap at 200 rows which
// covers ~2 weeks of activity for Sofia's scale.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AuditListFilters = {
  q?: string;
  action?: string; // exact match like "product.update" — optional
  entityType?: string;
  from?: Date;
  to?: Date;
};

export async function listAuditLog(filters: AuditListFilters = {}) {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      actorEmail: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      meta: true,
      createdAt: true,
    },
  });
}

/** Distinct action strings currently in the log — powers the filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const rows = (await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 200,
  })) as Array<{ action: string }>;
  return rows.map((r) => r.action);
}
