// ─────────────────────────────────────────────────────────────────────────
// Site-wide Framer Motion configuration.
//
// `reducedMotion="user"` makes every <motion.*> component transparently
// honour the user's `prefers-reduced-motion: reduce` setting — transform
// and opacity animations collapse to an instant state change, but the
// final visual result is identical. This lets us keep one animation
// implementation across the app without per-component guards.
//
// Because MotionConfig writes to React context, the provider must be a
// client component. It's a thin wrapper so it has almost no cost.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
