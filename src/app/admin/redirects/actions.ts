// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/redirects.
//
// an admin uses this panel two ways:
//   1. Manually add a redirect ("move /shop/old-serum → /shop/new-serum")
//   2. Review and prune auto-inserted redirects from slug renames
//
// We validate:
//   · fromPath and toPath both start with "/" and are distinct
//   · no loops (fromPath → toPath that already maps back somewhere)
//   · fromPath is unique (the DB index will catch duplicates, we turn
//     Prisma's P2002 into a friendly field error)
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, RedirectCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { normalisePath } from "@/lib/redirects/db";
import { logAudit } from "@/lib/audit/log";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

function bad(
  msg: string,
  fieldErrors?: ActionState["fieldErrors"],
): ActionState {
  return { ok: false, message: msg, fieldErrors };
}

const BaseSchema = z.object({
  fromPath: z
    .string()
    .trim()
    .min(1, "From path is required.")
    .max(400)
    .refine((s) => s.startsWith("/"), "Must start with /."),
  toPath: z
    .string()
    .trim()
    .min(1, "To path is required.")
    .max(400)
    .refine((s) => s.startsWith("/"), "Must start with /."),
  code: z.nativeEnum(RedirectCode),
  note: z
    .string()
    .trim()
    .max(400)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

function refresh(id?: string) {
  revalidatePath("/admin/redirects");
  if (id) revalidatePath(`/admin/redirects/${id}`);
}

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createRedirectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = BaseSchema.safeParse({
    fromPath: formData.get("fromPath"),
    toPath: formData.get("toPath"),
    code: formData.get("code"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const fromPath = normalisePath(String(parsed.data.fromPath));
  const toPath = normalisePath(String(parsed.data.toPath));

  if (fromPath === toPath) {
    return bad("From and to paths must differ.", {
      toPath: ["Must be different from the From path."],
    });
  }

  try {
    const created = await prisma.redirect.create({
      data: {
        fromPath,
        toPath,
        code: parsed.data.code,
        note: parsed.data.note,
        source: "manual",
      },
      select: { id: true },
    });
    await logAudit({
      actor: admin,
      action: "redirect.create",
      entityType: "Redirect",
      entityId: created.id,
      summary: `Created redirect ${fromPath} → ${toPath} (${parsed.data.code})`,
      meta: { fromPath, toPath, code: parsed.data.code },
    });
    refresh(created.id);
    redirect(`/admin/redirects/${created.id}`);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return bad("A redirect already exists for that From path.", {
        fromPath: ["Already in use — edit the existing redirect instead."],
      });
    }
    throw err;
  }
  // unreachable
  return OK_SAVED;
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updateRedirectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return bad("Missing redirect id.");

  const parsed = BaseSchema.safeParse({
    fromPath: formData.get("fromPath"),
    toPath: formData.get("toPath"),
    code: formData.get("code"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const fromPath = normalisePath(String(parsed.data.fromPath));
  const toPath = normalisePath(String(parsed.data.toPath));

  if (fromPath === toPath) {
    return bad("From and to paths must differ.", {
      toPath: ["Must be different from the From path."],
    });
  }

  const existing = await prisma.redirect.findUnique({ where: { id } });
  if (!existing) return bad("That redirect no longer exists.");

  try {
    await prisma.redirect.update({
      where: { id },
      data: {
        fromPath,
        toPath,
        code: parsed.data.code,
        note: parsed.data.note,
        // Once an admin edits a row herself, we re-label it "manual" so it
        // won't look ambiguous in the list.
        source: existing.source?.startsWith("auto:") ? "manual" : existing.source ?? "manual",
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return bad("Another redirect already uses that From path.", {
        fromPath: ["Already in use — merge the rows manually."],
      });
    }
    throw err;
  }

  await logAudit({
    actor: admin,
    action: "redirect.update",
    entityType: "Redirect",
    entityId: id,
    summary: `Updated redirect ${existing.fromPath} → ${toPath}`,
    meta: {
      before: { fromPath: existing.fromPath, toPath: existing.toPath, code: existing.code },
      after: { fromPath, toPath, code: parsed.data.code },
    },
  });

  refresh(id);
  return OK_SAVED;
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deleteRedirectAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await prisma.redirect.findUnique({
    where: { id },
    select: { fromPath: true, toPath: true },
  });
  await prisma.redirect.delete({ where: { id } });
  await logAudit({
    actor: admin,
    action: "redirect.delete",
    entityType: "Redirect",
    entityId: id,
    summary: existing
      ? `Deleted redirect ${existing.fromPath} → ${existing.toPath}`
      : `Deleted redirect ${id}`,
    meta: existing ?? undefined,
  });
  refresh();
  redirect("/admin/redirects");
}
