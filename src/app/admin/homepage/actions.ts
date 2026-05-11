// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/homepage — the SiteCopy editor.
//
// One save button per section saves all fields × all locales in that section
// in a single transaction. Empty inputs delete the row so an admin can revert
// any field to the JSON catalogue default.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  SITE_COPY_SCHEMA,
  SITE_COPY_VOID,
  type SiteCopySection,
} from "@/lib/queries/site-copy";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

function bad(msg: string): ActionState {
  return { ok: false, message: msg };
}

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

function isSection(value: string): value is SiteCopySection {
  return value in SITE_COPY_SCHEMA;
}

/**
 * Save every (field, locale) pair for one section. Blank input → delete
 * (reverts the slot to the JSON fallback). Non-blank → upsert.
 *
 * The form submits all fields for the section at once so we can do the
 * whole thing in one transaction — if an admin updates three fields in four
 * languages, that's 12 rows written/deleted atomically.
 */
export async function saveSectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const section = String(formData.get("section") ?? "");
  if (!section || !isSection(section)) {
    return bad("Unknown section — please reload the page.");
  }

  const fields = SITE_COPY_SCHEMA[section] as readonly string[];
  type Entry = {
    field: string;
    locale: Locale;
    value: string;
  };

  const entries: Entry[] = [];
  for (const field of fields) {
    // Per-field void flag — when ticked we ignore the per-locale text
    // inputs entirely and write the sentinel to all 4 locales. When
    // unticked we fall through to the existing path (text → upsert,
    // empty → delete).
    const voided =
      typeof formData.get(`${field}.__void`) === "string" &&
      formData.get(`${field}.__void`) !== "";
    for (const locale of LOCALES) {
      if (voided) {
        entries.push({ field, locale, value: SITE_COPY_VOID });
      } else {
        const raw = formData.get(`${field}.${locale}`);
        const value = typeof raw === "string" ? raw.trim() : "";
        entries.push({ field, locale, value });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const e of entries) {
      if (e.value.length === 0) {
        await tx.siteCopy.deleteMany({
          where: { section, field: e.field, locale: e.locale },
        });
        continue;
      }
      await tx.siteCopy.upsert({
        where: {
          section_field_locale: {
            section,
            field: e.field,
            locale: e.locale,
          },
        },
        create: {
          section,
          field: e.field,
          locale: e.locale,
          value: e.value,
          updatedBy: user.id,
        },
        update: {
          value: e.value,
          updatedBy: user.id,
        },
      });
    }
  });

  // The copy is rendered inside the locale layout, so revalidating the root
  // layout refreshes every public page in one shot. Also bust the cache tag
  // so any future unstable_cache(getSiteCopy) wrapper picks up changes.
  revalidatePath("/admin/homepage");
  revalidatePath(`/admin/homepage/${section}`);
  revalidatePath("/", "layout");
  revalidateTag("site-copy");

  return OK_SAVED;
}
