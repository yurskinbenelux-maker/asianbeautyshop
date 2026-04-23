#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// scripts/sweep-links-translations.mjs
//
// Overnight-batch audit helper (Batch 3.4).
//
// What this does — in one pass:
//   1. Walks src/ and collects every:
//      · <Link href="..."> (next-intl Link or next/link)  → INTERNAL_LINKS
//      · href="..." on raw <a>                            → ANCHOR_HREFS
//      · useTranslations("...") calls                     → NAMESPACES
//      · t("...") / t.rich("...") call args              → TRANSLATION_KEYS
//   2. Cross-references INTERNAL_LINKS against the actual set of page.tsx
//      routes under src/app/[locale] — flags 404 candidates.
//   3. Loads messages/{en,nl,fr,ru}.json and flags keys referenced in code
//      but missing in one or more locale files.
//   4. Flags orphaned keys (present in messages but not referenced anywhere).
//
// Limitations (honest):
//   · Only static string literals inside t("literal") are matched. Dynamic
//     keys like t(`header.${x}`) or t(variable) are skipped with a warning.
//   · Dynamic link hrefs (e.g. `/shop/${slug}`) are normalised to /shop/[slug]
//     and matched against dynamic route segments. Fully-computed hrefs
//     (href={someVar}) are skipped.
//   · Admin-only routes (not under [locale]) are excluded from the 404 check
//     because admin doesn't use the locale prefix.
//
// Output: writes docs/audit-links-translations.md.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");
const MESSAGES = join(ROOT, "messages");
const LOCALES = ["en", "nl", "fr", "ru"];

// ─── file walker ─────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(full);
  }
  return acc;
}

// ─── route extraction (what pages exist?) ────────────────────────────────
// Build set of valid public route paths from src/app/[locale]/**/page.tsx
function collectRoutes() {
  const routes = new Set();
  const root = join(APP, "[locale]");
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (name === "page.tsx") {
        // convert dir path → route path
        let rel = relative(root, d).replace(/\\/g, "/");
        // normalise [slug] segments — they match anything
        const route = "/" + rel;
        routes.add(route === "/" ? "/" : route.replace(/\/$/, ""));
      }
    }
  }
  // Also admin routes for completeness
  return routes;
}

// Match an extracted link (after normalisation) against the route set.
function matchRoute(href, routes) {
  // Admin components sometimes hardcode a locale prefix to force a
  // specific language in a new-tab preview (e.g. `/en/shop/foo`). Strip
  // any of our supported locales so we can match against the locale-less
  // route set collected from src/app/[locale]/**.
  for (const l of LOCALES) {
    if (href === `/${l}`) return routes.has("/");
    if (href.startsWith(`/${l}/`)) {
      href = href.slice(l.length + 1) || "/";
      break;
    }
  }
  if (href === "/" && routes.has("/")) return true;
  // direct hit
  if (routes.has(href)) return true;
  // try with dynamic segments: /shop/x → /shop/[slug]. A request path
  // segment matches either its literal or any [param]/[...param].
  const parts = href.split("/").filter(Boolean);
  outer: for (const r of routes) {
    const rparts = r.split("/").filter(Boolean);
    if (rparts.length !== parts.length) continue;
    for (let i = 0; i < rparts.length; i++) {
      const rp = rparts[i];
      const hp = parts[i];
      if (rp.startsWith("[") && rp.endsWith("]")) continue; // dynamic segment
      if (hp === "__DYN__") continue; // our sentinel for ${...}
      if (rp !== hp) continue outer;
    }
    return true;
  }
  return false;
}

// ─── regex extractors ────────────────────────────────────────────────────
// For Links we capture two flavours: plain string href="..." and template
// literal href={`...${...}...`}. Template literals are normalised to a
// skeleton we can still match against dynamic route segments.
const RE_LINK_HREF_STR = /<Link\s+[^>]*?href="([^"]+)"/g;
const RE_LINK_HREF_TPL = /<Link\s+[^>]*?href=\{`([^`]+)`\}/g;
const RE_ANCHOR_HREF = /<a\s+[^>]*?href="([^"]+)"/g;
const RE_USE_TRANSLATIONS = /useTranslations\(\s*"([^"]+)"\s*\)/g;
// Match both `getTranslations("ns")` and `getTranslations({ namespace: "ns", ... })`.
const RE_GET_TRANSLATIONS_PLAIN = /getTranslations\(\s*"([^"]+)"\s*\)/g;
const RE_GET_TRANSLATIONS_OBJ = /getTranslations\(\s*\{[^}]*namespace:\s*"([^"]+)"/g;
const RE_T_CALL = /\bt(?:\.rich)?\(\s*"([^"]+)"/g;

// ─── namespace-scoped key check ──────────────────────────────────────────
function keyExists(messages, ns, key) {
  const full = ns ? `${ns}.${key}` : key;
  const parts = full.split(".");
  let cur = messages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return false;
  }
  return typeof cur === "string" || typeof cur === "object";
}

function flattenKeys(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenKeys(v, full, out);
    else out.add(full);
  }
  return out;
}

// ─── main ────────────────────────────────────────────────────────────────
const routes = collectRoutes();
const files = walk(SRC);

const linkHits = []; // { file, href, raw }
const anchorHits = [];
const keyHits = []; // { file, ns, key }
const dynamicKeyWarnings = [];
const dynamicLinkWarnings = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);

  // track current namespace(s) in file. A file can call useTranslations/
  // getTranslations multiple times, each binding to its own variable.
  // We can't easily know which variable a given t() call used, so we
  // collect every namespace seen in the file and, when validating a
  // t("foo.bar") call, a key is considered present if it resolves under
  // ANY of these namespaces OR under root. That's accurate enough for
  // an audit pass — false negatives are worse than false positives here.
  const namespaces = new Set();
  for (const m of src.matchAll(RE_USE_TRANSLATIONS)) namespaces.add(m[1]);
  for (const m of src.matchAll(RE_GET_TRANSLATIONS_PLAIN)) namespaces.add(m[1]);
  for (const m of src.matchAll(RE_GET_TRANSLATIONS_OBJ)) namespaces.add(m[1]);

  // links — plain string hrefs
  for (const m of src.matchAll(RE_LINK_HREF_STR)) {
    let href = m[1];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    if (href.startsWith("/api") || href.startsWith("/admin")) continue;
    href = href.split("#")[0].split("?")[0];
    if (!href) continue;
    linkHits.push({ file: rel, href });
  }
  // links — template-literal hrefs. Substitute ${...} placeholders with a
  // sentinel that matches any dynamic segment (e.g. [slug]).
  for (const m of src.matchAll(RE_LINK_HREF_TPL)) {
    const tpl = m[1];
    if (tpl.includes("http")) continue;
    // each ${...} becomes a single URL segment placeholder
    const href = tpl.replace(/\$\{[^}]+\}/g, "__DYN__").split("#")[0].split("?")[0];
    if (!href.startsWith("/")) continue;
    if (href.startsWith("/api") || href.startsWith("/admin")) continue;
    if (!href) continue;
    linkHits.push({ file: rel, href, dynamic: true });
  }

  // anchors (raw <a>) — flag for review but don't 404-check
  for (const m of src.matchAll(RE_ANCHOR_HREF)) {
    const href = m[1];
    if (!href.startsWith("/")) continue;
    anchorHits.push({ file: rel, href });
  }

  // translation keys. Record the full set of namespaces in scope — the
  // validator below will consider the key a hit if it resolves under ANY
  // of them or under root.
  const nsArr = [...namespaces];
  for (const m of src.matchAll(RE_T_CALL)) {
    const key = m[1];
    keyHits.push({ file: rel, namespaces: nsArr, key });
  }
  // warn for dynamic keys
  const dynRe = /\bt(?:\.rich)?\(\s*`([^`]*\$\{[^`]*)/g;
  for (const m of src.matchAll(dynRe)) {
    dynamicKeyWarnings.push({ file: rel, expr: m[0] });
  }
}

// ─── 404 check ───────────────────────────────────────────────────────────
const broken = [];
for (const { file, href } of linkHits) {
  if (!matchRoute(href, routes)) broken.push({ file, href });
}

// ─── translation check ───────────────────────────────────────────────────
const messagesByLocale = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(MESSAGES, `${l}.json`), "utf8"))]),
);
const keysPerLocale = Object.fromEntries(
  LOCALES.map((l) => [l, flattenKeys(messagesByLocale[l])]),
);

const missing = []; // { ns, key, file, locales: [] }
const seenReferenced = new Set();
for (const { file, namespaces: nsArr, key } of keyHits) {
  // Record every plausible fully-qualified path so the orphan heuristic
  // below doesn't falsely call resolved keys "orphaned".
  if (nsArr.length === 0) seenReferenced.add(key);
  for (const n of nsArr) seenReferenced.add(`${n}.${key}`);
  seenReferenced.add(key);

  // A key is "present" if it resolves under any in-scope namespace OR at
  // the root. Only flag as missing if EVERY candidate fails.
  const candidates = nsArr.length ? [null, ...nsArr] : [null];
  const locMissing = [];
  for (const l of LOCALES) {
    const hit = candidates.some((c) => keyExists(messagesByLocale[l], c, key));
    if (!hit) locMissing.push(l);
  }
  if (locMissing.length) {
    const nsLabel = nsArr.length ? nsArr.join(" | ") : "—";
    missing.push({ file, ns: nsLabel, key, locales: locMissing });
  }
}

// Orphan = key present in en.json that we never referenced. The heuristic
// is conservative: we accept both exact and suffix matches (because the
// collected seenReferenced set stores both "ns.key" and "key").
const enKeys = keysPerLocale.en;
const orphans = [];
for (const k of enKeys) {
  const leaf = k.split(".").slice(-1)[0];
  const twoPart = k.split(".").slice(-2).join(".");
  let hit = false;
  for (const r of seenReferenced) {
    if (r === k) { hit = true; break; }
    if (r === leaf) { hit = true; break; }
    if (r === twoPart) { hit = true; break; }
    if (r.endsWith("." + k)) { hit = true; break; }
    if (k.endsWith("." + r)) { hit = true; break; }
  }
  if (!hit) orphans.push(k);
}

// ─── locale key-set parity ───────────────────────────────────────────────
const parity = [];
const enSet = keysPerLocale.en;
for (const l of LOCALES) {
  if (l === "en") continue;
  const lSet = keysPerLocale[l];
  const missingFromL = [...enSet].filter((k) => !lSet.has(k));
  const extraInL = [...lSet].filter((k) => !enSet.has(k));
  parity.push({ locale: l, missing: missingFromL, extra: extraInL });
}

// ─── write report ────────────────────────────────────────────────────────
const lines = [];
lines.push("# Link + translation sweep");
lines.push("");
lines.push("**Date:** 2026-04-23");
lines.push(
  "**Command:** `node scripts/sweep-links-translations.mjs` (this file).",
);
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push(`- Files scanned: **${files.length}**`);
lines.push(`- \`<Link>\` + \`<a>\` internal hrefs found: **${linkHits.length + anchorHits.length}**`);
lines.push(`- Broken internal links: **${broken.length}**`);
lines.push(`- Translation calls found: **${keyHits.length}**`);
lines.push(
  `- Missing translations (any locale): **${missing.length}**`,
);
lines.push(
  `- Dynamic \`t(\`...\`)\` calls (skipped — need manual check): **${dynamicKeyWarnings.length}**`,
);
lines.push("");

lines.push("## 1. Broken internal links");
lines.push("");
if (broken.length === 0) {
  lines.push("_None._ Every `<Link href>` resolves to a real page segment.");
} else {
  lines.push("| File | href |");
  lines.push("|---|---|");
  for (const { file, href } of broken) {
    lines.push(`| \`${file}\` | \`${href}\` |`);
  }
}
lines.push("");

lines.push("## 2. Locale parity");
lines.push("");
lines.push("EN is the source of truth. Other locales should have the same key set.");
lines.push("");
for (const { locale, missing: mv, extra } of parity) {
  lines.push(`### ${locale}.json`);
  lines.push("");
  lines.push(`- Missing keys (present in EN, missing here): **${mv.length}**`);
  lines.push(`- Extra keys (present here, missing in EN): **${extra.length}**`);
  if (mv.length) {
    lines.push("");
    lines.push("<details><summary>Missing keys</summary>");
    lines.push("");
    for (const k of mv.slice(0, 50)) lines.push(`- \`${k}\``);
    if (mv.length > 50) lines.push(`- … (+${mv.length - 50} more)`);
    lines.push("");
    lines.push("</details>");
  }
  if (extra.length) {
    lines.push("");
    lines.push("<details><summary>Extra keys</summary>");
    lines.push("");
    for (const k of extra.slice(0, 50)) lines.push(`- \`${k}\``);
    if (extra.length > 50) lines.push(`- … (+${extra.length - 50} more)`);
    lines.push("");
    lines.push("</details>");
  }
  lines.push("");
}

lines.push("## 3. Missing translation keys (code → messages)");
lines.push("");
if (missing.length === 0) {
  lines.push("_None._ Every static `t(\"...\")` resolves in every locale.");
} else {
  lines.push("| File | Namespace | Key | Missing in |");
  lines.push("|---|---|---|---|");
  for (const m of missing.slice(0, 200)) {
    lines.push(
      `| \`${m.file}\` | \`${m.ns ?? "—"}\` | \`${m.key}\` | ${m.locales.join(", ")} |`,
    );
  }
  if (missing.length > 200) lines.push(`\n… (+${missing.length - 200} more)`);
}
lines.push("");

lines.push("## 4. Dynamic translation keys (skipped by script)");
lines.push("");
if (dynamicKeyWarnings.length === 0) {
  lines.push("_None._");
} else {
  lines.push("These use template literals, so the script can't verify them statically. Check by hand.");
  lines.push("");
  const seen = new Set();
  for (const w of dynamicKeyWarnings) {
    const k = `${w.file}::${w.expr.slice(0, 80)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push(`- \`${w.file}\` — \`${w.expr.slice(0, 100)}\``);
  }
}
lines.push("");

lines.push("## 5. Orphaned keys (in messages, never referenced)");
lines.push("");
lines.push("Rough heuristic — may include keys used via dynamic lookup.");
lines.push("");
if (orphans.length === 0) {
  lines.push("_None._");
} else {
  lines.push(`${orphans.length} keys present in \`en.json\` that this script did not see in the code.`);
  lines.push("");
  lines.push("<details><summary>List</summary>");
  lines.push("");
  for (const k of orphans.slice(0, 100)) lines.push(`- \`${k}\``);
  if (orphans.length > 100) lines.push(`- … (+${orphans.length - 100} more)`);
  lines.push("");
  lines.push("</details>");
}
lines.push("");

lines.push("## Notes");
lines.push("");
lines.push("- Admin routes (`/admin/*`) are excluded from the 404 check because they don't sit under `[locale]`.");
lines.push("- API routes (`/api/*`) are excluded for the same reason.");
lines.push("- Dynamic hrefs (template literals with `${...}`) are normalised before matching — false positives/negatives are possible.");

writeFileSync(join(ROOT, "docs/audit-links-translations.md"), lines.join("\n"));
console.log(`Wrote docs/audit-links-translations.md`);
console.log(`  broken links: ${broken.length}`);
console.log(`  missing keys: ${missing.length}`);
console.log(`  parity issues: ${parity.reduce((a, p) => a + p.missing.length + p.extra.length, 0)}`);
