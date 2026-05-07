// ─────────────────────────────────────────────────────────────────────────
// MediaDrawer — right-side panel opened from a MediaCard. Shows a larger
// preview, full metadata, and the per-image actions: edit alt, copy URL,
// set primary, delete.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Copy,
  Crown,
  Link2,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  deleteMediaAction,
  linkMediaToJournalAction,
  linkMediaToProductAction,
  setPrimaryMediaAction,
  updateMediaAltAction,
  type ActionState,
} from "@/app/admin/media/actions";
import type {
  AdminMediaRow,
  MediaPickerJournalPost,
  MediaPickerProduct,
} from "@/lib/queries/admin-media";

const INITIAL: ActionState = { ok: false };

export function MediaDrawer({
  media,
  pickerProducts,
  pickerJournalPosts,
  onClose,
}: {
  media: AdminMediaRow;
  pickerProducts: MediaPickerProduct[];
  pickerJournalPosts: MediaPickerJournalPost[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [altState, altAction] = useActionState(updateMediaAltAction, INITIAL);
  const [primaryState, primaryAction] = useActionState(
    setPrimaryMediaAction,
    INITIAL,
  );
  const [deleteState, deleteAction] = useActionState(deleteMediaAction, INITIAL);
  const [linkState, linkAction] = useActionState(
    linkMediaToProductAction,
    INITIAL,
  );
  const [journalState, journalAction] = useActionState(
    linkMediaToJournalAction,
    INITIAL,
  );
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [makePrimary, setMakePrimary] = useState(false);
  // Journal-side picker state — kept independent so picking a product
  // doesn't deselect a journal slot and vice versa.
  const [journalQuery, setJournalQuery] = useState("");
  const [pickedPostId, setPickedPostId] = useState<string | null>(null);
  const [pickedSlot, setPickedSlot] = useState<"cover" | "hero">("cover");

  // Close on Escape — nice keyboard parity with the cart drawer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Refresh the list if a destructive/write action just succeeded.
  useEffect(() => {
    if (altState.ok || primaryState.ok) router.refresh();
  }, [altState.ok, primaryState.ok, router]);

  // After a successful link, refresh the page (so usage counts update)
  // and reset the picker so the next link starts clean.
  useEffect(() => {
    if (linkState.ok) {
      router.refresh();
      setPickedProductId(null);
      setMakePrimary(false);
      setPickerQuery("");
    }
  }, [linkState.ok, router]);

  // Same hygiene for the journal-side action.
  useEffect(() => {
    if (journalState.ok) {
      router.refresh();
      setPickedPostId(null);
      setJournalQuery("");
    }
  }, [journalState.ok, router]);

  // Close after successful delete.
  useEffect(() => {
    if (deleteState.ok) {
      router.refresh();
      onClose();
    }
  }, [deleteState.ok, router, onClose]);

  const canSetPrimary = !!media.productId && !media.isPrimary;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Media details — ${media.alt || media.id}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-ink/40 backdrop-blur-sm"
      />

      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-ink/10 bg-rice shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-rice/90 px-6 py-4 backdrop-blur">
          <div>
            <div className="eyebrow">Media</div>
            <p className="mt-0.5 font-display text-[18px] text-ink">Details</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-ink/15 p-1.5 text-ink-mid hover:border-ink hover:text-ink"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-8 px-6 py-6">
          <div className="border border-ink/10 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.url}
              alt={media.alt ?? ""}
              className="h-auto max-h-[60vh] w-full object-contain"
            />
          </div>

          {/* Alt text ------------------------------------------------------- */}
          <form action={altAction} className="space-y-2">
            <input type="hidden" name="id" value={media.id} />
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Alt text
              </span>
              <input
                name="alt"
                defaultValue={media.alt ?? ""}
                placeholder="Describe this image for screen readers + SEO"
                className="input"
                maxLength={200}
              />
            </label>
            <div className="flex items-center gap-3">
              <SaveAltButton />
              {altState.message && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px]",
                    altState.ok ? "text-sage" : "text-vermilion",
                  )}
                >
                  {altState.ok ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {altState.message}
                </span>
              )}
            </div>
          </form>

          {/* URL ------------------------------------------------------------ */}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-label text-ink-mid">
              Public URL
            </div>
            <div className="flex items-stretch gap-2">
              <code className="input flex-1 truncate bg-white font-mono text-[11px]">
                {media.url}
              </code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(media.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    // Clipboard API may be blocked; ignore.
                  }
                }}
                className="inline-flex items-center gap-1 border border-ink/15 bg-white px-3 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Linked product ------------------------------------------------ */}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-label text-ink-mid">
              Link
            </div>
            {media.productId ? (
              <Link
                href={`/admin/products/${media.productId}`}
                className="inline-flex items-center gap-2 text-[13px] text-ink underline-offset-2 hover:underline"
              >
                {media.productName || "Open product"}
              </Link>
            ) : media.bannerCount > 0 ? (
              <p className="text-[13px] text-ink-mid">
                Used on {media.bannerCount} homepage banner
                {media.bannerCount === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="text-[13px] text-vermilion/80">
                Not linked anywhere. Safe to delete.
              </p>
            )}
          </div>

          {/* Set-primary action ------------------------------------------- */}
          {canSetPrimary && (
            <form action={primaryAction}>
              <input type="hidden" name="id" value={media.id} />
              <SetPrimaryButton />
              {primaryState.message && !primaryState.ok && (
                <span className="ml-3 inline-flex items-center gap-1 text-[11px] text-vermilion">
                  <AlertCircle className="h-3 w-3" />
                  {primaryState.message}
                </span>
              )}
            </form>
          )}

          {/* Link to a product ---------------------------------------------- */}
          {/* Same image can power multiple PDPs — picking a product here
              creates a new Media row pointing at the same storage URL.
              The "Make primary" checkbox flips that copy to be the
              product's hero image (clearing any prior primary). */}
          <div className="border-t border-ink/10 pt-6">
            <div className="eyebrow flex items-center gap-2">
              <Link2 className="h-3 w-3" />
              Link to a product
            </div>
            <p className="mt-2 text-[12px] text-ink-mid">
              Reuse this image on another product. The file isn&apos;t
              duplicated — only the link.
            </p>

            <form action={linkAction} className="mt-4 space-y-3">
              <input type="hidden" name="mediaId" value={media.id} />
              <input
                type="hidden"
                name="productId"
                value={pickedProductId ?? ""}
              />
              <input
                type="hidden"
                name="setAsPrimary"
                value={makePrimary ? "on" : ""}
              />

              {/* Search field — small client-side filter over the
                  pre-loaded product list. */}
              <label className="flex items-center gap-2 border border-ink/15 bg-white px-3 py-2 text-[12px] text-ink-mid focus-within:border-ink">
                <Search className="h-3.5 w-3.5" />
                <input
                  type="search"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search products by name…"
                  className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none"
                />
              </label>

              {/* Filtered product results — clickable rows. Capped to
                  20 to keep the list readable; refine the query if you
                  don't see what you're looking for. */}
              <ul className="max-h-56 space-y-0.5 overflow-y-auto border border-ink/10 bg-white p-1">
                {(() => {
                  const q = pickerQuery.trim().toLowerCase();
                  const filtered = q
                    ? pickerProducts.filter((p) =>
                        p.name.toLowerCase().includes(q),
                      )
                    : pickerProducts;
                  const visible = filtered.slice(0, 20);
                  if (visible.length === 0) {
                    return (
                      <li className="px-3 py-2 text-[12px] italic text-ink-mid">
                        No matches.
                      </li>
                    );
                  }
                  return visible.map((p) => {
                    const picked = pickedProductId === p.id;
                    const alreadyOnThisProduct = media.productId === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPickedProductId(p.id)}
                          disabled={alreadyOnThisProduct}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[13px] transition-colors",
                            alreadyOnThisProduct
                              ? "cursor-not-allowed text-ink-mid/50"
                              : picked
                                ? "bg-ink text-rice"
                                : "text-ink hover:bg-ink/5",
                          )}
                        >
                          <span className="truncate">{p.name}</span>
                          {alreadyOnThisProduct && (
                            <span className="shrink-0 text-[10px] uppercase tracking-label">
                              Current
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  });
                })()}
              </ul>

              {/* Optional: make this the new primary image on the picked
                  product. Disabled until a product is picked because it
                  has no meaning otherwise. */}
              <label className="flex items-center gap-2 text-[12px] text-ink-mid">
                <input
                  type="checkbox"
                  checked={makePrimary}
                  onChange={(e) => setMakePrimary(e.target.checked)}
                  disabled={!pickedProductId}
                  className="h-3.5 w-3.5 cursor-pointer accent-ink disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span
                  className={cn(
                    !pickedProductId && "opacity-50",
                  )}
                >
                  Use as the product&apos;s primary image
                </span>
              </label>

              <div className="flex items-center gap-3">
                <LinkButton disabled={!pickedProductId} />
                {linkState.message && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px]",
                      linkState.ok ? "text-sage" : "text-vermilion",
                    )}
                  >
                    {linkState.ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {linkState.message}
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Attach to a journal article -----------------------------------
              Journal images don't go through the polymorphic Media junction
              — they're plain URL fields on JournalPost (coverUrl + heroUrl).
              The two slots use different aspect ratios:
                · Card thumbnail (4:5)  → /journal listing + homepage teaser
                · Article hero (16:9)   → top of /journal/[slug]
              an admin picks the post + the slot, the action writes the URL. */}
          <div className="border-t border-ink/10 pt-6">
            <div className="eyebrow flex items-center gap-2">
              <BookOpen className="h-3 w-3" />
              Attach to a journal article
            </div>
            <p className="mt-2 text-[12px] text-ink-mid">
              Pick the article, then choose whether this image is the card
              thumbnail or the article-page hero. Replaces whatever URL is
              currently in that slot.
            </p>

            <form action={journalAction} className="mt-4 space-y-3">
              <input type="hidden" name="mediaId" value={media.id} />
              <input
                type="hidden"
                name="postId"
                value={pickedPostId ?? ""}
              />
              <input type="hidden" name="slot" value={pickedSlot} />

              {/* Article search */}
              <label className="flex items-center gap-2 border border-ink/15 bg-white px-3 py-2 text-[12px] text-ink-mid focus-within:border-ink">
                <Search className="h-3.5 w-3.5" />
                <input
                  type="search"
                  value={journalQuery}
                  onChange={(e) => setJournalQuery(e.target.value)}
                  placeholder="Search journal articles…"
                  className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none"
                />
              </label>

              {/* Filtered article rows */}
              <ul className="max-h-56 space-y-0.5 overflow-y-auto border border-ink/10 bg-white p-1">
                {(() => {
                  const q = journalQuery.trim().toLowerCase();
                  const filtered = q
                    ? pickerJournalPosts.filter((p) =>
                        p.title.toLowerCase().includes(q),
                      )
                    : pickerJournalPosts;
                  const visible = filtered.slice(0, 20);
                  if (visible.length === 0) {
                    return (
                      <li className="px-3 py-2 text-[12px] italic text-ink-mid">
                        {pickerJournalPosts.length === 0
                          ? "No journal articles yet."
                          : "No matches."}
                      </li>
                    );
                  }
                  return visible.map((p) => {
                    const picked = pickedPostId === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPickedPostId(p.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[13px] transition-colors",
                            picked
                              ? "bg-ink text-rice"
                              : "text-ink hover:bg-ink/5",
                          )}
                        >
                          <span className="truncate">{p.title}</span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px] uppercase tracking-label",
                              picked ? "text-rice/80" : "text-ink-mid",
                            )}
                          >
                            {p.hasCover && p.hasHero
                              ? "Card + hero set"
                              : p.hasCover
                              ? "Card set"
                              : p.hasHero
                              ? "Hero set"
                              : "No images"}
                          </span>
                        </button>
                      </li>
                    );
                  });
                })()}
              </ul>

              {/* Slot picker — radios styled as button group. Disabled
                  visually until a post is picked but kept clickable so
                  an admin can pre-pick if she likes. */}
              <fieldset
                className={cn(
                  "border border-ink/15 bg-white p-2",
                  !pickedPostId && "opacity-60",
                )}
              >
                <legend className="px-1 text-[10px] uppercase tracking-label text-ink-mid">
                  Use this image as
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-1 border px-3 py-2 text-[12px] transition-colors",
                      pickedSlot === "cover"
                        ? "border-ink bg-ink text-rice"
                        : "border-ink/15 bg-white text-ink hover:border-ink/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="slotChoice"
                      value="cover"
                      checked={pickedSlot === "cover"}
                      onChange={() => setPickedSlot("cover")}
                      className="sr-only"
                    />
                    <span className="font-display text-[13px]">
                      Card thumbnail
                    </span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-label",
                        pickedSlot === "cover"
                          ? "text-rice/80"
                          : "text-ink-mid",
                      )}
                    >
                      4:5 portrait · 1200×1500
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-1 border px-3 py-2 text-[12px] transition-colors",
                      pickedSlot === "hero"
                        ? "border-ink bg-ink text-rice"
                        : "border-ink/15 bg-white text-ink hover:border-ink/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="slotChoice"
                      value="hero"
                      checked={pickedSlot === "hero"}
                      onChange={() => setPickedSlot("hero")}
                      className="sr-only"
                    />
                    <span className="font-display text-[13px]">
                      Article hero
                    </span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-label",
                        pickedSlot === "hero"
                          ? "text-rice/80"
                          : "text-ink-mid",
                      )}
                    >
                      16:9 landscape · 1600×900
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="flex items-center gap-3">
                <JournalLinkButton disabled={!pickedPostId} />
                {journalState.message && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px]",
                      journalState.ok ? "text-sage" : "text-vermilion",
                    )}
                  >
                    {journalState.ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {journalState.message}
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Delete --------------------------------------------------------- */}
          <div className="border-t border-ink/10 pt-6">
            <div className="eyebrow text-vermilion">Danger zone</div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="mt-3 inline-flex items-center gap-2 border border-vermilion/30 px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete image
              </button>
            ) : (
              <form action={deleteAction} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={media.id} />
                <p className="text-[12px] text-ink">
                  This removes the file from storage and the Media record.
                  Products that used this image will fall back to the next one.
                </p>
                <div className="flex items-center gap-2">
                  <DeleteButton />
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="border border-ink/15 px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
                  >
                    Cancel
                  </button>
                  {deleteState.message && !deleteState.ok && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-vermilion">
                      <AlertCircle className="h-3 w-3" />
                      {deleteState.message}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SaveAltButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Save alt
    </button>
  );
}

function SetPrimaryButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] uppercase tracking-label text-gold hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Crown className="h-3 w-3" />
      )}
      Make primary image
    </button>
  );
}

function LinkButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 text-[11px] uppercase tracking-label text-rice hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
      Link image
    </button>
  );
}

function JournalLinkButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 text-[11px] uppercase tracking-label text-rice hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <BookOpen className="h-3 w-3" />
      )}
      Apply to article
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-vermilion bg-vermilion px-3 py-2 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Trash2 className="h-3 w-3" />
      )}
      Delete
    </button>
  );
}
