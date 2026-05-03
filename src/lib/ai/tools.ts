// ─────────────────────────────────────────────────────────────────────────
// AI tools exposed to the Groq model via the `ai` package
//
// Tool-calling lets the LLM look up real product data instead of
// hallucinating SKUs. Each tool is strictly parameterised via Zod so
// the model can't pass arbitrary SQL-like input — it picks from a
// fixed set of filter slugs and free-text queries that go through
// our catalog layer.
//
// The result shape is kept compact (no rich HTML, no full descriptions)
// so the context window stays small and the model focuses on picking
// the right SKU to cite.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";
import {
  searchCatalog,
  getProductBySku,
  buildRitual,
  type AiProductSummary,
  type RitualPick,
} from "./catalog";

/**
 * Build the set of tools for a given locale. The locale comes from the
 * request (derived from the page the user is chatting from) and the AI
 * doesn't get to override it — otherwise it could leak NL copy to an EN
 * visitor or vice versa.
 */
export function buildAiTools(locale: string) {
  return {
    // ── searchCatalog ─────────────────────────────────────────────────
    searchCatalog: tool({
      description:
        "Search YU.R's product catalogue by skin type, concern, category, " +
        "or free-text query. Use this before recommending specific products. " +
        "Returns compact product summaries with SKU, name, price, and tags.",
      parameters: z.object({
        query: z
          .string()
          .optional()
          .describe("Free-text match against product name/tagline (optional)."),
        skinTypeSlugs: z
          .array(z.string())
          .optional()
          .describe('Filter by skin type slugs, e.g. ["dry","sensitive"].'),
        concernSlugs: z
          .array(z.string())
          .optional()
          .describe(
            'Filter by concern slugs, e.g. ["hyperpigmentation","fine-lines"].',
          ),
        categorySlugs: z
          .array(z.string())
          .optional()
          .describe(
            'Filter by category slugs, e.g. ["cleansers","moisturisers"].',
          ),
        maxPriceEur: z
          .number()
          .positive()
          .optional()
          .describe("Cap results at this max EUR price (optional)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Max products to return (default 6)."),
      }),
      execute: async (args): Promise<AiProductSummary[]> =>
        searchCatalog({ ...args, locale }),
    }),

    // ── getProduct ────────────────────────────────────────────────────
    getProduct: tool({
      description:
        "Fetch a single product by its SKU for detailed information. " +
        "Use this when the user asks about a specific product by name " +
        "(look up the SKU via searchCatalog first if needed).",
      parameters: z.object({
        sku: z.string().describe("The product's SKU, e.g. YUR-SUN-SPF50."),
      }),
      execute: async ({ sku }): Promise<AiProductSummary | null> =>
        getProductBySku(sku, locale),
    }),

    // ── buildRitual ───────────────────────────────────────────────────
    buildRitual: tool({
      description:
        "Build a complete skincare ritual (cleanse → toner → treat → " +
        "cream → mask → SPF) tailored to a skin type and concern. Steps " +
        "are scored by ingredient match against the user's brief. Use " +
        "this when the user asks for a full routine, not individual products.",
      parameters: z.object({
        skinTypeSlugs: z.array(z.string()).optional(),
        concernSlugs: z.array(z.string()).optional(),
        maxPriceEur: z.number().positive().optional(),
      }),
      execute: async (args): Promise<RitualPick[]> =>
        buildRitual({ ...args, locale }),
    }),
  };
}
