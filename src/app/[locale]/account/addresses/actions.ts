// ─────────────────────────────────────────────────────────────────────────
// Server actions for /[locale]/account/addresses
//
//   createAddressAction  — add a new address for the signed-in customer
//   updateAddressAction  — edit an existing one (scoped to caller)
//   deleteAddressAction  — remove one; auto-promotes a new default if needed
//   setDefaultAddressAction — flip the default to a given id
//
// All validate with Zod, all are scoped to the calling user via
// requireCustomer().  They return a narrow `ActionState` that the form
// reads with useActionState.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import {
  createMyAddress,
  updateMyAddress,
  deleteMyAddress,
  setMyDefaultAddress,
} from "@/lib/queries/addresses";
import type { ActionState } from "./form-state";

// NB: `ActionState` type and `INITIAL_ADDRESS_STATE` live in ./form-state.
// Next 15 "use server" files can only export async functions, so the form
// imports those directly from ./form-state rather than re-exporting here.

// Empty string → null so "optional" inputs don't save as blanks.
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const AddressSchema = z.object({
  firstName: z.string().trim().min(1, "required").max(60),
  lastName: z.string().trim().min(1, "required").max(60),
  company: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  line1: z.string().trim().min(1, "required").max(120),
  line2: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  city: z.string().trim().min(1, "required").max(80),
  postcode: z.string().trim().min(1, "required").max(20),
  region: z.preprocess(emptyToNull, z.string().trim().max(80).nullable()),
  country: z.string().trim().length(2, "invalid"),
  phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  isDefault: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  locale: z.string().min(2).max(2),
});

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return AddressSchema.safeParse(raw);
}

function flattenErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key] = issue.message;
    }
  }
  return out;
}

// ───────────────────────────── CREATE ──────────────────────────────
export async function createAddressAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      message: "invalid",
      fieldErrors: flattenErrors(parsed.error),
    };
  }
  const { locale, isDefault, ...data } = parsed.data;

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/addresses/new",
  });

  await createMyAddress(profile.id, { ...data, isDefault });

  revalidatePath(`/${locale}/account/addresses`);
  revalidatePath(`/${locale}/account`);
  redirect(`/${locale}/account/addresses`);
}

// ───────────────────────────── UPDATE ──────────────────────────────
export async function updateAddressAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { ok: false, message: "missing_id" };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      message: "invalid",
      fieldErrors: flattenErrors(parsed.error),
    };
  }
  const { locale, isDefault, ...data } = parsed.data;

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/addresses/${id}`,
  });

  const result = await updateMyAddress(profile.id, id, {
    ...data,
    isDefault,
  });
  if (!result) return { ok: false, message: "not_found" };

  revalidatePath(`/${locale}/account/addresses`);
  revalidatePath(`/${locale}/account`);
  redirect(`/${locale}/account/addresses`);
}

// ───────────────────────────── DELETE ──────────────────────────────
export async function deleteAddressAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const locale = formData.get("locale");
  if (
    typeof id !== "string" ||
    !id ||
    typeof locale !== "string" ||
    !locale
  ) {
    return;
  }

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/addresses",
  });
  await deleteMyAddress(profile.id, id);

  revalidatePath(`/${locale}/account/addresses`);
  revalidatePath(`/${locale}/account`);
}

// ───────────────────────── SET DEFAULT ─────────────────────────────
export async function setDefaultAddressAction(
  formData: FormData,
): Promise<void> {
  const id = formData.get("id");
  const locale = formData.get("locale");
  if (
    typeof id !== "string" ||
    !id ||
    typeof locale !== "string" ||
    !locale
  ) {
    return;
  }

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/addresses",
  });
  await setMyDefaultAddress(profile.id, id);

  revalidatePath(`/${locale}/account/addresses`);
  revalidatePath(`/${locale}/account`);
}
