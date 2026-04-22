// ─────────────────────────────────────────────────────────────────────────
// ConciergeChat — free-text streaming chat (Layer 2, Groq-powered)
//
// Uses the `ai` package's useChat hook to stream messages from
// /api/ai/chat. The endpoint does tool calling server-side, so the
// client just renders whatever the model sends back (text + tool
// invocation results).
//
// Tool results arrive as `toolInvocations` on assistant messages. We
// render the AI products (from searchCatalog / getProduct / buildRitual)
// inline as compact cards so the user can click through. Everything
// else — text streaming, input, error states — is vanilla useChat.
//
// If the endpoint returns 501/503 (no key / admin off) the hook fires
// onError and we show a friendly fallback pointing to the quiz.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useChat } from "ai/react";
import type { Message } from "ai";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";

import { Link } from "@/i18n/routing";
import type { AiProductSummary, RitualPick } from "@/lib/ai/catalog";
import { formatEur, priceLocale } from "@/lib/utils";

export function ConciergeChat() {
  const t = useTranslations("concierge");
  const locale = useLocale();
  const currencyLocale = priceLocale(locale);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: "/api/ai/chat",
    body: { locale },
    // Seed with a cheerful assistant greeting so the user isn't staring
    // at an empty pane waiting to type.
    initialMessages: [
      {
        id: "greeting",
        role: "assistant",
        content: t("chat_greeting"),
      },
    ],
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 text-[13px] text-ink">
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} currencyLocale={currencyLocale} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-[12px] text-ink-mid">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>{t("chat_thinking")}</span>
          </div>
        )}

        {error && (
          <div className="border border-vermilion/30 bg-vermilion/5 px-3 py-3 text-[12px] text-vermilion">
            {t("chat_error")}
          </div>
        )}
      </div>

      {/* composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-ink/10 px-3 py-3"
      >
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder={t("placeholder")}
          className="flex-1 bg-transparent px-2 py-2 text-[14px] text-ink placeholder:text-ink-mid/70 focus:outline-none"
          aria-label={t("placeholder")}
          disabled={isLoading}
        />
        <button
          type="submit"
          aria-label={t("send")}
          disabled={isLoading || input.trim().length === 0}
          className="grid h-9 w-9 place-items-center bg-vermilion text-rice transition-colors hover:bg-vermilion-2 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ChatBubble — one message, plus any tool-call product cards.
// ─────────────────────────────────────────────────────────────────────────

function ChatBubble({
  message,
  currencyLocale,
}: {
  message: Message;
  currencyLocale: string;
}) {
  const isUser = message.role === "user";

  // Tool invocations live on the message object when the AI called tools
  // like searchCatalog. We flatten their results into a single list of
  // unique products so duplicates from multiple tool calls don't stack.
  const toolProducts = extractProductsFromToolCalls(message);

  return (
    <div>
      {message.content && (
        <div
          className={
            isUser
              ? "ml-auto w-fit max-w-[85%] bg-ink px-3 py-2 text-[13px] leading-relaxed text-rice"
              : "mr-auto w-fit max-w-[85%] rounded-md bg-ivory px-3 py-2 text-[13px] leading-relaxed text-ink-soft"
          }
        >
          {message.content}
        </div>
      )}

      {toolProducts.length > 0 && (
        <ul className="mt-2 space-y-2">
          {toolProducts.map((p) => (
            <li key={p.id}>
              <ProductPill product={p} currencyLocale={currencyLocale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductPill({
  product,
  currencyLocale,
}: {
  product: AiProductSummary;
  currencyLocale: string;
}) {
  return (
    <Link
      href={`/shop/${product.slug}`}
      className="flex items-center gap-3 border border-ink/10 bg-white/60 p-2 transition-colors hover:border-vermilion/40"
    >
      <div className="relative h-12 w-12 flex-shrink-0 bg-ink/5">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-display text-[13px] leading-tight text-ink">
          {product.name}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-mid">
          {formatEur(product.priceEur, currencyLocale)}
        </div>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tool-result extraction
//
// The `ai` package attaches each tool call and its result to the message
// via `toolInvocations`. We normalise the three tools (searchCatalog,
// getProduct, buildRitual) into a flat unique-by-id product list.
// ─────────────────────────────────────────────────────────────────────────

type ToolInvocation = NonNullable<Message["toolInvocations"]>[number];

function extractProductsFromToolCalls(message: Message): AiProductSummary[] {
  const invocations = (message.toolInvocations ?? []) as ToolInvocation[];
  const seen = new Set<string>();
  const out: AiProductSummary[] = [];

  for (const inv of invocations) {
    if (inv.state !== "result") continue;
    const result = (inv as ToolInvocation & { result?: unknown }).result;

    if (Array.isArray(result)) {
      for (const item of result) {
        const product = normaliseProduct(item);
        if (product && !seen.has(product.id)) {
          seen.add(product.id);
          out.push(product);
        }
      }
    } else {
      const product = normaliseProduct(result);
      if (product && !seen.has(product.id)) {
        seen.add(product.id);
        out.push(product);
      }
    }
  }

  return out;
}

function normaliseProduct(raw: unknown): AiProductSummary | null {
  // buildRitual returns { step, product } — unwrap it.
  if (
    raw &&
    typeof raw === "object" &&
    "product" in raw &&
    (raw as RitualPick).product
  ) {
    return (raw as RitualPick).product;
  }
  // searchCatalog / getProduct return the product directly.
  if (
    raw &&
    typeof raw === "object" &&
    "id" in raw &&
    "sku" in raw &&
    "name" in raw
  ) {
    return raw as AiProductSummary;
  }
  return null;
}
