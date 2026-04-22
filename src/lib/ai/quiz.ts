// ─────────────────────────────────────────────────────────────────────────
// Rule-based skin quiz (Layer 1)
//
// This is the always-on fallback that runs when Groq is unavailable or
// the admin has disabled the LLM path. It asks five short questions,
// maps the answers to skinType + concern slugs, then calls buildRitual()
// from catalog.ts to produce a 4-step routine.
//
// Why not store questions in the DB:
//   · The answer → tag mapping is logic, not content. Keeping it in
//     code lets us reason about it and keeps non-technical Elie from
//     accidentally breaking the routine builder.
//   · The question TEXT is translated via next-intl (concierge.quiz.*),
//     so copy can still be edited without code. Only the option IDs
//     (which are stable tokens) are hard-coded here.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import type { RitualPick } from "./catalog";
import { buildRitual } from "./catalog";

// ──────── Question schema ───────────────────────────────────────────────

/**
 * Each option declares which skin type and/or concern slugs it implies.
 * Quiz answers are aggregated at the end — the union of all picked
 * option tags becomes the filter passed to buildRitual().
 */
export type QuizOption = {
  id: string;                 // stable; used in translations + answer payload
  skinTypeSlugs?: string[];
  concernSlugs?: string[];
};

export type QuizQuestion = {
  id: string;                 // stable; paired with translations
  options: QuizOption[];
  /** Multi-select allowed? (concerns usually, skin-type usually not) */
  multi?: boolean;
};

// ──────── The actual quiz ───────────────────────────────────────────────

export const QUIZ: ReadonlyArray<QuizQuestion> = [
  // Q1 — skin type (single select)
  {
    id: "skinType",
    options: [
      { id: "dry",       skinTypeSlugs: ["dry"] },
      { id: "oily",      skinTypeSlugs: ["oily"] },
      { id: "combo",     skinTypeSlugs: ["combo", "combination"] },
      { id: "sensitive", skinTypeSlugs: ["sensitive"] },
      { id: "normal",    skinTypeSlugs: ["normal"] },
    ],
  },

  // Q2 — top concern (single select, because recommendation hinges on this)
  {
    id: "concern",
    options: [
      { id: "hydration",    concernSlugs: ["dehydration", "dryness"] },
      { id: "dullness",     concernSlugs: ["dullness", "uneven-tone"] },
      { id: "acne",         concernSlugs: ["acne", "breakouts"] },
      { id: "ageing",       concernSlugs: ["fine-lines", "ageing"] },
      { id: "sensitivity",  concernSlugs: ["redness", "sensitivity"] },
      { id: "darkSpots",    concernSlugs: ["hyperpigmentation", "dark-spots"] },
      { id: "pores",        concernSlugs: ["enlarged-pores", "texture"] },
    ],
  },

  // Q3 — sensitivity trigger (informational — bumps sensitive skin type)
  {
    id: "sensitivity",
    options: [
      { id: "never"    /* no tag */ },
      { id: "sometimes", skinTypeSlugs: ["sensitive"] },
      { id: "often",     skinTypeSlugs: ["sensitive"], concernSlugs: ["redness"] },
    ],
  },

  // Q4 — routine depth (informational — affects ritual length preference)
  {
    id: "ritualDepth",
    options: [
      { id: "minimal" },
      { id: "balanced" },
      { id: "complete" },
    ],
  },

  // Q5 — budget bucket (maps to maxPriceEur)
  {
    id: "budget",
    options: [
      { id: "under_30" },
      { id: "30_to_60" },
      { id: "over_60" },
      { id: "no_limit" },
    ],
  },
];

// ──────── Input validation ──────────────────────────────────────────────

/**
 * Quiz answers payload: `{ [questionId]: optionId | optionId[] }`.
 * Zod validates every id against the allowlist so we never trust the
 * client to invent tags.
 */
export const QuizAnswersSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);
export type QuizAnswers = z.infer<typeof QuizAnswersSchema>;

// ──────── answerQuiz — the public entrypoint ────────────────────────────

export type QuizResult = {
  ritual: RitualPick[];
  /** What we inferred from the answers — useful for "we chose for dry skin" copy. */
  inferred: {
    skinTypeSlugs: string[];
    concernSlugs: string[];
    maxPriceEur: number | undefined;
    ritualDepth: "minimal" | "balanced" | "complete";
  };
};

export async function answerQuiz(opts: {
  locale: string;
  answers: QuizAnswers;
}): Promise<QuizResult> {
  const skinTypeSlugs = new Set<string>();
  const concernSlugs = new Set<string>();

  for (const q of QUIZ) {
    const raw = opts.answers[q.id];
    if (!raw) continue;
    const picked = Array.isArray(raw) ? raw : [raw];

    for (const opt of q.options) {
      if (!picked.includes(opt.id)) continue;
      opt.skinTypeSlugs?.forEach((s) => skinTypeSlugs.add(s));
      opt.concernSlugs?.forEach((s) => concernSlugs.add(s));
    }
  }

  // Map budget answer → a max price (EUR) handed to buildRitual.
  const budget = opts.answers.budget;
  const maxPriceEur =
    budget === "under_30" ? 30 :
    budget === "30_to_60" ? 60 :
    budget === "over_60"  ? 150 :
    undefined; // "no_limit" or missing

  const depth = opts.answers.ritualDepth;
  const ritualDepth: QuizResult["inferred"]["ritualDepth"] =
    depth === "minimal" || depth === "complete" ? depth : "balanced";

  const ritual = await buildRitual({
    locale: opts.locale,
    skinTypeSlugs: [...skinTypeSlugs],
    concernSlugs: [...concernSlugs],
    maxPriceEur,
  });

  return {
    ritual,
    inferred: {
      skinTypeSlugs: [...skinTypeSlugs],
      concernSlugs: [...concernSlugs],
      maxPriceEur,
      ritualDepth,
    },
  };
}
