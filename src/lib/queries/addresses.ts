// ─────────────────────────────────────────────────────────────────────────
// Address queries + mutations for the customer account area.
//
// All functions are user-scoped: callers pass `userId` and we constrain
// every query by it so one customer can never touch another's address.
// Mutations return the fresh list so the UI can revalidate locally.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { Address, AddressType } from "@prisma/client";

export type AddressView = {
  id: string;
  isDefault: boolean;
  type: AddressType;
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  region: string | null;
  country: string;
  phone: string | null;
};

function toView(a: Address): AddressView {
  return {
    id: a.id,
    isDefault: a.isDefault,
    type: a.type,
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postcode: a.postcode,
    region: a.region,
    country: a.country,
    phone: a.phone,
  };
}

export async function listMyAddresses(userId: string): Promise<AddressView[]> {
  const rows = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(toView);
}

export async function getMyAddress(
  userId: string,
  addressId: string,
): Promise<AddressView | null> {
  const row = await prisma.address.findFirst({
    where: { id: addressId, userId },
  });
  return row ? toView(row) : null;
}

export type AddressInput = {
  firstName: string;
  lastName: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  postcode: string;
  region?: string | null;
  country: string; // ISO alpha-2
  phone?: string | null;
  isDefault?: boolean;
};

/**
 * Insert a new address for the user. If `isDefault`, clears the flag on
 * every existing address first so we never end up with two defaults.
 */
export async function createMyAddress(
  userId: string,
  input: AddressInput,
): Promise<AddressView> {
  const result = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    } else {
      // First-ever address for this user → auto-default.
      const existing = await tx.address.count({ where: { userId } });
      if (existing === 0) input.isDefault = true;
    }

    return tx.address.create({
      data: {
        userId,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company ?? null,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        postcode: input.postcode,
        region: input.region ?? null,
        country: input.country,
        phone: input.phone ?? null,
        isDefault: input.isDefault ?? false,
      },
    });
  });

  return toView(result);
}

/** Update in place, keeping the `isDefault` invariant in check. */
export async function updateMyAddress(
  userId: string,
  addressId: string,
  input: AddressInput,
): Promise<AddressView | null> {
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });
  if (!owned) return null;

  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id: addressId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company ?? null,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        postcode: input.postcode,
        region: input.region ?? null,
        country: input.country,
        phone: input.phone ?? null,
        isDefault: input.isDefault ?? false,
      },
    });
  });

  return toView(row);
}

export async function deleteMyAddress(
  userId: string,
  addressId: string,
): Promise<boolean> {
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });
  if (!owned) return false;

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });
    // Promote another address to default if we just removed the default.
    if (owned.isDefault) {
      const nextDefault = await tx.address.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (nextDefault) {
        await tx.address.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }
  });

  return true;
}

export async function setMyDefaultAddress(
  userId: string,
  addressId: string,
): Promise<boolean> {
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });
  if (!owned) return false;

  await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });
  });

  return true;
}
