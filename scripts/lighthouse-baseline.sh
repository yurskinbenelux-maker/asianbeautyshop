#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# scripts/lighthouse-baseline.sh
#
# Captures a Lighthouse baseline against production for the four critical
# pages on both mobile + desktop. Saves dated HTML + JSON reports under
# `lighthouse/<YYYY-MM-DD>/`. Commit the folder so the baseline is in git
# and we can diff future runs against it.
#
# Usage:
#   bash scripts/lighthouse-baseline.sh
#
# Requires: Node ≥ 18 (uses `npx`). Lighthouse downloads on first run.
# Approx runtime: ~3 minutes (8 audits, ~20s each).
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

ORIGIN="https://yurskinsolution.eu"
DATE=$(date +%Y-%m-%d)
OUT="lighthouse/$DATE"
mkdir -p "$OUT"

# Pages to audit — keep small & critical. Add more once we have a routine.
PAGES=(
  "home::/en"
  "shop::/en/shop"
  "pdp::/en/shop/24k-gold-ampoule-15-ml"
  "cart::/en/cart"
)

STRATEGIES=("mobile" "desktop")

echo "▶  Lighthouse baseline → $OUT"
echo "   Origin: $ORIGIN"
echo

for pair in "${PAGES[@]}"; do
  name="${pair%%::*}"
  path="${pair##*::}"
  url="$ORIGIN$path"

  for strategy in "${STRATEGIES[@]}"; do
    out_html="$OUT/$name-$strategy.html"
    out_json="$OUT/$name-$strategy.json"
    echo "  ⏱  $name ($strategy) → $url"

    # --quiet suppresses log lines; --chrome-flags pinned to headless
    # so it works on any dev machine including CI later.
    npx --yes lighthouse "$url" \
      --quiet \
      --chrome-flags="--headless=new" \
      --preset="$strategy" \
      --only-categories=performance,accessibility,best-practices,seo \
      --output=html --output=json \
      --output-path="$OUT/$name-$strategy" \
      || echo "     ⚠  $name ($strategy) failed — continuing"
  done
done

echo
echo "✅  Reports written to $OUT/"
echo "   Open the HTML files in a browser to inspect. Score summary:"
echo

# Pull the four scores from each JSON (perf / a11y / bp / seo).
for pair in "${PAGES[@]}"; do
  name="${pair%%::*}"
  for strategy in "${STRATEGIES[@]}"; do
    json="$OUT/$name-$strategy.report.json"
    if [ -f "$json" ]; then
      node -e "
        const r = require('./$json');
        const c = r.categories;
        const s = (k) => c[k] ? Math.round(c[k].score * 100) : '—';
        console.log('  $name · $strategy  perf=' + s('performance') + '  a11y=' + s('accessibility') + '  bp=' + s('best-practices') + '  seo=' + s('seo'));
      "
    fi
  done
done
