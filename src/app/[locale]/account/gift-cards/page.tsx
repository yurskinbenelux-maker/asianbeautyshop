// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/gift-cards — customer dashboard for gift cards.
//
// Shows two collections:
//   1. Cards I've received (active only — depleted ones go in a tray below)
//   2. Cards I've bought to send to friends — useful for resending the
//      code if the recipient lost the email.
//
// Codes are shown in full because the customer is signed in and the page
// is over HTTPS — same trust boundary as the order detail page.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Gift } from "lucide-react";
import { GiftCardStatus } from "@prisma/client";
import { requireCustomer } from "@/lib/auth";
import { listMyGiftCards } from "@/lib/queries/gift-cards";

type Props = { params: Promise<{ locale: string }> };

export default async function MyGiftCardsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/gift-cards",
  });

  const t = await getTranslations("account");
  const tCard = await getTranslations("gift_card.account");

  const cards = await listMyGiftCards(profile.email);

  // Three buckets the customer cares about:
  //   • active cards I can still spend (recipient = me, balance > 0)
  //   • spent / expired / void cards (recipient = me) — folded
  //   • cards I sent to others — informational
  const myEmail = profile.email.toLowerCase();
  const owned = cards.filter(
    (c) => c.recipientEmail.toLowerCase() === myEmail,
  );
  const sent = cards.filter(
    (c) =>
      c.senderEmail?.toLowerCase() === myEmail &&
      c.recipientEmail.toLowerCase() !== myEmail,
  );

  const ownedActive = owned.filter((c) => c.status === GiftCardStatus.ACTIVE);
  const ownedArchived = owned.filter(
    (c) => c.status !== GiftCardStatus.ACTIVE,
  );

  return (
    <section>
      <div className="eyebrow">{t("eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {tCard("title")}
      </h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
        {tCard("lede")}
      </p>

      <div className="rule my-10" />

      {/* ── nothing yet ──────────────────────────────────────────── */}
      {cards.length === 0 && (
        <div className="border border-dashed border-ink/15 bg-white/60 p-10 text-center">
          <Gift className="mx-auto h-6 w-6 text-ink-mid" aria-hidden />
          <p className="mt-4 text-[14px] text-ink-mid">
            {tCard("empty_lede")}
          </p>
        </div>
      )}

      {/* ── active cards I own ───────────────────────────────────── */}
      {ownedActive.length > 0 && (
        <Section
          heading={tCard("section_owned_active")}
          subhead={tCard("section_owned_active_lede")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {ownedActive.map((c) => (
              <GiftCardTile key={c.id} card={c} />
            ))}
          </div>
        </Section>
      )}

      {/* ── archived ─────────────────────────────────────────────── */}
      {ownedArchived.length > 0 && (
        <Section heading={tCard("section_owned_archived")}>
          <ul className="divide-y divide-ink/10 border-y border-ink/10">
            {ownedArchived.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between py-3 text-[13px]"
              >
                <span className="font-mono text-ink/70">{c.code}</span>
                <span className="text-[11px] uppercase tracking-label text-ink-mid">
                  {tCard(`status_${c.status.toLowerCase()}`)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── cards I sent ─────────────────────────────────────────── */}
      {sent.length > 0 && (
        <Section
          heading={tCard("section_sent")}
          subhead={tCard("section_sent_lede")}
        >
          <ul className="divide-y divide-ink/10 border-y border-ink/10">
            {sent.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 text-[13px]"
              >
                <div>
                  <div className="font-mono text-ink">{c.code}</div>
                  <div className="mt-0.5 text-ink-mid">
                    {tCard("sent_to", {
                      name: c.recipientName ?? c.recipientEmail,
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-[15px] text-ink">
                    {formatEur(c.initialBalanceEur)}
                  </div>
                  <div className="text-[11px] uppercase tracking-label text-ink-mid">
                    {tCard(`status_${c.status.toLowerCase()}`)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function Section({
  heading,
  subhead,
  children,
}: {
  heading: string;
  subhead?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-12">
      <h2 className="font-display text-[22px] leading-tight text-ink">
        {heading}
      </h2>
      {subhead && (
        <p className="mt-2 text-[13px] text-ink-mid">{subhead}</p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function GiftCardTile({
  card,
}: {
  card: import("@/lib/queries/gift-cards").GiftCardListRow;
}) {
  const expiresLabel = card.expiresAt
    ? card.expiresAt.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  return (
    <article className="group border border-ink/10 bg-rice-dim/40 p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            BALANCE
          </div>
          <div className="mt-1 font-display text-[26px] leading-none text-ink">
            {formatEur(card.balanceEur)}
          </div>
          {card.balanceEur < card.initialBalanceEur && (
            <div className="mt-1 text-[11px] text-ink-mid">
              of {formatEur(card.initialBalanceEur)}
            </div>
          )}
        </div>
        {expiresLabel && (
          <div className="text-right text-[11px] text-ink-mid">
            <div className="uppercase tracking-label">expires</div>
            <div className="mt-0.5">{expiresLabel}</div>
          </div>
        )}
      </div>

      <div className="rule my-4" />

      <div className="flex items-center justify-between">
        <code className="select-all font-mono text-[14px] tracking-wide text-ink">
          {card.code}
        </code>
        <span className="text-[10px] uppercase tracking-label text-ink-mid">
          {card.purchaseOrderNumber
            ? `from #${card.purchaseOrderNumber}`
            : ""}
        </span>
      </div>
    </article>
  );
}

// Tiny EUR formatter — keeps the page server-friendly (no client locale).
function formatEur(eur: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(eur);
}
