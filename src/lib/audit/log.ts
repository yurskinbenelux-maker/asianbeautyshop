// ─────────────────────────────────────────────────────────────────────────
// Audit log — append-only trail of admin mutations.
//
// Usage pattern (in a server action):
//
//   const admin = await requireAdmin();
//   // …do the work…
//   await logAudit({
//     actor: admin,
//     action: "product.update",
//     entityType: "Product",
//     entityId: id,
//     summary: `Updated product "${name}"`,
//     meta: { changedFields: ["price", "salePrice"] },
//   });
//
// Design notes
// ────────────
// • Never throws on failure. An audit hiccup MUST NOT block a real save,
//   so we log errors and swallow. If the audit table is missing entirely
//   (migration not run yet) we also swallow — Sofia won't see audit entries
//   until she runs prisma migrate dev, and that's fine.
// • `actorEmail` is snapshotted so entries remain legible after GDPR erasure.
// • `meta` is a small JSON blob; keep it under a few KB.
// ─────────────────────────────────────────────────────────────────────────

import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type Actor =
  | User // Supabase user (what requireAdmin returns)
  | { id: string | null; email: string | null }
  | null;

export type AuditPayload = {
  actor?: Actor;
  action: string; // "{entity}.{verb}" — e.g. "product.update"
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown> | null;
};

/**
 * Record an audit entry. Fire-and-forget by default (call from a server
 * action without `await` if you don't care about ordering). Awaiting is
 * safe — the function only takes a few ms and catches its own errors.
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
  try {
    const actor = payload.actor ?? null;
    const actorId = resolveActorId(actor);
    const actorEmail = resolveActorEmail(actor);

    // Request-scoped IP / UA. `headers()` throws outside a request context
    // (cron, seed scripts) — that's fine, we just omit them.
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null;
      userAgent = h.get("user-agent");
    } catch {
      /* not in a request context */
    }

    await prisma.auditLog.create({
      data: {
        actorId: actorId,
        actorEmail: actorEmail,
        action: payload.action,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        summary: payload.summary.slice(0, 500),
        meta: (payload.meta as never) ?? undefined,
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: userAgent ? userAgent.slice(0, 512) : null,
      },
    });
  } catch (err) {
    // Never let the audit log break a real write.
    console.warn("[audit] write failed", err);
  }
}

function resolveActorId(actor: Actor): string | null {
  if (!actor) return null;
  if ("id" in actor && typeof actor.id === "string") return actor.id;
  return null;
}

function resolveActorEmail(actor: Actor): string | null {
  if (!actor) return null;
  if ("email" in actor && typeof actor.email === "string") {
    return actor.email.toLowerCase();
  }
  return null;
}
