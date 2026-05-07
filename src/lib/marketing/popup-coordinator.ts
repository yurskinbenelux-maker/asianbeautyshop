// ─────────────────────────────────────────────────────────────────────────
// Popup coordinator — keeps the on-load popups from talking over each
// other. The chain is:
//
//   welcome → hero → quiz
//
// Each popup awaits the previous one's "finished" signal before its own
// delay timer starts. "Finished" means any of: closed by the user, CTA
// clicked, suppressed (signed-in / route blocklist / cookie window /
// disabled by Sofia).
//
// We can't poll DOM state because the three popups are independent React
// trees, so we use a tiny Promise handshake at module scope. Each stage
// has its own resolved-flag + lazy promise:
//
//   welcomeFinished  ← first to fire
//   heroFinished     ← awaits welcomeFinished, then its own timer
//   (quiz)           ← awaits heroFinished, then its own timer
//
// Module-scoped state lives for the lifetime of the page session, which
// is exactly what we want — once a stage is done, downstream popups
// resolve immediately and never re-coordinate. Promises are created
// lazily (first caller wins) so import order doesn't matter.
//
// Server-render safety: only touches plain JS. No window/localStorage
// access. Each popup handles SSR-vs-client gating itself.
// ─────────────────────────────────────────────────────────────────────────

type Stage = {
  resolved: boolean;
  resolveFn: (() => void) | null;
  promise: Promise<void> | null;
};

function makeStage(): Stage {
  return { resolved: false, resolveFn: null, promise: null };
}

const welcome = makeStage();
const hero = makeStage();

function ensurePromise(stage: Stage): Promise<void> {
  if (stage.promise) return stage.promise;
  stage.promise = new Promise<void>((resolve) => {
    if (stage.resolved) {
      resolve();
      return;
    }
    stage.resolveFn = resolve;
  });
  return stage.promise;
}

function markFinished(stage: Stage): void {
  if (stage.resolved) return;
  stage.resolved = true;
  if (stage.resolveFn) {
    stage.resolveFn();
    stage.resolveFn = null;
  }
}

// ────────── welcome ───────────────────────────────────────────────────

/** Welcome popup calls this on every exit path: close, CTA, Escape, or
 *  any of its bail-out reasons (signed in, route blocked, suppression
 *  cookie). Idempotent. */
export function markWelcomeFinished(): void {
  markFinished(welcome);
}

/** Hero popup awaits this before starting its own delay timer.
 *  Resolves the moment the welcome popup signals it's done (or
 *  immediately if welcome already finished by the time hero mounts). */
export function awaitWelcomeFinished(): Promise<void> {
  return ensurePromise(welcome);
}

// ────────── hero ──────────────────────────────────────────────────────

/** Hero popup calls this on every exit path: close, product click,
 *  Escape, or its bail-out reasons (disabled, no products, route
 *  blocked). Idempotent. */
export function markHeroFinished(): void {
  markFinished(hero);
}

/** Quiz popup awaits this before starting its own delay timer.
 *  Resolves the moment the hero popup signals it's done. */
export function awaitHeroFinished(): Promise<void> {
  return ensurePromise(hero);
}
