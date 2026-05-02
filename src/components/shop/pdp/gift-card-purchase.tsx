// ─────────────────────────────────────────────────────────────────────────
// GiftCardPurchase — PDP block for gift-card products.
//
// Replaces the standard ProductPurchase when product.kind === "GIFT_CARD".
// Renders:
//   1. Denomination tabs (€25 / €50 / €100 / €200 / €500)
//   2. Delivery toggle — "For me" vs "For a friend"
//   3. Recipient form (name, email, optional sender name + message),
//      shown only when "For a friend" is selected
//   4. "Add to bag" CTA — disabled until the form is valid
//
// Multi-recipient:
//   The Add CTA always creates a fresh cart line (server-side), even at
//   the same denomination, because gift cards each have unique recipient
//   details. The form resets after a successful add so the customer can
//   queue another card on the same PDP visit.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Check, Mail, Heart } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { cn, formatEur } from "@/lib/utils";
import type { PdpVariant } from "@/lib/queries/pdp";
import type { GiftCardConfig } from "@/lib/gift-cards/types";

type Props = {
  productId: string;
  /** Currency formatting locale, e.g. "nl-BE". */
  currencyLocale: string;
  /** Each variant maps to one denomination (label "€25" etc.). */
  variants: PdpVariant[];
};

export function GiftCardPurchase({
  productId,
  currencyLocale,
  variants,
}: Props) {
  const t = useTranslations("gift_card.pdp");
  const tCart = useTranslations("cart");
  const { addItem } = useCart();
  const [, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // ── form state ────────────────────────────────────────────────────────
  // Default to €50 (the seed marks it `isDefault: true`) when present,
  // otherwise the cheapest option.
  const sortedVariants = [...variants].sort(
    (a, b) => a.priceEur - b.priceEur,
  );
  const initialId =
    sortedVariants.find((v) => v.isDefault)?.id ?? sortedVariants[0]?.id ?? "";

  const [variantId, setVariantId] = useState<string>(initialId);
  const [mode, setMode] = useState<"self" | "friend">("self");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");

  const activeVariant = sortedVariants.find((v) => v.id === variantId) ?? null;

  // Cheap email shape check — full RFC validation lives server-side, this
  // is just the "looks like an email" gate so we don't gray out the CTA on
  // mid-typing strings like "alex@".
  const looksLikeEmail = (s: string): boolean => /\S+@\S+\.\S+/.test(s.trim());

  const isValid = (() => {
    if (!activeVariant) return false;
    if (mode === "self") return true; // server stamps buyer email at checkout
    return (
      recipientName.trim().length > 0 && looksLikeEmail(recipientEmail)
    );
  })();

  const onAdd = () => {
    if (!isValid || !activeVariant) return;
    setIsAdding(true);

    // For "self" we stamp the buyer's email AT CHECKOUT (we don't know it
    // here on the PDP — they may not have a logged-in session). Persist a
    // sentinel sentinel that the order-placement code recognises and
    // rewrites with the buyer's email.
    const config: GiftCardConfig = {
      deliveryMode: mode,
      recipientEmail:
        mode === "friend"
          ? recipientEmail.trim().toLowerCase()
          : "__buyer__",
      recipientName:
        mode === "friend" ? recipientName.trim() : null,
      senderName: senderName.trim() || null,
      message: message.trim() || null,
    };

    startTransition(async () => {
      try {
        await addItem({
          productId,
          variantId: activeVariant.id,
          quantity: 1,
          giftCardConfig: config,
        });
        setJustAdded(true);
        toast.success(tCart("added_toast"));
        // Reset recipient + message so the customer can queue another card
        // for a different friend without re-typing their own preferences.
        if (mode === "friend") {
          setRecipientName("");
          setRecipientEmail("");
          setMessage("");
        }
        window.setTimeout(() => setJustAdded(false), 2000);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : tCart("add_failed"),
        );
      } finally {
        setIsAdding(false);
      }
    });
  };

  return (
    <div>
      {/* ── price row ─────────────────────────────────────────────── */}
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[28px] text-ink">
          {activeVariant
            ? formatEur(activeVariant.priceEur, currencyLocale)
            : "—"}
        </span>
        <span className="text-[12px] uppercase tracking-label text-ink-mid">
          · {t("digital_label")}
        </span>
      </div>

      {/* ── denomination tabs ─────────────────────────────────────── */}
      <fieldset className="mt-8">
        <legend className="mb-3 text-[11px] uppercase tracking-label text-ink-mid">
          {t("denomination_label")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {sortedVariants.map((v) => {
            const active = v.id === variantId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={active}
                className={cn(
                  "min-w-[72px] border px-4 py-2 text-[12px] uppercase tracking-label transition-colors",
                  active
                    ? "border-ink bg-ink text-rice"
                    : "border-ink/20 bg-white text-ink hover:border-ink/40",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── delivery mode toggle ──────────────────────────────────── */}
      <fieldset className="mt-8">
        <legend className="mb-3 text-[11px] uppercase tracking-label text-ink-mid">
          {t("delivery_label")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("self")}
            aria-pressed={mode === "self"}
            className={cn(
              "flex items-center justify-center gap-2 border px-4 py-3 text-[12px] uppercase tracking-label transition-colors",
              mode === "self"
                ? "border-ink bg-ink text-rice"
                : "border-ink/20 bg-white text-ink hover:border-ink/40",
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            {t("delivery_self")}
          </button>
          <button
            type="button"
            onClick={() => setMode("friend")}
            aria-pressed={mode === "friend"}
            className={cn(
              "flex items-center justify-center gap-2 border px-4 py-3 text-[12px] uppercase tracking-label transition-colors",
              mode === "friend"
                ? "border-ink bg-ink text-rice"
                : "border-ink/20 bg-white text-ink hover:border-ink/40",
            )}
          >
            <Heart className="h-3.5 w-3.5" />
            {t("delivery_friend")}
          </button>
        </div>
      </fieldset>

      {/* ── recipient form (friend mode only) ─────────────────────── */}
      {mode === "friend" && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={t("field_recipient_name")}
              value={recipientName}
              onChange={setRecipientName}
              autoComplete="name"
              required
            />
            <Field
              label={t("field_recipient_email")}
              value={recipientEmail}
              onChange={setRecipientEmail}
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <Field
            label={t("field_sender_name")}
            value={senderName}
            onChange={setSenderName}
            placeholder={t("field_sender_placeholder")}
            autoComplete="name"
          />
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
              {t("field_message")}
            </label>
            <textarea
              rows={3}
              maxLength={400}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("field_message_placeholder")}
              className="w-full border border-ink/20 bg-white px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-mid">
              {message.length}/400
            </p>
          </div>
        </div>
      )}

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <div className="mt-8">
        <button
          type="button"
          onClick={onAdd}
          disabled={!isValid || isAdding}
          className={cn(
            "group relative flex w-full items-center justify-center gap-2 px-8 py-4 text-[12px] uppercase tracking-label transition-colors",
            !isValid || isAdding
              ? "cursor-not-allowed bg-ink/40 text-rice/80"
              : "bg-ink text-rice hover:bg-vermilion",
          )}
        >
          {justAdded ? (
            <>
              <Check className="h-4 w-4" />
              {t("added_label")}
            </>
          ) : (
            t("cta_label")
          )}
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-mid">
          {mode === "self" ? t("hint_self") : t("hint_friend")}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email";
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
        {required ? " *" : ""}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        className="w-full border border-ink/20 bg-white px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
      />
    </div>
  );
}
