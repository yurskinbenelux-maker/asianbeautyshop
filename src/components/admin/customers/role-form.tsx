// ─────────────────────────────────────────────────────────────────────────
// Role selector: CUSTOMER / STAFF / ADMIN. One submit per change.
// Admin's own row is refused server-side so no client lockouts.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Role } from "@prisma/client";
import {
  updateCustomerRoleAction,
  type ActionState,
} from "@/app/admin/customers/actions";

const INITIAL: ActionState = { ok: false };

export function RoleForm({
  userId,
  currentRole,
  selfEditLocked,
}: {
  userId: string;
  currentRole: Role;
  selfEditLocked?: boolean;
}) {
  const [state, action] = useActionState(updateCustomerRoleAction, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={currentRole}
        disabled={selfEditLocked}
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {Object.values(Role).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {selfEditLocked ? (
        <p className="text-[11px] text-ink-mid">
          You can't change your own role from here — ask another admin.
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <SubmitButton>Update role</SubmitButton>
          {state.message && (
            <span
              className={
                "inline-flex items-center gap-1.5 text-[12px] " +
                (state.ok ? "text-sage" : "text-vermilion")
              }
              role="status"
              aria-live="polite"
            >
              {state.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {state.message}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink/20 px-3 py-2 text-[11px] uppercase tracking-label text-ink hover:border-ink hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
