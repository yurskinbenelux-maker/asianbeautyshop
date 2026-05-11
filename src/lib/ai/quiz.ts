// ─────────────────────────────────────────────────────────────────────────
// Rule-based skin quiz (Layer 1) — V2.
//
// Replaces the previous 5-question quiz with a 7-question flow that
// reads more like a dermatologist intake:
//
//   Q1 skinType (single)         — dry / combo / oily / sensitive / normal
//   Q2 primaryConcern (single)   — the one thing they'd fix tomorrow
//   Q3 secondaryConcerns (MULTI) — chip set, "anything else on your mind"
//   Q4 reactivity (single)       — how often skin reacts; bumps sensitive
//   Q5 sunExposure (single)      — drives whether SPF is in the ritual
//   Q6 ageBand (single)          — informs ageing/firmness weighting +
//                                   product-line preference (Yu.R PRO etc.)
//   Q7 ritualDepth (single)      — how many steps to surface
//
// Why we dropped budget: the catalogue is small enough that the cheapest
// vs most expensive cleanser are €15 apart — filtering by budget mostly
// hides products instead of helping. an admin preferred to surface the right
// products and let the customer decide.
//
// Scoring is ingredient-driven (see catalog.ts) because none of the
// imported products carry skinType/concern slugs in the DB — but every
// product has its full INCI list. Reading INCI is exactly how a derm
// would match a product to a concern.
//
// The question TEXT is translated via next-intl (concierge.quiz.*) so
// copy stays editable without touching this file.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import type { RitualPick, ConcernKey, QuizBrief } from "./catalog";
import { buildRitual, deriveLinePreference } from "./catalog";

// ──────── Question schema ───────────────────────────────────────────────

export type QuizOption = {
  // Stable identifier — used in translations and on the wire.
  id: string;
};

export type QuizQuestion = {
  id: string;
  options: QuizOption[];
  // True for Q3 — the "anything else?" chip multi-select.
  multi?: boolean;
};

// ──────── The actual quiz ───────────────────────────────────────────────

export const QUIZ: ReadonlyArray<QuizQuestion> = [
  // Q1 — what's your skin type day to day?
  {
    id: "skinType",
    options: [
      { id: "dry" },
      { id: "combo" },
      { id: "oily" },
      { id: "sensitive" },
      { id: "normal" },
    ],
  },

  // Q2 — your number-one concern? (single)
  {
    id: "primaryConcern",
    options: [
      { id: "hydration" },
      { id: "dullness" },
      { id: "acne" },
      { id: "fine-lines" },
      { id: "dark-spots" },
      { id: "pores" },
      { id: "redness" },
    ],
  },

  // Q3 — anything else on your mind? (MULTI)
  // Pure secondary concerns; lighter weight than the primary in scoring.
  {
    id: "secondaryConcerns",
    multi: true,
    options: [
      { id: "tightness" },
      { id: "texture" },
      { id: "dark-circles" },
      { id: "sun-damage" },
      { id: "firmness" },
      { id: "sensitive-eyes" },
    ],
  },

  // Q4 — how does your skin react to new products?
  {
    id: "reactivity",
    options: [
      { id: "never" },
      { id: "sometimes" },
      { id: "often" },
    ],
  },

  // Q5 — sun exposure?
  // Drives whether SPF is included in the routine. "indoors" → no SPF
  // step (we don't have non-SPF day creams flagged), everything else
  // surfaces the Clear sun block collagen.
  {
    id: "sunExposure",
    options: [
      { id: "indoors" },
      { id: "commute" },
      { id: "outdoor" },
      { id: "strong" },
    ],
  },

  // Q6 — age range. Used to weight the Yu.R PRO line (peptide-heavy)
  // for 35+ and to bump fine-lines/firmness scoring even when not the
  // primary concern.
  {
    id: "ageBand",
    options: [
      { id: "u25" },
      { id: "25-34" },
      { id: "35-44" },
      { id: "45+" },
    ],
  },

  // Q7 — routine length. minimal = 3 steps (cleanse + cream + spf if
  // needed), balanced = 4-5, full = 5-6 (adds toner + mask).
  {
    id: "ritualDepth",
    options: [
      { id: "minimal" },
      { id: "balanced" },
      { id: "full" },
    ],
  },
];

// ──────── Input validation ──────────────────────────────────────────────
//
// Quiz answers payload: `{ [questionId]: optionId | optionId[] }`.
// Q3 (secondaryConcerns) sends an array; everything else sends a string.
// We accept both shapes and normalise inside answerQuiz().

export const QuizAnswersSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);
export type QuizAnswers = z.infer<typeof QuizAnswersSchema>;

// ──────── answerQuiz — the public entrypoint ────────────────────────────

export type QuizResult = {
  ritual: RitualPick[];
  // What we inferred — used by the result page for the "diagnosis" line
  // and the "why these picks" expander.
  brief: QuizBrief;
};

const VALID_SKIN_TYPES = new Set<QuizBrief["skinType"]>([
  "dry",
  "oily",
  "combo",
  "sensitive",
  "normal",
]);
const VALID_PRIMARY: ConcernKey[] = [
  "hydration",
  "dullness",
  "acne",
  "fine-lines",
  "dark-spots",
  "pores",
  "redness",
];
const VALID_SECONDARY: ConcernKey[] = [
  "tightness",
  "texture",
  "dark-circles",
  "sun-damage",
  "firmness",
  "sensitive-eyes",
];

function pickOne<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function pickMany<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const set = new Set<T>();
  for (const v of arr) {
    if ((allowed as readonly string[]).includes(v)) set.add(v as T);
  }
  return [...set];
}

export async function answerQuiz(opts: {
  locale: string;
  answers: QuizAnswers;
}): Promise<QuizResult> {
  // ── Normalise + validate every answer into a typed brief.
  // Anything missing/unknown falls back to a sensible default so a
  // half-completed payload still produces a recommendation.
  let skinType = pickOne(
    opts.answers.skinType,
    [...VALID_SKIN_TYPES] as QuizBrief["skinType"][],
    "normal" as QuizBrief["skinType"],
  );
  const primaryConcern = pickOne(
    opts.answers.primaryConcern,
    VALID_PRIMARY,
    "hydration" as ConcernKey,
  );
  const secondaryConcerns = pickMany(
    opts.answers.secondaryConcerns,
    VALID_SECONDARY,
  );
  const reactivity = pickOne(
    opts.answers.reactivity,
    ["never", "sometimes", "often"] as const,
    "sometimes",
  );
  const sunExposure = pickOne(
    opts.answers.sunExposure,
    ["indoors", "commute", "outdoor", "strong"] as const,
    "commute",
  );
  const ageBand = pickOne(
    opts.answers.ageBand,
    ["u25", "25-34", "35-44", "45+"] as const,
    "25-34",
  );
  const ritualDepth = pickOne(
    opts.answers.ritualDepth,
    ["minimal", "balanced", "full"] as const,
    "balanced",
  );

  // Reactivity bumps skin type to "sensitive" if the user said they
  // react often. Q1 "normal/dry/combo + Q4 often" really means
  // sensitive in practice — we'd rather pick gentler products.
  if (reactivity === "often" && skinType !== "sensitive") {
    skinType = "sensitive";
  }

  const brief: QuizBrief = {
    skinType,
    primaryConcern,
    secondaryConcerns,
    reactivity,
    sunExposure,
    ageBand,
    ritualDepth,
    // Derived line preference (Yu.R PRO / Yu.R Me / Centella) lives in
    // catalog so the scoring function and the brief stay in lockstep.
    linePreference: deriveLinePreference({
      ageBand,
      primaryConcern,
      skinType,
    }),
    // SPF is only added to the routine when the user gets non-trivial
    // sun exposure. "indoors" means we save them a product they likely
    // wouldn't apply anyway.
    needsSpf: sunExposure !== "indoors",
  };

  const ritual = await buildRitual({
    locale: opts.locale,
    brief,
  });

  return { ritual, brief };
}
