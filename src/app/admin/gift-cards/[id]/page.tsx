// ─────────────────────────────────────────────────────────────────────────
// /admin/gift-cards/[id] — single gift card detail.
//
// Sections:
//   · Header — code, balance, status pill, issue + expiry dates
//   · Recipient + sender card
//   · Optional gift message
//   · Source order — link to /admin/orders/<id>
//   · Redemption history (orders that drew down the balance)
//   · Actions row — Void (owner only), Resend recipient email (owner only)
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { GiftCardStatus } from "@prisma/client";
import { requireCapability } from "@/lib/auth-roles";
import { hasCapability } from "@/lib/auth-roles-shared";
import { getGiftCard } from "@/lib/queries/gift-cards";
import { formatAdminDate, formatAdminDateTime } from "@/lib/utils/format-date";
import {
  voidGiftCardAction,
  resendGiftCardAction,
} from "../actions";

type Props = { params: Promise<{ id: string }> };

export default async function AdminGiftCardDetailPage({ params }: Props) {
  const { role } = await requireCapability(
    "giftcards.view",
    "/admin/gift-cards",
  );
  const { id } = await params;
  const card = await getGiftCard(id);
  if (!card) notFound();

  const canManage = hasCapability(role, "giftcards.manage");

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      {/* ── crumb ─────────────────────────────────────────────────── */}
      <Link
        href="/admin/gift-cards"
        className="text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        ← Gift cards
      </Link>

      {/* ── header ────────────────────────────────────────────────── */}
      <header className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Code
          </div>
          <h1 className="mt-2 font-mono text-[26px] tracking-wide text-ink">
            {card.code}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-mid">
            <StatusBadge status={card.status} />
            <span>·</span>
            <span>Issued {formatAdminDate(card.createdAt)}</span>
            {card.expiresAt && (
              <>
                <span>·</span>
                <span>Expires {formatAdminDate(card.expiresAt)}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Balance
          </div>
          <div className="mt-1 font-display text-[36px] leading-none text-ink">
            {formatEur(card.balanceEur)}
          </div>
          <div className="mt-1 text-[12px] text-ink-mid">
            of {formatEur(card.initialBalanceEur)} initial
          </div>
        </div>
      </header>

      <div className="rule my-8" />

      {/* ── recipient + sender ────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card heading="Recipient">
          <Field label="Name" value={card.recipientName ?? "—"} />
          <Field label="Email" value={card.recipientEmail} />
        </Card>
        <Card heading="Sender">
          <Field label="Name" value={card.senderName ?? "—"} />
          <Field label="Email" value={card.senderEmail ?? "—"} />
          <Field
            label="Mode"
            value={card.deliveryMode ?? "—"}
          />
        </Card>
      </div>

      {/* ── gift message ──────────────────────────────────────────── */}
      {card.message && (
        <div className="mt-6 border-l-2 border-ink/30 bg-rice-dim/50 px-5 py-4">
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Personal message
          </div>
          <p className="mt-2 whitespace-pre-line text-[14px] italic text-ink">
            {card.message}
          </p>
        </div>
      )}

      {/* ── source order ──────────────────────────────────────────── */}
      {card.purchaseOrderId && (
        <div className="mt-8">
          <h2 className="font-display text-[18px] text-ink">Source</h2>
          <Link
            href={`/admin/orders/${card.purchaseOrderId}`}
            className="mt-2 inline-block text-[13px] text-ink hover:text-vermilion"
          >
            Order {card.purchaseOrderNumber ?? card.purchaseOrderId} →
          </Link>
        </div>
      )}

      {/* ── redemption history ────────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="font-display text-[18px] text-ink">Redemptions</h2>
        {card.redemptions.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-mid">
            Not yet used. The full balance is available.
          </p>
        ) : (
          <div className="mt-4 border border-ink/10">
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
              <thead className="border-b border-ink/10 bg-rice-dim/50 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3 text-right">Amount used</th>
                </tr>
              </thead>
              <tbody>
                {card.redemptions.map((r) => (
                  <tr key={r.id} className="border-b border-ink/5">
                    <td className="px-4 py-3 text-ink-mid">
                      {formatAdminDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${r.orderId}`}
                        className="text-ink hover:text-vermilion"
                      >
                        {r.orderPublicNumber ?? r.orderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink">
                      {formatEur(r.amountUsedEur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>

      {/* ── actions ───────────────────────────────────────────────── */}
      {canManage && (
        <div className="mt-10 border-t border-ink/10 pt-6">
          <h2 className="font-display text-[18px] text-ink">Actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {card.status === GiftCardStatus.ACTIVE && (
              <form action={voidGiftCardAction}>
                <input type="hidden" name="id" value={card.id} />
                <button
                  type="submit"
                  className="border border-vermilion/40 px-4 py-2 text-[12px] uppercase tracking-label text-vermilion hover:bg-vermilion/5"
                >
                  Void this card
                </button>
              </form>
            )}
            <form action={resendGiftCardAction}>
              <input type="hidden" name="id" value={card.id} />
              <button
                type="submit"
                className="border border-ink/20 px-4 py-2 text-[12px] uppercase tracking-label text-ink hover:border-ink"
              >
                Resend recipient email
              </button>
            </form>
          </div>
          <p className="mt-3 text-[11px] text-ink-mid">
            Voiding sets the balance to zero and prevents future redemptions.
            It does NOT refund the buyer — issue a refund on the source order
            separately if needed.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── small bits ─────────────────────────────────────────────────────────

function Card({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ink/10 bg-white/60 p-5">
      <h3 className="font-display text-[14px] uppercase tracking-label text-ink-mid">
        {heading}
      </h3>
      <dl className="mt-3 space-y-2 text-[13px]">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-mid">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: GiftCardStatus }) {
  const palette: Record<GiftCardStatus, string> = {
    ACTIVE: "bg-sage/30 text-ink",
    DEPLETED: "bg-ink/10 text-ink-mid",
    EXPIRED: "bg-ink/10 text-ink-mid",
    VOID: "bg-vermilion/15 text-vermilion",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-label ${palette[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function formatEur(eur: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(eur);
}
