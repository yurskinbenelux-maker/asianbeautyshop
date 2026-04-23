// ─────────────────────────────────────────────────────────────────────────
// Form state types for the customer return submission.
//
// Kept separate from actions.ts because:
//   · `"use server"` files may only export async functions.
//   · Shared types need to be importable from both server and client.
// ─────────────────────────────────────────────────────────────────────────

export type ReturnFormState = {
  ok: boolean;
  /** A short code (translated client-side) or empty when not set yet. */
  errorCode:
    | ""
    | "invalid_order"
    | "no_items"
    | "quantity_exceeds"
    | "invalid_reason"
    | "server_error"
    | "order_not_returnable";
  /** Optional field-level issues for fine-grained UI feedback. */
  fieldErrors?: Record<string, string>;
  /** Public reference minted on success — the page redirects on this. */
  createdReference?: string;
};

export const INITIAL_RETURN_FORM_STATE: ReturnFormState = {
  ok: false,
  errorCode: "",
};
