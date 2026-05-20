// ─────────────────────────────────────────────────────────────────────────
// Server actions for the /admin/billit dashboard.
//
//   · retryBillitPushAction — manual retry button per row. Re-runs
//     pushInvoiceToBillit / pushCreditNoteToBillit. Safe to spam: the
//     helper's X-Idempotency-Token guarantees Billit dedupes by row UUID,
//     and the in-DB short-circuit catches already-pushed rows.
//
// Both actions are server-only (no client bundle pollution) and gated by
// the OWNER-only billit.retry capability. They run server-side so the
// browser never holds the BILLIT_* env vars.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth-roles";
import {
  pushInvoiceToBillit,
  pushCreditNoteToBillit,
  type PushResult,
} from "@/lib/invoices/billit/push";

export type RetryActionResult =
  | { ok: true; status: PushResult["status"]; message: string }
  | { ok: false; message: string };

export async function retryBillitPushAction(
  kind: "invoice" | "creditNote",
  id: string,
): Promise<RetryActionResult> {
  await requireCapability("billit.retry");

  if (!id || (kind !== "invoice" && kind !== "creditNote")) {
    return { ok: false, message: "Invalid arguments." };
  }

  const result =
    kind === "invoice"
      ? await pushInvoiceToBillit(id)
      : await pushCreditNoteToBillit(id);

  // Revalidate the dashboard so the new status / snapshot shows up after
  // a redirect. We don't await the network call separately — the push
  // helper already persisted everything to the row before returning.
  revalidatePath("/admin/billit");

  if (result.ok) {
    const friendly = friendlyOk(result);
    return { ok: true, status: result.status, message: friendly };
  }
  return { ok: false, message: result.reason };
}

function friendlyOk(result: Extract<PushResult, { ok: true }>): string {
  // Check "skipped" first so TS narrows cleanly: the "pushed" / "already_pushed"
  // variants share one PushResult shape (combined string-literal status), and
  // ruling them out individually doesn't always narrow the union back to the
  // remaining "skipped" variant in strict mode.
  if (result.status === "skipped") {
    return `Skipped: ${result.reason}`;
  }
  if (result.status === "already_pushed") {
    return "Already pushed previously — no change.";
  }
  return `Pushed to Billit (id ${result.billitInvoiceId.slice(0, 8)}…)`;
}
