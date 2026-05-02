// ─────────────────────────────────────────────────────────────────────────
// GiftCardCodesField — paste 1+ gift card codes at checkout.
//
// Each code becomes a chip with its current balance after the server
// validates it. The summed balance is exposed via the `onBalanceChange`
// callback so the order-summary panel can preview a lower grandTotal in
// real time. The codes themselves ride along on the form via a hidden
// `giftCardCodes` field (newline-separated — no commas in GIFT- codes).
//
// **Account disclaimer.**
//   Gift cards are bearer tokens — the balance lives on the code, not on
//   the customer. If a guest checks out with a gift card and there's
//   change left, they have nothing to hold onto except the original
//   email. A registered customer sees the leftover on /account/gift-cards
//   automatically (because recipientEmail is theirs).
//
//   This component renders a loud warning for guests and a calm note for
//   logged-in customers. The policy comes through the props — the API
//   doesn't block guest redemption (would be too aggressive), it just
//   educates them.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Info, Plus, X } from "lucide-react";
import { lookupGiftCardAction } from "@/app/[locale]/checkout/gift-card-actions";
import { cn, formatEur } from "@/lib/utils";

type Chip = {
  code: string;
  giftCardId: string;
  balanceEur: number;
};

type Props = {
  /** True when a customer profile is attached (i.e. signed in). */
  isLoggedIn: boolean;
  /** Currency formatting locale, e.g. "nl-BE". */
  currencyLocale: string;
  /**
   * Live total of validated gift card balances. The checkout page subtracts
   * this from the previewed grandTotal. Capped on the server too.
   */
  onBalanceChange?: (totalEur: number) => void;
};

export function GiftCardCodesField({
  isLoggedIn,
  currencyLocale,
  onBalanceChange,
}: Props) {
  const t = useTranslations("gift_card.checkout");
  const [chips, setChips] = useState<Chip[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const totalBalance = chips.reduce((s, c) => s + c.balanceEur, 0);

  // Update sibling state in the parent so the totals card can preview the
  // applied amount. We do this lazily on chip mutations rather than on every
  // keystroke.
  const broadcast = (next: Chip[]) => {
    const sum = next.reduce((s, c) => s + c.balanceEur, 0);
    onBalanceChange?.(sum);
  };

  const tryAddCode = () => {
    const code = draft.trim().toUpperCase();
    if (!code) return;
    if (chips.some((c) => c.code === code)) {
      setErrorReason("duplicate");
      return;
    }
    setErrorReason(null);
    startTransition(async () => {
      const res = await lookupGiftCardAction(code);
      if (!res.ok) {
        setErrorReason(res.reason);
        return;
      }
      const next = [
        ...chips,
        { code: res.code, giftCardId: res.giftCardId, balanceEur: res.balanceEur },
      ];
      setChips(next);
      broadcast(next);
      setDraft("");
    });
  };

  const removeChip = (code: string) => {
    const next = chips.filter((c) => c.code !== code);
    setChips(next);
    broadcast(next);
  };

  // Submit on Enter without submitting the parent form.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryAddCode();
    }
  };

  return (
    <div>
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_label")}
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setDraft(e.target.value.toUpperCase().slice(0, 24))
            }
            onKeyDown={handleKeyDown}
            placeholder={t("field_placeholder")}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            className="flex-1 border border-ink/15 bg-white/50 px-4 py-3 font-mono text-[13px] tracking-wide text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={tryAddCode}
            disabled={!draft.trim() || isPending}
            className={cn(
              "flex items-center gap-2 border px-4 py-3 text-[12px] uppercase tracking-label transition-colors",
              !draft.trim() || isPending
                ? "cursor-not-allowed border-ink/15 text-ink-mid"
                : "border-ink bg-ink text-rice hover:bg-vermilion hover:border-vermilion",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("apply_label")}
          </button>
        </div>
      </label>

      {/* ── inline error ──────────────────────────────────────────── */}
      {errorReason && (
        <p className="mt-2 text-[12px] text-vermilion">
          {t(`error_${errorReason}`)}
        </p>
      )}

      {/* ── applied codes ─────────────────────────────────────────── */}
      {chips.length > 0 && (
        <ul className="mt-3 space-y-2">
          {chips.map((c) => (
            <li
              key={c.code}
              className="flex items-center justify-between border border-sage/40 bg-sage/10 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-sage" />
                <span className="font-mono text-[12px] tracking-wide text-ink">
                  {c.code}
                </span>
                <span className="text-[11px] uppercase tracking-label text-ink-mid">
                  · {formatEur(c.balanceEur, currencyLocale)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeChip(c.code)}
                aria-label={t("remove_label")}
                className="text-ink-mid transition-colors hover:text-vermilion"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}

          {/* Submitted via the parent form — newline-separated. */}
          <input
            type="hidden"
            name="giftCardCodes"
            value={chips.map((c) => c.code).join("\n")}
          />
          <input
            type="hidden"
            name="giftCardBalanceEur"
            value={totalBalance.toFixed(2)}
          />
        </ul>
      )}

      {/* ── account disclaimer ────────────────────────────────────── */}
      {isLoggedIn ? (
        <div className="mt-3 flex items-start gap-2 border border-ink/10 bg-rice-dim/40 px-3 py-2 text-[12px] text-ink-mid">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("disclaimer_member")}</span>
        </div>
      ) : (
        <div className="mt-3 border-l-2 border-vermilion bg-vermilion/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-vermilion" />
            <div className="text-[13px] leading-relaxed text-ink">
              <strong className="font-display">
                {t("disclaimer_guest_heading")}
              </strong>
              <p className="mt-1 text-[12px] text-ink-mid">
                {t("disclaimer_guest_body")}
              </p>
              <a
                href="/account/sign-in?redirectTo=/checkout"
                className="mt-2 inline-block text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4 hover:text-vermilion"
              >
                {t("disclaimer_guest_cta")}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
