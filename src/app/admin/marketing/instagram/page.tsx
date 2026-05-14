// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/instagram — Graph API status + cached posts.
//
// Three modes an admin sees on this page:
//   1. NOT CONFIGURED — token field is empty. Section explains the
//      Meta dev steps and shows a "Save & verify" form. No post grid.
//   2. CONFIGURED, NO POSTS YET — token saved but cron hasn't run.
//      Show connection status (green) + "Sync now" button + helper
//      text about the cron schedule.
//   3. CONFIGURED + POSTS CACHED — full status panel + grid of
//      cached posts. Each post has visibility toggle + sort order.
//
// Most fields are read-only because they come from Meta — an admin can
// only toggle visibility / reorder. Editing caption / image /
// permalink would just be overwritten on the next sync.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Instagram,
  Plug,
  RefreshCw,
  Settings as SettingsIcon,
  Unplug,
  XCircle,
} from "lucide-react";

import { requireCapability } from "@/lib/auth-roles";
import { getAllInstagramPosts, isVideoPost, thumbnailFor } from "@/lib/queries/instagram";
import { readIgConfig, readLastSync } from "@/lib/instagram/settings";

import {
  disconnectInstagram,
  saveInstagramConfig,
  syncInstagramNow,
  toggleInstagramTileVisibility,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  saved?: string;
  synced?: string;
  disconnected?: string;
  err?: string;
}>;

export default async function AdminInstagramPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin");
  const sp = await searchParams;
  const [config, lastSync, posts] = await Promise.all([
    readIgConfig(),
    readLastSync(),
    getAllInstagramPosts(),
  ]);

  const isConfigured = !!config;
  const visibleCount = posts.filter((p) => p.isVisible).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/marketing"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to marketing
      </Link>

      <header className="mt-4 mb-10 max-w-3xl">
        <div className="eyebrow">Marketing</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Instagram showcase
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          The polaroid wall below the journal on the homepage pulls
          posts directly from your Instagram account via the Meta Graph
          API. Once connected, a cron job refreshes the cache every few
          hours — you don&apos;t add or edit anything here, you just
          post on Instagram and the homepage catches up automatically.
        </p>
      </header>

      {/* ── Banners ──────────────────────────────────────────── */}
      {sp.saved === "1" && <Banner kind="ok">Saved.</Banner>}
      {sp.disconnected === "1" && (
        <Banner kind="ok">Disconnected. Cached posts kept until next sync.</Banner>
      )}
      {sp.synced && (
        <Banner kind="ok">
          Sync complete. {sp.synced} post{sp.synced === "1" ? "" : "s"}{" "}
          refreshed.
        </Banner>
      )}
      {sp.err && <Banner kind="err">{decodeURIComponent(sp.err)}</Banner>}

      {/* ── Connection state ─────────────────────────────────── */}
      <ConnectionPanel
        config={config}
        lastSync={lastSync}
        cachedCount={posts.length}
        visibleCount={visibleCount}
      />

      {/* ── Configuration form ───────────────────────────────── */}
      {!isConfigured ? (
        <SetupBlock />
      ) : (
        <ConfigBlock
          accessTokenLength={config.accessToken.length}
          igUserId={config.igUserId}
        />
      )}

      {/* ── Cached posts ─────────────────────────────────────── */}
      {posts.length > 0 && (
        <section className="mt-12 border-t border-ink/10 pt-10">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-[18px] text-ink">
                Cached posts ({posts.length})
              </h2>
              <p className="mt-1 text-[12px] text-ink-mid">
                Top {Math.min(visibleCount, 6)} visible posts render on the
                homepage, ordered by sort order then post date.
              </p>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {posts.map((p) => (
              <li
                key={p.id}
                className="group relative aspect-[4/5] overflow-hidden border border-ink/10 bg-ink/5"
              >
                <Image
                  src={thumbnailFor(p)}
                  alt={p.caption?.slice(0, 80) ?? "Instagram post"}
                  fill
                  sizes="240px"
                  unoptimized
                  className={
                    "object-cover transition-opacity " +
                    (p.isVisible ? "" : "opacity-40")
                  }
                />
                {/* Hidden state badge */}
                {!p.isVisible && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 border border-ink/15 bg-white/90 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                    Hidden
                  </span>
                )}
                {/* Video badge */}
                {isVideoPost(p) && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 border border-ink/15 bg-white/90 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                    Video
                  </span>
                )}
                {/* Hover toolbar — visibility toggle + open on IG */}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/85 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <form action={toggleInstagramTileVisibility}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 border border-rice/30 bg-rice/10 px-2 py-1 text-[10px] uppercase tracking-label text-rice hover:bg-rice/20"
                      title={p.isVisible ? "Hide from homepage" : "Show on homepage"}
                    >
                      {p.isVisible ? (
                        <>
                          <EyeOff className="h-3 w-3" /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" /> Show
                        </>
                      )}
                    </button>
                  </form>
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 border border-rice/30 bg-rice/10 px-2 py-1 text-[10px] uppercase tracking-label text-rice hover:bg-rice/20"
                    title="Open on Instagram"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Setup walkthrough (always visible at bottom for reference) ── */}
      <SetupReference />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Connection panel — top of page status display.
// ─────────────────────────────────────────────────────────────────────────

function ConnectionPanel({
  config,
  lastSync,
  cachedCount,
  visibleCount,
}: {
  config: { username?: string; profilePictureUrl?: string; igUserId: string } | null;
  lastSync: { at: string; count: number; error?: string; ok: boolean } | null;
  cachedCount: number;
  visibleCount: number;
}) {
  const isConfigured = !!config;
  const lastSyncOk = lastSync?.ok ?? null;

  return (
    <section className="mb-10 grid gap-3 border border-ink/10 bg-white/60 p-5 md:grid-cols-3">
      {/* Status pill */}
      <div className="flex items-center gap-3 border-r border-ink/0 md:border-ink/10 md:pr-5">
        {!isConfigured ? (
          <>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink/5 text-ink-mid">
              <Unplug className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-label text-ink-mid">
                Status
              </div>
              <div className="text-[14px] text-ink">Not connected</div>
            </div>
          </>
        ) : lastSyncOk === false ? (
          <>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
              <XCircle className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-label text-vermilion">
                Connection error
              </div>
              <div className="line-clamp-1 text-[13px] text-ink">
                {lastSync?.error}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-ink/5 text-ink-mid">
              {config?.profilePictureUrl ? (
                <Image
                  src={config.profilePictureUrl}
                  alt={config.username ?? ""}
                  fill
                  sizes="40px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <Plug className="h-5 w-5 text-sage" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-label text-sage">
                Connected
              </div>
              <div className="truncate text-[14px] text-ink">
                @{config?.username ?? config?.igUserId}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Last sync */}
      <div className="md:px-5 md:border-r md:border-ink/10">
        <div className="text-[10px] uppercase tracking-label text-ink-mid">
          Last sync
        </div>
        <div className="mt-1 text-[14px] text-ink">
          {lastSync ? <RelativeTime iso={lastSync.at} /> : "Never"}
        </div>
        {lastSync?.ok && (
          <div className="text-[11px] text-ink-mid">
            {lastSync.count} post{lastSync.count === 1 ? "" : "s"} refreshed
          </div>
        )}
      </div>

      {/* Cache stats + sync button */}
      <div className="flex items-center justify-between gap-3 md:pl-5">
        <div>
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Cache
          </div>
          <div className="mt-1 text-[14px] text-ink">
            {cachedCount} cached · {visibleCount} visible
          </div>
        </div>
        {isConfigured && (
          <form action={syncInstagramNow}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-rice hover:bg-ink/90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync now
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// "Configured" mode — show what's saved + disconnect button.
// ─────────────────────────────────────────────────────────────────────────

function ConfigBlock({
  accessTokenLength,
  igUserId,
}: {
  accessTokenLength: number;
  igUserId: string;
}) {
  return (
    <section className="border border-ink/10 bg-white/40 p-5">
      <h2 className="flex items-center gap-2 font-display text-[16px] text-ink">
        <SettingsIcon className="h-4 w-4" />
        Connection
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-label text-ink-mid">
            IG Business Account ID
          </dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">{igUserId}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-label text-ink-mid">
            Access token
          </dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">
            ••••••••••••••••••••••••••••••• ({accessTokenLength} chars)
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex items-center gap-2">
        <details className="flex-1">
          <summary className="cursor-pointer text-[11px] uppercase tracking-label text-ink-mid hover:text-ink">
            Replace token
          </summary>
          <div className="mt-3">
            <ConfigForm />
          </div>
        </details>
        <form action={disconnectInstagram}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-vermilion/40 bg-white px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:border-vermilion"
          >
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </form>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Setup block — shown when no config exists. Combines the form +
// brief instructions so an admin (or you) can paste straight in.
// ─────────────────────────────────────────────────────────────────────────

function SetupBlock() {
  return (
    <section className="border border-ink/10 bg-white/40 p-5">
      <h2 className="flex items-center gap-2 font-display text-[16px] text-ink">
        <Plug className="h-4 w-4" />
        Connect Instagram
      </h2>
      <p className="mt-2 text-[12px] text-ink-mid">
        Paste the long-lived access token + IG Business Account ID from
        your Meta developer app. We&apos;ll verify against the Graph API
        before saving — wrong values get rejected instantly.
      </p>
      <div className="mt-4">
        <ConfigForm />
      </div>
    </section>
  );
}

function ConfigForm() {
  return (
    <form action={saveInstagramConfig} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
          Long-lived access token
        </span>
        <input
          type="password"
          name="accessToken"
          required
          minLength={20}
          maxLength={500}
          autoComplete="off"
          placeholder="EAAJ..."
          className="w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          From Meta dev → your app → Tools → Graph API Explorer (60-day token).
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
          IG Business Account ID
        </span>
        <input
          type="text"
          name="igUserId"
          required
          pattern="\d+"
          maxLength={40}
          placeholder="17841400000000000"
          className="w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          A long numeric string. From{" "}
          <code>/{"{page-id}"}?fields=instagram_business_account</code>.
        </span>
      </label>
      <button
        type="submit"
        className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
      >
        Save &amp; verify
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Setup reference — collapsible step-by-step at the bottom of the page.
// Always visible so an admin / Max can re-read it after the initial setup.
// ─────────────────────────────────────────────────────────────────────────

function SetupReference() {
  return (
    <section className="mt-12 border-t border-ink/10 pt-10">
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 font-display text-[16px] text-ink">
          <Info className="h-4 w-4" />
          Setup walkthrough — how to get the token
          <span className="ml-auto text-[11px] uppercase tracking-label text-ink-mid group-open:hidden">
            Show
          </span>
          <span className="ml-auto hidden text-[11px] uppercase tracking-label text-ink-mid group-open:inline">
            Hide
          </span>
        </summary>
        <ol className="mt-5 space-y-4 text-[13px] leading-relaxed text-ink">
          <Step n={1}>
            <strong>Convert IG to Business / Creator</strong> — in the
            Instagram app, Settings → Account → Switch to professional
            account. Pick &quot;Creator&quot; or &quot;Business&quot;.
          </Step>
          <Step n={2}>
            <strong>Create a Facebook Page</strong> at{" "}
            <a
              href="https://www.facebook.com/pages/create"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-vermilion underline-offset-2"
            >
              facebook.com/pages/create
            </a>
            . Any name; you don&apos;t need to publish anything to it.
          </Step>
          <Step n={3}>
            <strong>Link IG to the Page</strong> — in the Page settings,
            Linked accounts → Connect Instagram.
          </Step>
          <Step n={4}>
            <strong>Create a Meta dev app</strong> at{" "}
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-vermilion underline-offset-2"
            >
              developers.facebook.com/apps
            </a>
            . App type: Business. Add the &quot;Instagram&quot; product.
          </Step>
          <Step n={5}>
            <strong>Generate a token</strong> in Tools → Graph API
            Explorer. Pick your app + your Page, request the scopes{" "}
            <code>instagram_basic</code> and <code>pages_show_list</code>.
            Click &quot;Generate Access Token&quot; — that&apos;s a short
            token; click the info icon → &quot;Open in Access Token
            Tool&quot; → &quot;Extend&quot; to get the 60-day version.
          </Step>
          <Step n={6}>
            <strong>Find the IG Business Account ID</strong> — in Graph
            API Explorer, query:{" "}
            <code>{`/{your-page-id}?fields=instagram_business_account`}</code>
            . The numeric <code>id</code> in the response is what goes in
            the form above.
          </Step>
          <Step n={7}>
            <strong>Paste both values above + click Save &amp; verify</strong>.
            We&apos;ll hit the Graph API to confirm and surface any error
            (wrong scopes, expired token, etc.).
          </Step>
          <Step n={8}>
            <strong>Set up the cron</strong> — at{" "}
            <a
              href="https://cron-job.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-vermilion underline-offset-2"
            >
              cron-job.org
            </a>{" "}
            create a new job:
            <pre className="mt-2 overflow-x-auto bg-ink/5 p-3 font-mono text-[11px] text-ink">
{`URL:      https://asianbeautyshop.eu/api/cron/instagram-sync
Schedule: every 4 hours
Header:   Authorization: Bearer <your CRON_SECRET>`}
            </pre>
          </Step>
          <Step n={9}>
            <strong>Refresh tokens before they expire</strong> — long-lived
            tokens last 60 days. Set a calendar reminder for day 50: come
            back here, click &quot;Replace token&quot; under Connection,
            and paste a fresh one. (We have the API client to auto-refresh
            but it&apos;s not wired into a cron yet — add that when needed.)
          </Step>
        </ol>
        <p className="mt-6 rounded border border-gold/30 bg-gold/5 p-4 text-[12px] leading-relaxed text-ink-mid">
          <Instagram className="mr-2 inline-block h-3.5 w-3.5 text-vermilion" />
          <strong className="text-ink">Until the token is configured</strong>,
          the homepage section self-hides — visitors see no &quot;Join
          us on Instagram&quot; row at all. Safe to ship; nothing breaks.
        </p>
      </details>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink text-[11px] text-rice">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "ok" | "err";
  children: React.ReactNode;
}) {
  const ok = kind === "ok";
  return (
    <div
      className={
        "mb-6 inline-flex items-start gap-2 border px-3 py-2 text-[12px] " +
        (ok
          ? "border-sage/40 bg-sage/10 text-sage"
          : "border-vermilion/40 bg-vermilion/10 text-vermilion")
      }
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const then = new Date(iso);
  const now = new Date();
  const diff = Math.max(0, now.getTime() - then.getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return <>just now</>;
  if (mins < 60) return <>{mins} min ago</>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <>{hrs}h ago</>;
  const days = Math.floor(hrs / 24);
  return <>{days}d ago</>;
}
