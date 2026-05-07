// ─────────────────────────────────────────────────────────────────────────
// /admin/contact/[id] — single inbound message.
//
// The header shows From / subject / date, the body preserves the
// customer's newlines, and the action rail exposes:
//   · Reply        → mailto: with the message quoted, flips to REPLIED
//   · Mark as read / replied / archived  → status toggles
//
// Opening the page implicitly marks NEW → READ so the sidebar badge
// is accurate even if an admin doesn't click anything.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, User as UserIcon } from "lucide-react";
import { ContactStatus, ContactSubject } from "@prisma/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import {
  markAsReadIfNew,
  openReplyInMailClient,
  setContactStatus,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ContactStatus, string> = {
  NEW: "New",
  READ: "Read",
  REPLIED: "Replied",
  ARCHIVED: "Archived",
};

const SUBJECT_LABEL: Record<ContactSubject, string> = {
  GENERAL: "General enquiry",
  ORDER: "Order enquiry",
  RETURN: "Return / refund",
  WHOLESALE: "Wholesale / press",
  TECHNICAL: "Technical / account",
};

type Props = { params: Promise<{ id: string }> };

export default async function AdminContactDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const msg = await prisma.contactMessage.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          orders: { select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!msg) notFound();

  // Best-effort NEW → READ on open so the unread badge stays accurate.
  // This intentionally runs AFTER we've rendered the row so we still
  // show the "New" chip on first visit.
  if (msg.status === ContactStatus.NEW) {
    await markAsReadIfNew(id);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      {/* breadcrumb */}
      <Link
        href="/admin/contact"
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Messages
      </Link>

      {/* masthead */}
      <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">
            {SUBJECT_LABEL[msg.subject]}
          </div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            {msg.name}
          </h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            <a
              href={`mailto:${msg.email}`}
              className="underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
            >
              {msg.email}
            </a>
            {" · "}
            {msg.createdAt.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            {msg.locale}
          </p>
        </div>

        <StatusBadge status={msg.status} />
      </header>

      <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
        {/* body */}
        <article className="border border-ink/10 bg-white/60 p-8">
          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
            {msg.message}
          </div>
        </article>

        {/* rail */}
        <aside className="space-y-6">
          {/* action buttons */}
          <div className="border border-ink/10 bg-white/60 p-5">
            <div className="eyebrow">Actions</div>
            <div className="mt-4 space-y-2">
              {/* Reply → mailto + flip to REPLIED */}
              <form action={openReplyInMailClient}>
                <input type="hidden" name="id" value={msg.id} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Reply in mail client
                </button>
              </form>

              {/* secondary status toggles */}
              {msg.status !== ContactStatus.READ && (
                <StatusButton id={msg.id} next="READ" label="Mark as read" />
              )}
              {msg.status !== ContactStatus.REPLIED && (
                <StatusButton
                  id={msg.id}
                  next="REPLIED"
                  label="Mark as replied"
                />
              )}
              {msg.status !== ContactStatus.ARCHIVED ? (
                <StatusButton id={msg.id} next="ARCHIVED" label="Archive" />
              ) : (
                <StatusButton
                  id={msg.id}
                  next="READ"
                  label="Restore from archive"
                />
              )}
            </div>
          </div>

          {/* meta */}
          <div className="border border-ink/10 bg-white/60 p-5">
            <div className="eyebrow">Meta</div>
            <dl className="mt-4 space-y-3 text-[12px]">
              <Meta label="Subject">{SUBJECT_LABEL[msg.subject]}</Meta>
              {msg.phone && <Meta label="Phone">{msg.phone}</Meta>}
              {msg.orderNumber && (
                <Meta label="Order ref">
                  <span className="font-mono text-[12px]">{msg.orderNumber}</span>
                </Meta>
              )}
              <Meta label="Locale">{msg.locale}</Meta>
              <Meta label="Notified">
                {msg.notifiedAt
                  ? msg.notifiedAt.toLocaleString("en-GB")
                  : "Not sent"}
              </Meta>
            </dl>
          </div>

          {/* customer link if this was a known account */}
          {msg.user && (
            <div className="border border-ink/10 bg-white/60 p-5">
              <div className="eyebrow">Existing customer</div>
              <Link
                href={`/admin/customers/${msg.user.id}`}
                className="mt-3 inline-flex items-center gap-2 text-[13px] text-ink hover:underline"
              >
                <UserIcon className="h-4 w-4" aria-hidden />
                {[msg.user.firstName, msg.user.lastName]
                  .filter(Boolean)
                  .join(" ") || msg.user.email}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
              {msg.user.orders.length > 0 && (
                <p className="mt-2 text-[11px] text-ink-mid">
                  Has at least one prior order.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ────────── small presentational helpers ─────────────────────────────

function StatusButton({
  id,
  next,
  label,
}: {
  id: string;
  next: ContactStatus;
  label: string;
}) {
  return (
    <form action={setContactStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 border border-ink/15 bg-white/60 px-4 py-2 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-white"
      >
        {label}
      </button>
    </form>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="min-w-[72px] uppercase tracking-label text-ink-mid/80">
        {label}
      </dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: ContactStatus }) {
  const map: Record<ContactStatus, string> = {
    NEW: "bg-vermilion/10 text-vermilion",
    READ: "bg-ink/5 text-ink-mid",
    REPLIED: "bg-gold/15 text-gold",
    ARCHIVED: "bg-ink/5 text-ink-mid/70",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 text-[11px] uppercase tracking-label",
        map[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
