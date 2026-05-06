# Kelmusgroup migration runbook

> Live, working checklist for migrating the YurSkin codebase + infrastructure to the Kelmusgroup brand and a new domain.
>
> **Conventions**
> - `[ ]` = todo · `[x]` = done · `[~]` = in progress
> - Owner tags: **MAX** (you), **SOFIA** (current owner), **CLIENT** (Kelmusgroup), **AUTO** (system / CI)
> - Whenever you tick a box, commit the doc — gives the client a live audit trail
> - **Replace `kelmusgroup.com` everywhere below** with the actual domain once you have it

---

## Phase 0 — Pre-flight (gather before you touch anything)

Get these in writing from the client BEFORE starting Phase 1. Half a day saved later.

- [ ] **CLIENT** Confirm exact brand name spelling — `Kelmusgroup` vs `Kelmus Group` vs `KELMUSGROUP` (every email subject, every legal page, every locale file depends on this)
- [ ] **CLIENT** Confirm new domain — `.com` / `.eu` / `.be` / something else
- [ ] **CLIENT** Provide brand logo files — SVG (preferred) + 512px PNG + 192px PNG + favicon source
- [ ] **CLIENT** Provide brand colour palette (or confirm we keep the existing K-ink palette)
- [ ] **CLIENT** Provide company legal info: registered name, VAT number, registered address, contact email, contact phone
- [ ] **CLIENT** Confirm sender email addresses we should use (`hello@`, `support@`, `orders@`, `noreply@`)
- [ ] **CLIENT** Provide registrar EPP / auth code for the domain transfer
- [ ] **CLIENT** Confirm whether old `yurskinsolution.eu` domain stays alive (recommended: yes, redirect to new domain for 12 months)
- [ ] **MAX** Take a full Supabase backup before any migration work starts (Supabase Dashboard → Database → Backups → Manual backup)
- [ ] **MAX** Tag a git release: `git tag pre-kelmus-migration && git push --tags` — your rollback anchor

---

## Phase 1 — Domain + DNS (5–7 days elapsed, mostly idle)

Start this first. It's the long pole — domain transfers take days.

- [ ] **CLIENT** Unlock domain at current registrar
- [ ] **MAX** Initiate domain transfer at Hostinger panel (Domains → Transfer)
- [ ] **MAX** Once transferred, set DNS records at Hostinger:
  - [ ] `A` `@` → Hostinger web hosting IP (panel shows it)
  - [ ] `A` `www` → same IP
  - [ ] `MX` → if mailboxes are needed (e.g. `info@kelmusgroup.com`)
  - [ ] `TXT` SPF for Resend: `v=spf1 include:_spf.resend.com ~all`
  - [ ] `TXT` DKIM (3 records) — Resend provides them when you add the domain
  - [ ] `TXT` DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@kelmusgroup.com`
- [ ] **MAX** Wait for DNS propagation (24–48h max — usually 1h). Verify with `dig kelmusgroup.com +short`
- [ ] **MAX** Confirm Hostinger auto-issues Let's Encrypt SSL cert. Visit `https://kelmusgroup.com` — should show valid lock

---

## Phase 2 — Codebase: branding + URL strings

Can run in parallel with Phase 1 (no live deploy yet — work on a branch).

- [ ] **MAX** Cut a branch: `git checkout -b kelmus-rebrand`
- [ ] **MAX** Find/replace audit (use `rg -l "yurskinsolution" src/ messages/`):
  - [ ] `yurskinsolution.eu` → `kelmusgroup.com` everywhere
  - [ ] `YurSkin Solutions` → `Kelmusgroup` everywhere
  - [ ] `YurSkin` → `Kelmusgroup`
  - [ ] `YU.R` → review case-by-case (it's the product brand the client sells, may stay; ask)
  - [ ] `yu·r` typographic logo references
- [ ] **MAX** Update `messages/{en,nl,fr,ru}.json` — every brand-name interpolation
- [ ] **MAX** Update logo files in `/public/brand/` with Kelmusgroup assets
- [ ] **MAX** Regenerate icon set: favicon, apple-touch-icon (180), PWA 192/512, OG image (1200×630)
- [ ] **MAX** Update `src/app/manifest.ts` — name + short_name + icons
- [ ] **MAX** Update JSON-LD Organization schema in `src/lib/seo/jsonld.ts` (or wherever) — name, sameAs, logo, url, address
- [ ] **MAX** Update email templates in `src/lib/email/` — logo URL, footer signature, sender name
- [ ] **MAX** Update Supabase auth email templates (in code, deployed via Supabase Studio in Phase 4)
- [ ] **MAX** Update `next.config.ts` if any image domains are pinned
- [ ] **MAX** Update `package.json` `name` field
- [ ] **MAX** Update `CLAUDE.md` + any READMEs
- [ ] **MAX** Update `/contact` page company block (registered name, VAT, address)
- [ ] **MAX** Update legal pages (privacy, T&Cs, returns) — replace company info via SiteCopy in `/admin/copy` after deploy, or hardcode for now
- [ ] **MAX** Update invoice template (`src/lib/invoices/`) — company header
- [ ] **MAX** Update cookie banner GDPR notice
- [ ] **MAX** Run `pnpm tsc --noEmit && pnpm next build` locally — must pass
- [ ] **MAX** Commit branch but DON'T merge yet — wait for Phase 3 + 4

---

## Phase 3 — External service config (do BEFORE going live)

Each service: prepare in parallel; flip the switch in Phase 4. Don't break the live site by updating webhooks before deploying the new domain code.

### 3a. Resend
- [ ] **MAX** Add `kelmusgroup.com` as a domain in Resend dashboard
- [ ] **MAX** Add the SPF/DKIM/DMARC records to Hostinger DNS (already in Phase 1)
- [ ] **MAX** Wait for "Verified" status in Resend (usually 5–15 min)
- [ ] **MAX** Keep `yurskinsolution.eu` ALSO verified for 30 days — orders in flight still send from old sender
- [ ] **MAX** New webhook URL `https://kelmusgroup.com/api/webhooks/resend` — set in Phase 4 after deploy
- [ ] **MAX** New env var: `RESEND_FROM_EMAIL="hello@kelmusgroup.com"` — push to Hostinger in Phase 4

### 3b. Sendcloud
- [ ] **SOFIA** Update sender (return) address on Sendcloud account if Kelmusgroup operates from a different physical address
- [ ] **MAX** New webhook URL → set in Sendcloud dashboard during Phase 4
- [ ] **MAX** Update label branding (logo, brand name) in Sendcloud panel

### 3c. Mollie
- [ ] **CLIENT** Update legal entity on Mollie account (if Kelmusgroup is a different legal entity than the YurSkin one)
- [ ] **MAX** New webhook URL → update in Mollie dashboard during Phase 4
- [ ] **MAX** New redirect URL `https://kelmusgroup.com/{locale}/checkout/success` → update during Phase 4
- [ ] **MAX** Update statement descriptor (what shows on customer's bank statement) → `KELMUSGROUP`
- [ ] **MAX** Upload new logo to Mollie hosted-checkout profile

### 3d. Supabase
- [ ] **MAX** Plan to update Auth → URL Configuration:
  - [ ] `Site URL` → `https://kelmusgroup.com`
  - [ ] `Redirect URLs` → add `https://kelmusgroup.com/**` (keep old domain redirects for 30 days)
- [ ] **MAX** Update Auth → Email Templates (4 templates: confirmation, magic link, password reset, change email) with new branding
- [ ] **MAX** Storage CORS allowlist — verify it's not pinned to old origin

### 3e. Groq
- [ ] **MAX** Open `/admin/settings/ai-prompt` after deploy → update brand name in system prompt

### 3f. cron-job.org
- [ ] **MAX** Inventory of cron jobs to update (12 total — verify with `ls src/app/api/cron/`):
  - [ ] `instagram-sync`
  - [ ] `abandoned-carts`
  - [ ] `back-in-stock`
  - [ ] `birthday`
  - [ ] `coupon-expiry-reminder`
  - [ ] `low-stock`
  - [ ] `loyalty-birthday`
  - [ ] `purge-deleted-users`
  - [ ] `replenishment`
  - [ ] `review-requests`
  - [ ] `visitor-ping-purge`
- [ ] **MAX** Strategy: create new jobs pointing at `kelmusgroup.com`, leave old ones disabled (not deleted) for 14-day shadow period

### 3g. GitHub
- [ ] **MAX** Decide: rename `yurskin-solution` repo to `kelmusgroup-shop` (GitHub auto-redirects) OR create new repo + push
- [ ] **MAX** Update local clone remote: `git remote set-url origin <new-url>`
- [ ] **MAX** Update Hostinger Git auto-deploy if repo URL changes

---

## Phase 4 — Switchover day (allow 4–6h focused work)

This is the only step where the site goes "down" for ~5 minutes. Schedule for low-traffic hours (Tue/Wed early morning Europe time).

- [ ] **MAX** Confirm domain resolves + SSL works on a test page on Hostinger
- [ ] **MAX** Update Hostinger env vars on the site:
  - [ ] `NEXT_PUBLIC_SITE_URL=https://kelmusgroup.com`
  - [ ] `NEXTAUTH_URL=https://kelmusgroup.com`
  - [ ] `RESEND_FROM_EMAIL=hello@kelmusgroup.com`
  - [ ] `COMPANY_NAME=Kelmusgroup`
  - [ ] `COMPANY_VAT=<new VAT>`
  - [ ] `COMPANY_ADDRESS=<new address>`
  - [ ] (any other brand-specific vars from your `.env.example`)
- [ ] **MAX** Merge `kelmus-rebrand` branch to `main`
- [ ] **MAX** Push — Hostinger auto-deploys
- [ ] **MAX** Watch deploy logs in Hostinger panel — confirm green
- [ ] **MAX** Smoke test on `kelmusgroup.com`:
  - [ ] Homepage loads
  - [ ] `/shop` loads, products visible
  - [ ] Open a PDP, add to cart
  - [ ] Sign up with a real email — check confirmation email arrives FROM `kelmusgroup.com`
  - [ ] Sign in
  - [ ] Place a real €1 test order with Mollie test mode
  - [ ] Confirm order email arrives, has correct branding
  - [ ] Check `/admin` loads
  - [ ] Check `/admin/marketing/instagram` (the bar still hides — we haven't connected IG yet)
- [ ] **MAX** Update Supabase Auth → URL Configuration (Site URL + Redirect URLs)
- [ ] **MAX** Update Resend webhook URL
- [ ] **MAX** Update Sendcloud webhook URL
- [ ] **MAX** Update Mollie webhook URL + redirect URL
- [ ] **MAX** Activate new cron-job.org jobs (one at a time, watch first run of each succeeds)
- [ ] **MAX** Disable old cron-job.org jobs (don't delete — keep for rollback)

---

## Phase 5 — Analytics + Ads cutover

Done after Phase 4 confirms the site is live.

### 5a. GA4
- [ ] **MAX** Decide strategy:
  - **Option A (recommended for clean break)**: New GA4 property → new measurement ID → put in env var
  - **Option B (continuous data)**: Add new domain as additional data stream on existing property
- [ ] **MAX** Update measurement ID in `.env` if Option A
- [ ] **MAX** Verify pageviews fire on the new domain (Realtime report)

### 5b. GTM
- [ ] **MAX** Update the existing `GTM-NJWQ2J5D` container variables that reference hostname (if any)
- [ ] **MAX** Re-test in GTM Preview Mode against `kelmusgroup.com`
- [ ] **MAX** Publish container

### 5c. Google Ads
- [ ] **MAX** Re-verify domain ownership in Google Ads (TXT record at Hostinger DNS)
- [ ] **MAX** Update final URLs in EVERY active ad — old `yurskinsolution.eu` URLs → new
- [ ] **MAX** Update sitelinks, callouts, structured snippets
- [ ] **MAX** Rewrite ad copy that mentions brand name
- [ ] **MAX** Check conversion actions still fire (do a real test purchase)
- [ ] **MAX** Memory says ads were paused 2026-05-05 — keep paused until ad copy + final URLs are migrated

### 5d. Google Search Console
- [ ] **MAX** Add `kelmusgroup.com` as new property
- [ ] **MAX** Verify ownership (TXT record at Hostinger DNS)
- [ ] **MAX** Submit `https://kelmusgroup.com/sitemap.xml`
- [ ] **MAX** Use the "Change of Address" tool in old `yurskinsolution.eu` property to point Google at the new domain — preserves SEO juice
- [ ] **MAX** Monitor migration report weekly for 90 days

### 5e. 301 redirects (old domain → new)
- [ ] **MAX** Confirm old domain still resolves (Hostinger panel)
- [ ] **MAX** Add a redirect rule: `yurskinsolution.eu/*` → `kelmusgroup.com/$1` (301 permanent). Hostinger does this in Domains → Forwarding, or via `_redirects` file
- [ ] **MAX** Test: `curl -I https://yurskinsolution.eu/shop` should return `301` + Location header to new domain

---

## Phase 6 — Customer + post-migration comms

- [ ] **CLIENT** Approve customer comms email body
- [ ] **MAX** Send rebrand announcement email to the full subscriber list via Resend (one-off campaign):
  - Subject: "We're now Kelmusgroup — same products, new home"
  - Explains the rename
  - Notes that future emails come from `@kelmusgroup.com`
  - Reassures: orders, points, account details all carried over
- [ ] **MAX** Update social profile links on new domain (Instagram bio, future Facebook)
- [ ] **MAX** Update `sameAs` URLs in JSON-LD if social handles changed
- [ ] **MAX** Update Hostinger email signatures + auto-responders (if any)

---

## Phase 7 — Verification (Day +1, Day +7, Day +30)

A simple cadence to catch silent failures.

### Day +1
- [ ] **MAX** Check Resend dashboard — bounces, complaints, deliveries from new domain
- [ ] **MAX** Place a real €1 order through entire funnel — confirm all 3 emails arrive (customer confirm, admin notify, when shipped)
- [ ] **MAX** Check Mollie dashboard — payment + refund work
- [ ] **MAX** Check cron-job.org — first runs of new jobs all succeeded
- [ ] **MAX** Check Sendcloud — new shipment auto-created from real order

### Day +7
- [ ] **MAX** Check Search Console — old domain crawl errors should be dropping, new domain pages indexed
- [ ] **MAX** Check GA4 — traffic curve continuous (no big drop = redirects working)
- [ ] **MAX** Check Resend — domain reputation healthy

### Day +30
- [ ] **MAX** Disable old `yurskinsolution.eu` Resend domain (no more legacy senders)
- [ ] **MAX** Delete old cron-job.org jobs
- [ ] **MAX** Decide: keep `yurskinsolution.eu` redirecting forever, or sunset after 12 months
- [ ] **MAX** Tag the milestone: `git tag kelmus-migration-stable`

---

## Rollback plan (if something catastrophic happens during Phase 4)

If Phase 4 deploy is broken in a way you can't fix in 30 min:

1. In Hostinger, redeploy from the `pre-kelmus-migration` git tag — site goes back to YurSkin branding on the old `kelmusgroup.com` domain (looks weird but works)
2. Revert Supabase Auth URL config to `yurskinsolution.eu`
3. Revert Mollie + Sendcloud + Resend webhooks back to old domain
4. Old domain still resolves, old cron jobs still run — site is functional under the old brand
5. Investigate, fix, retry the merge later

The full backup from Phase 0 + the git tag = nothing is permanently lost.

---

## Estimated effort

| Phase | Wall time | Active work |
|-------|-----------|-------------|
| 0 — Pre-flight | 1 day | 2h |
| 1 — Domain + DNS | 5–7 days | 1h |
| 2 — Codebase | 2 days | 10–14h |
| 3 — Service config | 1 day (parallel) | 4h |
| 4 — Switchover day | 4h elapsed | 4h |
| 5 — Analytics + Ads | 1 day | 4–6h |
| 6 — Customer comms | 1 day | 2h |
| 7 — Verification | 30 days | 1h total |
| **TOTAL** | **~3 weeks elapsed** | **~30h focused work** |

The 30 hours is the realistic estimate — quote the client a buffer of 40h to be safe.

---

## One-page summary (when client asks "what does this take?")

> Migrating to a new domain + brand isn't one job, it's about 12 jobs running in parallel: domain transfer, DNS, codebase rebrand, 5+ external service reconfigurations, Google Analytics/Ads/Search Console cutover, customer comms, and a 30-day shadow period. About 30 hours of focused work spread over 3 weeks elapsed. The risky moment is a 4-hour window on switchover day; everything else can be done without affecting the live site. We have a rollback plan and a full backup before starting.
