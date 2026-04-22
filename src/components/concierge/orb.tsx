// ─────────────────────────────────────────────────────────────────────────
// Concierge Orb — server component wrapper
//
// Thin RSC that reads the admin AI settings + env state once per request
// and hands the values to <ConciergeShell /> on the client. Rendering
// server-side means:
//
//   · No flash of orb when the admin has disabled it
//   · No extra fetch to /api/ai/status on every pageload
//   · Assistant name + availability flags are baked into the HTML
//
// The client shell handles all the interactive logic (quiz state,
// streaming chat, tab switching). If the admin disables the bot, this
// component returns null and no orb ever renders.
// ─────────────────────────────────────────────────────────────────────────

import { readSetting } from "@/lib/settings";
import { hasGroqKey } from "@/lib/ai/groq";
import { ConciergeShell } from "./concierge-shell";

export async function ConciergeOrb() {
  const settings = await readSetting("ai");

  // Master kill-switch. Elie can disable the bot from /admin/settings/ai
  // and it vanishes from the site — no orb, no endpoints consumed.
  if (!settings.enabled) return null;

  return (
    <ConciergeShell
      assistantName={settings.assistantName}
      chatAvailable={hasGroqKey()}
    />
  );
}
