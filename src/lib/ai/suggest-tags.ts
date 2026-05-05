// ─────────────────────────────────────────────────────────────────────────
// suggest-tags — AI categorization for products in the admin editor.
//
// Pure server function. Takes the things we know about a product
// (name, INCI, EN description) plus the available taxonomy slugs,
// asks Groq to choose the best classification, and returns a structured
// suggestion. The CALLER (admin server action) decides whether to
// commit the suggestion to the DB.
//
// Why generateObject + Zod: the response needs to be machine-actionable
// (list of slugs the form will write directly to ProductCategory etc.).
// Free-text responses would force regex parsing; Zod-validated output
// from the AI SDK is checked at runtime and typed at compile time, so
// a malformed response throws cleanly instead of silently mis-tagging
// a product.
//
// Conservatism matters more than coverage. The system prompt explicitly
// tells the model: "if the formulation does not clearly serve a skin
// type / concern / benefit, leave that tag off." Over-tagging dilutes
// the /shop facet filters and breaks customer trust ("you said this
// was for sensitive skin and it has fragrance #3 in it").
// ─────────────────────────────────────────────────────────────────────────

import { generateObject } from "ai";
import { z } from "zod";
import { getGroqModel } from "./groq";

// ──────── Public types ──────────────────────────────────────────────────

export type SuggestTagsInput = {
  productName: string;
  /** EN short description + long description concatenated. May be empty. */
  description: string;
  /** Comma-separated INCI declaration. May be empty. */
  inciList: string;
  /** Volume / weight context — helps disambiguate cleanser size vs sample. */
  volumeMl: number | null;
  /** Available pill slugs the model is allowed to pick from. */
  available: {
    brands: Array<{ slug: string; name: string }>;
    categories: Array<{
      slug: string;
      name: string;
      parentSlug: string | null;
    }>;
    skinTypes: Array<{ slug: string; label: string }>;
    concerns: Array<{ slug: string; label: string }>;
    benefits: Array<{ slug: string; label: string }>;
  };
};

// Zod schema = the contract Groq must produce. Slugs are restricted to
// the ENUM of available values per axis, so the model can't invent new
// taxonomy values. If it tries, the AI SDK throws and we return an
// error to the admin instead of silently writing garbage.
function buildSchema(input: SuggestTagsInput) {
  const brandSlugs = input.available.brands.map((b) => b.slug);
  const categorySlugs = input.available.categories.map((c) => c.slug);
  const skinTypeSlugs = input.available.skinTypes.map((s) => s.slug);
  const concernSlugs = input.available.concerns.map((c) => c.slug);
  const benefitSlugs = input.available.benefits.map((b) => b.slug);

  // z.enum requires a non-empty tuple, so guard each axis. If the
  // taxonomy is empty for some axis, fall back to z.string() — the
  // model will return [] which is a valid empty array.
  const brandEnum = brandSlugs.length > 0
    ? z.enum(brandSlugs as [string, ...string[]]).nullable()
    : z.null();
  const parentCategoryEnum = categorySlugs.length > 0
    ? z.enum(categorySlugs as [string, ...string[]]).nullable()
    : z.null();
  const subcategoryEnum = categorySlugs.length > 0
    ? z.enum(categorySlugs as [string, ...string[]]).nullable()
    : z.null();
  const skinTypeArr = skinTypeSlugs.length > 0
    ? z.array(z.enum(skinTypeSlugs as [string, ...string[]]))
    : z.array(z.never()).max(0);
  const concernArr = concernSlugs.length > 0
    ? z.array(z.enum(concernSlugs as [string, ...string[]]))
    : z.array(z.never()).max(0);
  const benefitArr = benefitSlugs.length > 0
    ? z.array(z.enum(benefitSlugs as [string, ...string[]]))
    : z.array(z.never()).max(0);

  return z.object({
    brandSlug: brandEnum,
    parentCategorySlug: parentCategoryEnum,
    subcategorySlug: subcategoryEnum,
    skinTypeSlugs: skinTypeArr,
    concernSlugs: concernArr,
    benefitSlugs: benefitArr,
    confidence: z.enum(["high", "medium", "low"]),
    reasoning: z.string().max(280),
  });
}

export type SuggestTagsOutput = {
  brandSlug: string | null;
  parentCategorySlug: string | null;
  subcategorySlug: string | null;
  skinTypeSlugs: string[];
  concernSlugs: string[];
  benefitSlugs: string[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
};

// ──────── Main entry ────────────────────────────────────────────────────

export async function suggestTagsForProduct(
  input: SuggestTagsInput,
): Promise<SuggestTagsOutput> {
  const model = getGroqModel();
  if (!model) {
    throw new Error(
      "GROQ_API_KEY is not configured — AI suggestions unavailable.",
    );
  }

  const schema = buildSchema(input);

  // System prompt — the rules of engagement. Kept as long as needed
  // because admin classification doesn't run on the hot path; we'd
  // rather pay 200 extra tokens per call for a model that doesn't
  // hallucinate or over-tag.
  const system = [
    "You are a skincare product categorisation assistant for YU.R, a Korean skincare retailer.",
    "Given a product, you choose the best brand, parent category, subcategory, plus relevant skin types, concerns, and benefits.",
    "",
    "RULES:",
    "1. Pick from the slug lists provided. NEVER invent new slugs. If no good match exists for an axis, return null (single) or [] (multi).",
    "2. parentCategorySlug must be a TOP-LEVEL category (parentSlug=null in the list). subcategorySlug must be a CHILD of the chosen parent (its parentSlug equals parentCategorySlug). If only the parent is appropriate (no subcategory fits), return null for subcategorySlug.",
    "3. Be conservative on multi-select axes. Only include skinTypeSlugs / concernSlugs / benefitSlugs that the formulation CLEARLY supports based on its INCI ingredients. Do not tag every product as suitable for every skin type.",
    "4. NEVER make medical claims (no 'cures', 'treats', 'anti-aging' as a medical claim). Skin type / concern / benefit tags are descriptive, not promises.",
    "5. confidence = 'high' when name + INCI both clearly point to the same answer. 'medium' when there's mild ambiguity. 'low' when you had to guess from incomplete data.",
    "6. reasoning: ONE sentence, max 280 chars, in English. Explain WHY you picked the parent category + subcategory.",
  ].join("\n");

  // User message — the product data + taxonomy. We pass the taxonomy
  // labels alongside slugs so the model has natural-language context;
  // Llama 4 chooses better with "Hydrating Toners" visible than slug-
  // only "hydrating-toners".
  const taxonomyBlock = [
    "AVAILABLE TAXONOMY:",
    "",
    "Brands (slug → name):",
    ...input.available.brands.map((b) => `  ${b.slug} → ${b.name}`),
    "",
    "Categories (slug → name, parent slug):",
    ...input.available.categories.map(
      (c) => `  ${c.slug} → ${c.name} (parent: ${c.parentSlug ?? "ROOT"})`,
    ),
    "",
    "Skin types (slug → label):",
    ...input.available.skinTypes.map((s) => `  ${s.slug} → ${s.label}`),
    "",
    "Concerns (slug → label):",
    ...input.available.concerns.map((c) => `  ${c.slug} → ${c.label}`),
    "",
    "Benefits (slug → label):",
    ...input.available.benefits.map((b) => `  ${b.slug} → ${b.label}`),
  ].join("\n");

  const productBlock = [
    "PRODUCT TO CATEGORISE:",
    "",
    `Name: ${input.productName}`,
    `Volume: ${input.volumeMl ? `${input.volumeMl} ml` : "(unknown)"}`,
    `Description: ${input.description.trim() || "(no description)"}`,
    `INCI: ${input.inciList.trim() || "(no INCI provided)"}`,
  ].join("\n");

  const prompt = `${taxonomyBlock}\n\n${productBlock}`;

  const result = await generateObject({
    model,
    system,
    prompt,
    schema,
    // Low temperature — classification is a deterministic-ish task,
    // we don't want creative reinterpretation across runs.
    temperature: 0.2,
    maxRetries: 1,
  });

  return result.object as SuggestTagsOutput;
}
