// ─────────────────────────────────────────────────────────────────────────
// Popup coordinator — keeps the welcome and quiz popups from talking
// over each other.
//
// The site fires two on-load popups (welcome + quiz) and the quiz one
// must wait for the welcome to be either dismissed by the user OR
// suppressed (signed-in customer, route blocklist, 14-day cookie). We
// can't poll DOM state because both popups are independent React trees,
// so we use a tiny Promise handshake at module scope:
//
//   • Welcome popup calls markWelcomeFinished() on close / skip / never-show.
//   • Quiz popup calls awaitWelcomeFinished() — its scheduling timer
//     starts the moment the promise resolves.
//
// Module-scoped state lives for the lifetime of the page session, which
// is exactly what we want — once welcome is done, the quiz timer fires
// and never has to re-coordinate. The promise is created lazily (first
// caller wins) so import order doesn't matter.
//
// Server-render safety: only touches plain JS. No window/localStorage
// access. The popups themselves handle SSR-vs-client gating.
// ─────────────────────────────────────────────────────────────────────────

let resolved = false;
let resolveFn: (() => void) | null = null;
let promise: Promise<void> | null = null;

function ensurePromise(): Promise<void> {
  if (promise) return promise;
  promise = new Promise<void>((resolve) => {
    if (resolved) {
      // Someone already called markWelcomeFinished() before any awaiter
      // — resolve immediately.
      resolve();
      return;
    }
    resolveFn = resolve;
  });
  return promise;
}

/**
 * Welcome popup calls this when:
 *   · The user clicks the X
 *   · The user clicks the CTA (which navigates away)
 *   · The user presses Escape
 *   · The popup decides not to show at all (signed in, blocklisted route,
 *     14-day suppression cookie still active)
 *
 * Idempotent — second and later calls are no-ops, so the welcome popup
 * can call it from every exit path without bookkeeping.
 */
export function markWelcomeFinished(): void {
  if (resolved) return;
  resolved = true;
  if (resolveFn) {
    resolveFn();
    resolveFn = null;
  }
  // If no one had awaited yet, ensurePromise() will resolve immediately
  // when called later — see the `if (resolved)` check above.
}

/**
 * Quiz popup awaits this before starting its own delay timer. Resolves
 * the moment the welcome popup signals it's done (or immediately if
 * welcome already finished by the time quiz mounts — common when the
 * welcome popup is suppressed).
 */
export function awaitWelcomeFinished(): Promise<void> {
  return ensurePromise();
}
