// ─────────────────────────────────────────────────────────────────────────
// /admin/contact — inbound contact messages.
//
// Server component, URL-driven filters:
//   ?status=NEW|READ|REPLIED|ARCHIVED  (default: all but ARCHIVED)
//   ?subject=GENERAL|ORDER|…
//   ?q=…                                free-text search (name / email / body)
//
// Rows link to /admin/contact/[id] for the full message.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Search } from "lucide-react";
import { ContactStatus, ContactSubject, Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Messages · Admin",
};

const STATUS_LABEL: Record<ContactStatus, string> = {
  NEW: "New",
  READ: "Read",
  REPLIED: "Replied",
  ARCHIVED: "Archived",
};

const SUBJECT_LABEL: Record<ContactSubject, string> = {
  GENERAL: "General",
  ORDER: "Order",
  RETURN: "Return",
  WHOLESALE: "Wholesale",
  TECHNICAL: "Technical",
};

type SearchParams = Promise<{
  status?: string;
  subject?: string;
  q?: string;
}>;

export default async function AdminContactListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const status = isStatus(sp.status) ? sp.status : undefined;
  const subject = isSubject(sp.subject) ? sp.subject : undefined;
  const q = sp.q?.trim() || undefined;

  // Default view hides archived. Pass ?status=ARCHIVED to see them.
  const where: Prisma.ContactMessageWhereInput = {
    ...(status
      ? { status }
      : { status: { not: ContactStatus.ARCHIVED } }),
    ...(subject ? { subject } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { message: { contains: q, mode: "insensitive" } },
            { orderNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, counts] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        status: true,
        message: true,
        locale: true,
        createdAt: true,
      },
    }),
    prisma.contactMessage.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = new Map<ContactStatus, number>();
  for (const c of counts) countByStatus.set(c.status, c._count._all);
  const totalOpen =
    (countByStatus.get("NEW") ?? 0) + (countByStatus.get("READ") ?? 0);

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      {/* masthead */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Inbox</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Messages
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            {totalOpen} open · {countByStatus.get("NEW") ?? 0} unread ·{" "}
            {countByStatus.get("REPLIED") ?? 0} replied ·{" "}
            {countByStatus.get("ARCHIVED") ?? 0} archived
          </p>
        </div>
      </header>

      {/* filters */}
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-6">
        <form method="get" className="relative flex-1 max-w-sm">
          {status && <input type="hidden" name="status" value={status} />}
          {subject && <input type="hidden" name="subject" value={subject} />}
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid" />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, email, or text"
            className="w-full border border-ink/15 bg-white py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </form>

        <div className="flex flex-wrap items-center gap-1 text-[11px] uppercase tracking-label">
          <Pill
            label={`All · ${totalOpen + (countByStatus.get("REPLIED") ?? 0)}`}
            href={buildHref({ subject, q })}
            active={!status}
          />
          <Pill
            label={`New · ${countByStatus.get("NEW") ?? 0}`}
            href={buildHref({ status: "NEW", subject, q })}
            active={status === "NEW"}
          />
          <Pill
            label={`Read · ${countByStatus.get("READ") ?? 0}`}
            href={buildHref({ status: "READ", subject, q })}
            active={status === "READ"}
          />
          <Pill
            label={`Replied · ${countByStatus.get("REPLIED") ?? 0}`}
            href={buildHref({ status: "REPLIED", subject, q })}
            active={status === "REPLIED"}
          />
          <Pill
            label={`Archived · ${countByStatus.get("ARCHIVED") ?? 0}`}
            href={buildHref({ status: "ARCHIVED", subject, q })}
            active={status === "ARCHIVED"}
          />
        </div>
      </div>

      {/* table */}
      <div className="mt-6 border border-ink/10 bg-white/60">
        {rows.length === 0 ? (
          <EmptyState hasFilters={Boolean(status || subject || q)} />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <Th className="w-[26%]">From</Th>
                <Th className="w-[14%]">Subject</Th>
                <Th className="w-[38%]">Preview</Th>
                <Th className="w-[10%]">Status</Th>
                <Th className="w-[12%]">Received</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]",
                    r.status === "NEW" && "bg-vermilion/[0.04]",
                  )}
                >
                  <Td>
                    <Link
                      href={`/admin/contact/${r.id}`}
                      className="block text-ink hover:underline"
                    >
                      <div className="font-display text-[15px]">
                        {r.name}
                        {r.status === "NEW" && (
                          <span
                            className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-vermilion align-middle"
                            aria-label="unread"
                          />
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-mid">
                        {r.email}
                      </div>
                    </Link>
                  </Td>
                  <Td className="text-ink-mid">{SUBJECT_LABEL[r.subject]}</Td>
                  <Td className="text-ink-mid">
                    <span className="line-clamp-2">{excerpt(r.message, 160)}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-ink-mid">
                    {r.createdAt.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ────────── guards + url helpers ─────────────────────────────────────

function isStatus(v: string | undefined): v is ContactStatus {
  return v === "NEW" || v === "READ" || v === "REPLIED" || v === "ARCHIVED";
}

function isSubject(v: string | undefined): v is ContactSubject {
  return (
    v === "GENERAL" ||
    v === "ORDER" ||
    v === "RETURN" ||
    v === "WHOLESALE" ||
    v === "TECHNICAL"
  );
}

function buildHref(args: {
  status?: ContactStatus;
  subject?: ContactSubject;
  q?: string;
}): string {
  const p = new URLSearchParams();
  if (args.status) p.set("status", args.status);
  if (args.subject) p.set("subject", args.subject);
  if (args.q) p.set("q", args.q);
  const qs = p.toString();
  return qs ? `/admin/contact?${qs}` : "/admin/contact";
}

function excerpt(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

// ────────── small presentational helpers ─────────────────────────────

function Pill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "border px-2.5 py-1 transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3 font-normal", className)}>{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
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
        "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label",
        map[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="font-display text-[22px] text-ink">
        {hasFilters ? "No matches" : "Inbox zero"}
      </div>
      <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
        {hasFilters
          ? "Try clearing the filters."
          : "When customers write in through /contact, their messages land here."}
      </p>
    </div>
  );
}
