// ─────────────────────────────────────────────────────────────────────────
// native-input.ts — set an input/textarea value in a way React 19 will
// actually pick up at form-submission time.
//
// Background: every <input>/<textarea> rendered by React has an internal
// `_valueTracker` that React uses to decide whether the element's value
// has changed. When you write `el.value = "x"` via a raw ref, the DOM
// updates but the tracker doesn't. React 19's Server Action form
// submission path checks the tracker — and if it thinks nothing changed,
// the input gets reverted to its defaultValue in the FormData payload.
// Net effect: programmatic value writes vanish on save.
//
// The fix is to use the native HTMLInputElement / HTMLTextAreaElement
// `value` setter (which bypasses React's wrapped setter and pokes the
// tracker), then dispatch a bubbling `input` event so React's tracker
// reads the fresh value and registers the change.
//
// See https://github.com/facebook/react/issues/27770 for the upstream
// discussion.
//
// All admin "Auto-translate from English" forms route their writes
// through this helper — the bug is identical across every form.
// ─────────────────────────────────────────────────────────────────────────

"use client";

export function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement | null | undefined,
  value: string,
): void {
  if (!el) return;

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (setter) {
    setter.call(el, value);
  } else {
    // Defensive fallback — every modern browser exposes the descriptor,
    // but if some polyfill mangled it we'd rather have a half-broken
    // input than throw and leave an admin staring at an empty field.
    el.value = value;
  }

  // Dispatching `input` (not `change`) is what React's value tracker
  // listens for. Bubbles so any parent listeners also see it. No
  // composition data needed — this is a programmatic edit.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
