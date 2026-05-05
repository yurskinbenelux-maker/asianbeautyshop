"use client";

// ─────────────────────────────────────────────────────────────────────────
// LoyaltySettingsForm — client form using useActionState so the success
// flash + per-field error can render without a navigation. The action
// itself is server-side (settings/actions.ts).
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import type { LoyaltySettings } from "@prisma/client";
import { saveLoyaltySettingsAction } from "./actions";

type State = { ok: boolean; message?: string };

async function submit(_prev: State, formData: FormData): Promise<State> {
  return saveLoyaltySettingsAction(formData);
}

export function LoyaltySettingsForm({ initial }: { initial: LoyaltySettings }) {
  const [state, action, pending] = useActionState<State, FormData>(submit, {
    ok: false,
  });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) {
      setFlash(state.message ?? "Saved.");
      const t = setTimeout(() => setFlash(null), 2400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={action} className="mt-8 space-y-10">
      <FieldGroup
        title="Master switch"
        body="Pause the programme without losing balances. Customers won't see the drawer entry while it's off."
      >
        <Toggle
          name="isProgramActive"
          label="Programme active"
          defaultChecked={initial.isProgramActive}
        />
      </FieldGroup>

      <FieldGroup
        title="Earning rules"
        body="How customers accrue points from orders + life events."
      >
        <NumberField
          name="pointsPerEur"
          label="Points per €1 spent"
          defaultValue={initial.pointsPerEur}
          help="Awarded on the order subtotal (excludes shipping + tax). Whole numbers only."
        />
        <NumberField
          name="birthdayPoints"
          label="Birthday bonus (points)"
          defaultValue={initial.birthdayPoints}
          help="Awarded once per calendar year when the daily cron sees the customer's DoB."
        />
      </FieldGroup>

      <FieldGroup
        title="Milestones"
        body="Bonus points every Nth paid order. Disable to remove the milestone block from the customer drawer."
      >
        <Toggle
          name="milestoneEnabled"
          label="Milestones enabled"
          defaultChecked={initial.milestoneEnabled}
        />
        <NumberField
          name="milestoneOrders"
          label="Award after this many paid orders"
          defaultValue={initial.milestoneOrders}
          min={1}
          help="E.g. 5 = customer earns the bonus on every 5th paid order."
        />
        <NumberField
          name="milestonePoints"
          label="Milestone bonus (points)"
          defaultValue={initial.milestonePoints}
        />
      </FieldGroup>

      <FieldGroup
        title="Referral programme"
        body="What the inviter and the new friend each receive. Coupons cannot stack on the same cart — they encourage a second visit."
      >
        <NumberField
          name="referrerBonus"
          label="Referrer bonus (points)"
          defaultValue={initial.referrerBonus}
          help="Awarded the moment the friend's first order is paid."
        />
        <NumberField
          name="refereeCouponPercent"
          label="Friend's bonus coupon (%)"
          defaultValue={initial.refereeCouponPercent}
          min={0}
          max={99}
          help="Issued separately from the welcome 10% — visible in the friend's account, used on a different cart."
        />
      </FieldGroup>

      <FieldGroup
        title="Expiry + housekeeping"
        body="When points + coupons quietly expire, and how far in advance we email a reminder."
      >
        <NumberField
          name="pointsExpiryMonths"
          label="Points expiry (months, blank = never)"
          defaultValue={initial.pointsExpiryMonths ?? ""}
          allowBlank
          min={0}
        />
        <NumberField
          name="couponExpiryReminderDays"
          label="Coupon-expiry reminder (days before)"
          defaultValue={initial.couponExpiryReminderDays}
          min={0}
          help="0 disables the reminder cron."
        />
      </FieldGroup>

      <div className="flex items-center justify-between border-t border-ink/10 pt-6">
        <div className="text-[12px] text-ink-mid">
          {flash ? (
            <span className="text-sage">{flash}</span>
          ) : state.message && !state.ok ? (
            <span className="text-vermilion">{state.message}</span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

// ─── shared field components ─────────────────────────────────────────────

function FieldGroup({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-[10px] uppercase tracking-label text-ink-mid">
        {title}
      </legend>
      {body ? <p className="text-[13px] text-ink-mid">{body}</p> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  help,
  min = 0,
  max,
  allowBlank,
}: {
  name: string;
  label: string;
  defaultValue: number | string;
  help?: string;
  min?: number;
  max?: number;
  allowBlank?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[12px] text-ink">{label}</div>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        required={!allowBlank}
        className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink focus:border-vermilion focus:outline-none"
      />
      {help ? (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-mid">{help}</p>
      ) : null}
    </label>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  // Native checkbox; submitted only when checked → server action coerces
  // the absence to false. Keeps wire format trivial.
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 border-ink/30 accent-vermilion"
      />
      {label}
    </label>
  );
}
