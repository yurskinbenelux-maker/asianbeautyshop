// ─────────────────────────────────────────────────────────────────────────
// Shared form state for /account/addresses. Kept separate from actions.ts
// because Next 15's "use server" build check rejects any non-async export
// (constants, objects, sync functions) from action files.
// ─────────────────────────────────────────────────────────────────────────

export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_ADDRESS_STATE: ActionState = { ok: false, message: "" };
