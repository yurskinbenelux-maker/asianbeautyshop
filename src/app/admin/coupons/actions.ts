// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/coupons.
//
// Rules:
//   • requireAdmin first
//   • codes are normalised uppercase so customer typing is forgiving
//   • percent coupons are clamped 0–100; fixed coupons store euros (Decimal);
//     free-shipping ignores value
//   • deleting a coupon that's been redeemed is allowed but WARNED — the
//     Order.couponCode FK is optional, so historic orders keep their code
//     as a string but lose the relation. We confirm with a DELETE typed
//     into a box to avoid slips.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

function bad(msg: string, fieldErrors?: ActionState["fieldErrors"]): ActionState {
  return { ok: false, message: msg, fieldErrors };
}

function refresh(code?: string) {
  revalidatePath("/admin/coupons");
  if (code) revalidatePath(`/admin/coupons/${encodeURIComponent(code)}`);
}

// ──────── shared schema ─────────────────────────────────────────────────

// Accept "yes"/"on"/etc. as boolean, plus any truthy/falsy string.
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

// Coerce "" → undefined so optional numerics don't become NaN.
const optionalNumber = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0),
  )
  .optional();

const optionalDate = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date(),
  )
  .optional();

const BaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(40, "Keep it under 40 characters.")
    .regex(
      /^[A-Z0-9_-]+$/i,
      "Use only letters, numbers, hyphens, and underscores.",
    ),
  kind: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  // Interpreted based on kind — percent (0–100) for PERCENT, euros for FIXED,
  // ignored for FREE_SHIPPING (we write 0).
  valueRaw: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().min(0),
    )
    .optional(),
  minSubtotalEuros: optionalNumber,
  maxRedemptions: optionalNumber,
  startsAt: optionalDate,
  endsAt: optionalDate,
  isActive: checkbox,
  firstOrderOnly: checkbox,
});

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createCouponAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = BaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const data = parsed.data;
  const code = data.code.toUpperCase();

  // Value validation depends on kind.
  const valueCheck = validateValue(data.kind, data.valueRaw);
  if (!valueCheck.ok) {
    return bad(valueCheck.message, { valueRaw: [valueCheck.message] });
  }

  // Uniqueness — code is the @id, so we catch the collision explicitly for a
  // nicer error than Prisma's raw one.
  const clash = await prisma.coupon.findUnique({ where: { code } });
  if (clash) {
    return bad(`A coupon with code "${code}" already exists.`, {
      code: [`Choose a different code — "${code}" is taken.`],
    });
  }

  const dateRangeError = validateDateRange(data.startsAt, data.endsAt);
  if (dateRangeError) return bad(dateRangeError, { endsAt: [dateRangeError] });

  await prisma.coupon.create({
    data: {
      code,
      kind: data.kind,
      value: new Prisma.Decimal(valueCheck.storedValue),
      minSubtotal:
        data.minSubtotalEuros == null || data.minSubtotalEuros === 0
          ? null
          : new Prisma.Decimal(data.minSubtotalEuros),
      maxRedemptions:
        data.maxRedemptions == null || data.maxRedemptions === 0
          ? null
          : Math.round(data.maxRedemptions),
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      isActive: data.isActive,
      firstOrderOnly: data.firstOrderOnly,
    },
  });

  refresh(code);
  // After creating we send Sofia to the edit page for this coupon.
  redirect(`/admin/coupons/${encodeURIComponent(code)}`);
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updateCouponAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const originalCode = String(formData.get("originalCode") ?? "").toUpperCase();
  if (!originalCode) return bad("Missing coupon code.");

  const parsed = BaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const data = parsed.data;
  // Coupon.code is the primary key; Prisma allows updating it but we need
  // to be careful — orders reference it. We only rename if it actually
  // changed AND the new code is free.
  const newCode = data.code.toUpperCase();

  const valueCheck = validateValue(data.kind, data.valueRaw);
  if (!valueCheck.ok) {
    return bad(valueCheck.message, { valueRaw: [valueCheck.message] });
  }

  const dateRangeError = validateDateRange(data.startsAt, data.endsAt);
  if (dateRangeError) return bad(dateRangeError, { endsAt: [dateRangeError] });

  if (newCode !== originalCode) {
    const clash = await prisma.coupon.findUnique({ where: { code: newCode } });
    if (clash) {
      return bad(`A coupon with code "${newCode}" already exists.`, {
        code: [`Choose a different code — "${newCode}" is taken.`],
      });
    }
  }

  await prisma.coupon.update({
    where: { code: originalCode },
    data: {
      code: newCode,
      kind: data.kind,
      value: new Prisma.Decimal(valueCheck.storedValue),
      minSubtotal:
        data.minSubtotalEuros == null || data.minSubtotalEuros === 0
          ? null
          : new Prisma.Decimal(data.minSubtotalEuros),
      maxRedemptions:
        data.maxRedemptions == null || data.maxRedemptions === 0
          ? null
          : Math.round(data.maxRedemptions),
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      isActive: data.isActive,
      firstOrderOnly: data.firstOrderOnly,
    },
  });

  refresh(newCode);
  if (newCode !== originalCode) {
    // Code was renamed; hop to the new URL so refresh doesn't 404.
    redirect(`/admin/coupons/${encodeURIComponent(newCode)}`);
  }
  return OK_SAVED;
}

// ──────── QUICK TOGGLE ──────────────────────────────────────────────────

/** Single-field "toggle active" action from the list page. */
export async function toggleCouponActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").toUpperCase();
  const nextActive = formData.get("nextActive") === "true";
  if (!code) return;
  await prisma.coupon.update({
    where: { code },
    data: { isActive: nextActive },
  });
  refresh(code);
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deleteCouponAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const code = String(formData.get("code") ?? "").toUpperCase();
  const confirm = String(formData.get("confirm") ?? "");

  if (!code) return bad("Missing coupon code.");
  if (confirm !== "DELETE") {
    return bad('Type DELETE exactly to confirm.', {
      confirm: ['Type DELETE exactly to confirm.'],
    });
  }

  await prisma.coupon.delete({ where: { code } });
  refresh();
  redirect("/admin/coupons");
}

// ──────── helpers ───────────────────────────────────────────────────────

type ValueCheckResult =
  | { ok: true; storedValue: number }
  | { ok: false; message: string };

function validateValue(
  kind: "PERCENT" | "FIXED" | "FREE_SHIPPING",
  raw: number | undefined,
): ValueCheckResult {
  if (kind === "FREE_SHIPPING") return { ok: true, storedValue: 0 };
  if (raw == null || Number.isNaN(raw)) {
    return { ok: false, message: "Enter a value for this coupon." };
  }
  if (kind === "PERCENT") {
    if (raw <= 0 || raw > 100) {
      return { ok: false, message: "Percent must be between 0.01 and 100." };
    }
    return { ok: true, storedValue: raw };
  }
  // FIXED — store euros (Decimal).
  if (raw <= 0) {
    return { ok: false, message: "Fixed amount must be greater than €0.00." };
  }
  return { ok: true, storedValue: raw };
}

function validateDateRange(
  startsAt: Date | undefined,
  endsAt: Date | undefined,
): string | null {
  if (!startsAt || !endsAt) return null;
  if (endsAt.getTime() <= startsAt.getTime()) {
    return "End date must be after the start date.";
  }
  return null;
}
