// ─────────────────────────────────────────────────────────────────────────
// /admin/quiz-tester — preview what the public skin quiz would
// recommend for a given answer combination.
//
// Same engine that customers hit at /[locale]/quiz. Use this to QA new
// products: change the inputs, see which ritual step they land in (and
// what score), then click through to /admin/products/[id] to adjust
// categories / concerns / ingredients until the recommendation
// matches your editorial intent.
//
// Pure server component on the wrapper — the form + result rendering
// live in a client component so we can update without round-trips.
// ─────────────────────────────────────────────────────────────────────────

import { Sparkles } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { QuizTester } from "./quiz-tester";

export const dynamic = "force-dynamic";

export default async function AdminQuizTesterPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-10">
        <div className="eyebrow">Tools</div>
        <h1 className="mt-2 flex items-center gap-3 font-display text-[34px] leading-tight text-ink">
          <Sparkles className="h-7 w-7 text-vermilion" />
          Quiz tester
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-mid">
          Preview what the public skin quiz would recommend for a given
          customer profile. Same rule-based engine — categories, ingredient
          scoring, skin type, concerns. Use this to QA new products: if a
          product isn&apos;t showing up where you&apos;d expect, check its
          category + ingredient tagging and the recommendation will follow.
        </p>
      </header>

      <QuizTester />
    </div>
  );
}
