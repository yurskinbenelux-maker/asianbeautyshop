// ─────────────────────────────────────────────────────────────────────────
// Localised error boundary — shown when a server component below the
// [locale] segment throws at runtime. Must be a Client Component per
// Next.js.
//
// Why this layer exists:
//   · The root `global-error.tsx` is a catch-all that ships its own
//     <html>/<body> because the root layout is a passthrough.
//   · This localised boundary sits inside the locale layout, so Nav,
//     Footer, and NextIntl context are all available. That means we can
//     use `useTranslations` and keep the editorial shell intact.
//
// The `reset()` callback Next.js gives us re-attempts the render. We
// surface it as an in-editorial "Try again" underline link.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

/** Detects Next.js / webpack "stale bundle" errors. When the user has an
 *  old JS bundle loaded and we ship a new deploy, the old chunk filenames
 *  no longer exist on the server. Any client-side navigation that tries
 *  to load a route-level chunk hits a 404 and throws ChunkLoadError. The
 *  fix is to force a full page reload — the fresh HTML references the
 *  CURRENT chunk hashes so the next navigation succeeds. */
function isStaleBundleError(error: Error): boolean {
  if (error.name === "ChunkLoadError") return true;
  const msg = error.message ?? "";
  return (
    /Loading chunk \d+ failed/i.test(msg) ||
    /Loading CSS chunk \d+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

// Guards against an infinite reload loop if the chunk genuinely is gone
// even after refresh (server-side issue, not stale-bundle). Stored in
// sessionStorage so it resets on tab close.
const RELOAD_GUARD_KEY = "abs.error.reloadOnce";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error500");

  useEffect(() => {
    // Surface the stack for the server log so the cause is grep-able.
    // eslint-disable-next-line no-console
    console.error("[locale-error]", error);

    // Stale-bundle recovery — most common cause of error.tsx firing in
    // production during an active deploy window. Reload once to pick up
    // the new HTML+chunks; if we end up here AGAIN after the reload,
    // fall through to the friendly UI so we don't loop forever.
    if (isStaleBundleError(error) && typeof window !== "undefined") {
      if (!window.sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
        window.location.reload();
        return;
      }
      console.error(
        "[locale-error] chunk error survived a reload — not looping; rendering UI",
      );
    }
  }, [error]);

  return (
    <section className="container grid min-h-[calc(100vh-10rem)] place-items-center py-24">
      <div className="w-full max-w-[54ch] text-center">
        <div className="eyebrow">500</div>
        <h1 className="mt-6 font-display text-[40px] leading-[1.08] text-ink md:text-[52px]">
          {t("title")}
        </h1>
        <p className="mt-6 text-[15px] leading-relaxed text-ink-mid">
          {t("lede")}
        </p>

        {/* Show digest + message so we can correlate with server logs.
         *  Originally dev-only, but Hostinger Business doesn't expose
         *  runtime logs over MCP — without surfacing the error here we
         *  have no way to diagnose 500s from a customer report.
         *  Safe to show: digest is a non-secret correlation hash, and
         *  Next.js redacts the actual stack/message in production by
         *  default (replaces with "An error occurred"). The .message we
         *  see here is therefore already the sanitized one.
         *
         *  break-all on the <p> so a long URL in the error message
         *  (e.g. a chunk-loading URL) wraps cleanly on mobile instead
         *  of pushing the viewport wider than the screen. */}
        {error.digest && (
          <p className="mt-4 break-all font-mono text-[11px] text-ink-mid/70">
            digest: {error.digest}
          </p>
        )}
        {error.message && (
          <p className="mt-2 break-all font-mono text-[11px] text-ink-mid/70">
            {error.message}
          </p>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <button
            type="button"
            onClick={() => reset()}
            className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
          >
            {t("cta_retry")}
          </button>
          <Link
            href="/"
            className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
          >
            {t("cta_home")}
          </Link>
          <Link
            href="/contact"
            className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
          >
            {t("cta_contact")}
          </Link>
        </div>

      </div>
    </section>
  );
}
