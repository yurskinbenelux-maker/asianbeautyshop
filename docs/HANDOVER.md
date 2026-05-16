# Asian Beauty Shop — Operations & Handover Guide

This document explains how the **asianbeautyshop.eu** webshop is built, how every external service is used, and how the business operates day-to-day. It is written for whoever takes over running, maintaining, or extending the shop after the original build team — owner, operator, accountant, or a future developer.

---

## Table of contents

1. [What is Asian Beauty Shop?](#1-what-is-asian-beauty-shop)
2. [How the website is built](#2-how-the-website-is-built)
3. [Every external service, what it does, where to find it](#3-every-external-service-what-it-does-where-to-find-it)
4. [The customer journey from start to finish](#4-the-customer-journey-from-start-to-finish)
5. [The admin journey — running the shop](#5-the-admin-journey--running-the-shop)
6. [Money flow](#6-money-flow)
7. [Logistics flow — shipping, tracking, returns](#7-logistics-flow--shipping-tracking-returns)
8. [Email & marketing systems](#8-email--marketing-systems)
9. [Legal & compliance](#9-legal--compliance)
10. [Costs at steady state](#10-costs-at-steady-state)
11. [Maintenance schedule](#11-maintenance-schedule)
12. [Disaster recovery & backups](#12-disaster-recovery--backups)
13. [Accounts & credentials inventory](#13-accounts--credentials-inventory)
14. [Glossary](#14-glossary)

---

## 1. What is Asian Beauty Shop?

**Asian Beauty Shop** is a luxury Korean skincare webshop. It is the trading storefront of **K'Elmus Group BV**, a Belgian limited company registered at Boomsesteenweg 41/4b, 2630 Aartselaar. The website sells multiple Asian beauty brands — currently YU.R, Yu.R PRO, and Yu.R Me — with the ability to add more brands at any time from the admin panel.

The shop ships across the Benelux and the EU. It is fully multilingual (English, Dutch, French, Russian), GDPR-compliant, and follows Belgian VAT/invoicing rules including credit notes (creditnota's) with the legally required sequential numbering and 7-year retention.

The website is more than a catalogue — it is a complete e-commerce operating system. The owner runs the entire business from the `/admin` panel without ever touching code: adding products, editing prices, managing inventory, processing orders, issuing refunds, configuring marketing popups, tuning the AI assistant, and exporting VAT reports.

---

## 2. How the website is built

### The big picture

The site is a single **Next.js 15** application written in **TypeScript**. It is deployed to a **Hostinger Business** Node.js server, sitting behind **Cloudflare** for global content delivery and security. All data — products, orders, customers, content — lives in a **Supabase** Postgres database in Frankfurt (eu-central-1). Files (product images, journal photos, videos) are stored in Supabase Storage.

When a customer types `asianbeautyshop.eu` in their browser, the request goes:

1. **Browser** → Cloudflare's nearest edge server
2. **Cloudflare** → if the page is cached, served instantly from the edge
3. Otherwise → forwarded to the **Hostinger** Node server
4. **Hostinger** → runs the Next.js app, which queries **Supabase** for any data needed
5. The HTML + images are sent back through Cloudflare, which caches them for next time

Page loads are typically under a second for repeat visitors. The first visitor of each minute pays the full server round-trip; everyone behind them gets the cached version.

### Why this stack

| Choice | Why |
| --- | --- |
| **Next.js** | The fastest framework for SEO-critical commerce sites. Renders pages on the server (good for Google) but also feels app-like in the browser. Built-in image optimisation, internationalisation, and server actions. |
| **TypeScript** | Catches whole classes of bugs before they hit production. Every database query and API call is type-checked. |
| **Prisma + Supabase** | Prisma is a type-safe database client. Supabase is hosted Postgres with built-in authentication and file storage, so we don't run our own servers for any of those. |
| **Hostinger Business** | Generous Node.js hosting for the price (~€10/month), straightforward GitHub auto-deploy, EU-based for GDPR. |
| **Cloudflare** | Free CDN, free DNS, free SSL, free DDoS protection. Makes the site faster everywhere and protects against most automated attacks. |

### The repository

Source code lives in a private GitHub repository under the `yurskinbenelux-maker` account: `yurskin-solution`. Every change is committed and pushed to the `main` branch; Hostinger detects the push and rebuilds the live site automatically (typically within 3–4 minutes).

The code is organised into:

- `src/app/[locale]/` — what visitors see (homepage, shop, product pages, cart, etc.)
- `src/app/admin/` — what the owner sees when logged in to `/admin`
- `src/app/api/` — webhook receivers (payments, shipping, email events)
- `src/components/` — reusable building blocks (buttons, forms, cards, popups)
- `src/lib/` — connections to external services and business logic
- `prisma/schema.prisma` — the database structure (every table and field, fully commented)
- `messages/{en,nl,fr,ru}.json` — every translatable piece of text

---

## 3. Every external service, what it does, where to find it

The shop depends on the following external services. Each section below explains what the service does, where to log in, how it costs money, and what breaks if it goes down.

### 3.1 Hostinger (hosting + domain + mailboxes)

**Login:** https://hpanel.hostinger.com — owner's account
**Purpose:** Runs the Node.js process that serves the website. Manages the `asianbeautyshop.eu` domain registration. Hosts the company mailboxes (`info@asianbeautyshop.eu`, etc.).
**Cost:** Annual plan, roughly €100–180/year for the Business tier depending on promo.
**What breaks if it's down:** The website is offline. Cloudflare will still serve cached pages for a short while, but new requests fail. Emails sent TO the company mailboxes bounce.

Hostinger is also where:
- Environment variables are configured (Supabase URL, Mollie API key, etc.) — found at **Websites → asianbeautyshop.eu → Node.js app → Environment variables**.
- Auto-deploy from GitHub is configured (already set up; pushes to `main` redeploy automatically).
- DNS records originally lived (but DNS is now managed at Cloudflare — see below).

### 3.2 Cloudflare (CDN, DNS, security)

**Login:** https://dash.cloudflare.com — `yurskin.benelux@gmail.com`
**Purpose:** Cloudflare sits between visitors and the Hostinger server. It serves cached pages from data centres around the world (so a customer in Brussels gets the same speed as one in Amsterdam or Berlin), provides free SSL certificates, and blocks malicious traffic.
**Cost:** Free tier — sufficient indefinitely. Pro tier (~$20/month) gains image resizing and richer analytics, not required.
**What breaks if it's down:** Visitors get a "Cloudflare error" page instead of the shop. Rare but possible. In that scenario you can temporarily disable Cloudflare proxy in DNS settings (toggle the orange cloud to grey) so traffic goes straight to Hostinger.

Cloudflare is configured with:
- A Cache Rule that caches the homepage HTML for 60 seconds per locale (so repeat visitors get an instant page)
- Always Use HTTPS
- Bot protection (free tier)
- Google Tag Gateway (the GTM container loads through Cloudflare's first-party proxy, defeating most ad-blockers and improving analytics signal)

### 3.3 Supabase (database, authentication, file storage)

**Login:** https://app.supabase.com — owner's account
**Purpose:** The single source of truth for everything. Products, orders, customers, inventory movements, journal posts, marketing settings — all live here. Customer accounts and admin logins are managed by Supabase Auth. Product photos, journal cover images, and the homepage video all live in Supabase Storage in a public bucket called `yur-media`.
**Cost:** Free tier suffices under ~50 000 monthly active users; Pro tier ($25/month) recommended for production because it disables the auto-pause feature and provides 7-day automatic backups. The shop is currently on the Pro tier.
**What breaks if it's down:** The website cannot load any page that needs database data (which is most of them). The homepage might still serve from Cloudflare cache briefly. Catastrophic — but extremely rare.

Key Supabase locations:
- **Database** — the live data. Browse via Table Editor.
- **Auth → Users** — every registered customer + admin.
- **Auth → Email Templates** — the branded confirmation, magic-link, and password-reset emails are configured here (4 locales each via Go template conditionals).
- **Storage → yur-media** — all product images, journal photos, hero video.
- **Settings → Database → Connection pooling** — connection strings used by the app.
- **Settings → Backups** — point-in-time recovery, 7 days back on Pro.

### 3.4 Mollie (payments)

**Login:** https://my.mollie.com — registered to K'Elmus Group BV
**Purpose:** Processes every customer payment. Accepts cards (Visa, Mastercard, Amex), Bancontact, iDEAL, Apple Pay, Google Pay, PayPal, and SEPA bank transfer. Handles refunds when the admin issues them. Settles funds to the K'Elmus Group business bank account weekly.
**Cost:** No monthly fee. Per-transaction fees apply: roughly **€0.25 + 1.8%** for cards, **€0.39** flat for Bancontact, **€0.29** flat for iDEAL. Refunds are free; the original payment fee is NOT refunded by Mollie when the transaction is refunded.
**What breaks if it's down:** New customers cannot complete checkout. Existing pending payments may stay stuck "pending" until Mollie returns. Existing orders remain fine.

Key Mollie locations:
- **Dashboard → Payments** — every transaction.
- **Dashboard → Refunds** — every refund issued.
- **Dashboard → Settings → Webhooks** — the `asianbeautyshop.eu/api/webhooks/mollie` endpoint where Mollie notifies us of payment state changes. Must remain pointed at the live domain.
- **Dashboard → Profile → Statement descriptor** — the text shown on customer bank statements (configured as "ASIAN BEAUTY SHOP").
- **Dashboard → Payouts** — when money settles to the company bank account.

### 3.5 Sendcloud (shipping)

**Login:** https://app.sendcloud.com — K'Elmus Group account
**Purpose:** Generates shipping labels for every order, integrates with multiple carriers (bpost, PostNL, DHL, GLS, DPD), provides automatic tracking emails, and handles return labels. When the admin clicks "Mark as shipped" in the order page, Sendcloud creates the parcel and returns a tracking number; that number is sent to the customer automatically.
**Cost:** No monthly fee on the basic plan. Per-parcel cost = whatever the carrier charges + Sendcloud's margin (negotiated rates are typically cheaper than going direct).
**What breaks if it's down:** New shipping labels can't be created. Existing tracking links still work because they're cached on the customer's confirmation email. Worst-case: the admin generates labels manually from the carrier website until Sendcloud returns.

Key Sendcloud locations:
- **Dashboard → Shipments** — every parcel that has been created.
- **Dashboard → Settings → Shipping rules** — which carrier is used for which destination/weight. Currently set up to pick the cheapest stamped/tracked option per zone.
- **Dashboard → Settings → Integrations → Webhooks** — the `asianbeautyshop.eu/api/webhooks/sendcloud` endpoint that pushes tracking updates back into our system.
- **Dashboard → Returns portal** — the customer-facing return flow embedded at `/account/returns`.

### 3.6 Resend (transactional + marketing email)

**Login:** https://resend.com — owner's account
**Purpose:** Sends every email the website generates — order confirmations, shipping notifications, password resets, newsletters, abandoned cart reminders, birthday gifts, return status updates, and more. There are 18+ email templates, all branded with the ABS visual identity.
**Cost:** Free tier covers **3 000 emails/month**. Above that, the Pro tier is **$20/month for 50 000 emails**. The shop runs on the free tier today; expect to upgrade once the customer base passes ~500 monthly orders.
**What breaks if it's down:** Customers don't receive order confirmations or shipping updates. Orders still complete and ship — they just don't get the email. Resend has a dashboard that records every send attempt so the admin can resend manually.

Key Resend locations:
- **Dashboard → Emails** — every email sent, with delivery status.
- **Dashboard → Domains → asianbeautyshop.eu** — proof that the sender domain is verified (DKIM, SPF, DMARC). Required for emails to reach inboxes rather than spam.
- **Dashboard → Webhooks** — the `asianbeautyshop.eu/api/webhooks/resend` endpoint that captures bounces and spam complaints so we can stop emailing bad addresses.

### 3.7 Groq (AI assistant)

**Login:** https://console.groq.com — owner's account
**Purpose:** Powers the AI skincare concierge — the floating "orb" in the bottom-right corner of the public site. The concierge can answer skincare questions, take a 7-step quiz, and recommend products from the live catalogue. It uses Meta's Llama 4 Scout model hosted by Groq.
**Cost:** Free tier with generous rate limits (sufficient for the current traffic). Paid tier available if usage grows.
**What breaks if it's down:** The orb stops responding — the chat panel shows a friendly error. Everything else on the site continues to work.

Key Groq locations:
- **Dashboard → API Keys** — the `GROQ_API_KEY` environment variable on Hostinger reads from here. Rotate yearly.

### 3.8 DeepL (translation)

**Login:** https://www.deepl.com/pro-account — owner's account
**Purpose:** Powers the "Translate to NL/FR/RU" button in every admin editor (product copy, ingredient descriptions, journal posts, popup text). The admin writes once in English; DeepL fans the text out to the three other locales.
**Cost:** Free tier covers **500 000 characters/month**, which is more than enough for normal catalogue editing. Pro starts at ~€5/month for more characters.
**What breaks if it's down:** The Translate button fails silently — the admin can still type translations manually.

### 3.9 Google Workspace (mailboxes)

**Login:** https://admin.google.com — owner's account
**Purpose:** Hosts the company email addresses (`info@asianbeautyshop.eu`, `info@kelmusgroup.eu`, etc.) with the full Gmail interface, calendar, drive. Required for the admin to send and receive emails from the customer-facing addresses.
**Cost:** **€11.50/mailbox/month** (Business Standard).

### 3.10 Google Tag Manager + GA4 (analytics)

**Login:** https://tagmanager.google.com + https://analytics.google.com
**Purpose:** Tracks anonymous visitor behaviour — pageviews, scroll depth, add-to-cart events, completed purchases. Powers conversion measurement for any future Google Ads campaigns.
**Cost:** Free.
**What breaks if it's down:** No analytics data for the affected period. The shop still works fine.

The GTM container loads through Cloudflare's Tag Gateway, which restores ~15–30% of the analytics signal that ad-blockers and Safari's tracking prevention would otherwise drop. Consent Mode v2 is fully wired up: cookies are denied by default in the EU until the customer accepts the cookie banner.

### 3.11 Google Merchant Center + Google Ads

**Login:** https://merchants.google.com + https://ads.google.com
**Purpose:** Merchant Center stores the product feed (auto-generated at `asianbeautyshop.eu/api/feeds/google-merchant.xml`); Google Ads can use it for Shopping campaigns. Currently Google Ads is paused — the code is shipped and ready, the container is empty pending a budget decision. See `docs/google-ads-roadmap.md` for the suggested phased approach (Brand defense → Shopping/Remarketing → Long-tail → Scale).

### 3.12 Google Search Console

**Login:** https://search.google.com/search-console
**Purpose:** Tells Google our sitemap location, monitors organic search performance, alerts on indexing problems. The sitemap lives at `asianbeautyshop.eu/sitemap.xml` and updates automatically.
**Cost:** Free.

### 3.13 cron-job.org (scheduled tasks)

**Login:** https://console.cron-job.org — owner's account
**Purpose:** Triggers the website's recurring background jobs by hitting designated URL endpoints on a schedule. We have ~12 scheduled tasks: abandoned cart sweep, order status reconcile, birthday gift dispatch, replenishment reminders, back-in-stock notifications, subscription renewals, loyalty expiry warnings, gift card expiry warnings, and more.
**Cost:** Free tier sufficient.
**What breaks if it's down:** Time-sensitive automated emails (e.g., abandoned cart reminders) don't go out for the affected period. No data is lost — they'll resume on the next successful cron run.

### 3.14 GitHub (source code)

**Login:** https://github.com — `yurskinbenelux-maker` account owns the private repo `yurskin-solution`.
**Purpose:** Source-of-truth for every line of code. Every change is committed here; Hostinger watches the `main` branch and redeploys on every push.
**Cost:** Free for private repositories.

---

## 4. The customer journey from start to finish

A typical first-time customer experience, end-to-end:

1. **Discovery.** They click a Google search result, an Instagram link, or type the URL directly. Cloudflare serves the cached homepage (or, on a fresh cache, Hostinger renders it in ~500ms).
2. **Welcome popup.** After 3 seconds on the homepage, a welcome popup offers 10% off the first order in exchange for creating an account. The popup is suppressed for 14 days after dismissal or sign-up, and never appears on cart/checkout/admin/account pages.
3. **Browse.** They navigate `/shop`, filter by skin type or concern, switch between brand tabs, scroll through the infinite product grid. Quick-view modals let them peek at products without leaving the page.
4. **Product detail page.** They click a product. The PDP shows the gallery, ingredient breakdown, "how to use" routine, related products, reviews, "complete your routine" bundle, and the type/volume selector. Stock urgency appears when inventory is low ("Only 2 left").
5. **AI concierge** (optional). The floating orb invites them to take a skin quiz or chat freely. The quiz asks 7 ingredient-scored questions and recommends a tailored routine.
6. **Add to cart.** A toast confirms the addition; the cart drawer slides in showing the running total, free-shipping progress, and a "Take the quiz for 15% off" upsell.
7. **Checkout.** They proceed to `/checkout`, fill in name + email + address (with autocomplete), pick a shipping method, optionally apply a coupon code or gift card (multiple gift cards stackable), and choose a payment method. Apple Pay and Google Pay shortcut the address step entirely.
8. **Mollie redirect.** They are sent to Mollie's hosted payment page for the chosen method. They complete the payment and are redirected back to `asianbeautyshop.eu/checkout/success`.
9. **Confirmation.** A success page renders the order summary. A confirmation email lands within 30 seconds, with the PDF invoice attached. The order timeline begins.
10. **Admin notification.** The admin receives a "New order" email within a minute, with all the order details.
11. **Fulfilment.** The admin opens `/admin/orders`, clicks the new order, reviews it, and clicks "Mark as shipped" (or uses bulk-mark-shipped if several orders are ready). Sendcloud generates the label, the tracking number is saved, and the customer receives a shipping notification email with the tracking URL.
12. **Delivery.** The parcel arrives. The carrier's webhook tells Sendcloud, which tells us, which updates the order timeline.
13. **Post-purchase.** 7 days after delivery, the customer receives a review request email. 45 days after delivery, they receive a replenishment reminder ("Time to restock?") with a one-click reorder button. On their birthday, a birthday gift email arrives with a 10% off coupon. If they joined the A-Beauty Club, they earn points on every purchase.

---

## 5. The admin journey — running the shop

The admin panel is at `https://asianbeautyshop.eu/admin`. The owner signs in with their Supabase account. Roles control what each admin can see: **owner** (full access), **editor** (catalogue + content, no orders), **fulfilment** (orders + shipping only).

### Daily / typical workflows

**Adding a new product (5–10 minutes):**
1. `/admin/products` → "New product"
2. **Basics** tab: name, slug, brand, price, status (Draft/Published), volume/weight, barcode, shelf life
3. **Organise** tab: pick categories, skin types, concerns, benefits, ingredients, AI-generated suggestions one click away
4. **Variants** tab (optional): add shade/scent variants with their own SKU, stock, price, optional volume override
5. **Translations** tab: write the English description and short description, then click "Translate to NL/FR/RU" to fan it out (review the auto-translations for tone)
6. **SEO** tab: meta title, description, OG image — auto-generated suggestions available
7. **Media** tab: drag and drop images (multiple), pick the primary, set alt text
8. Save → Publish

**Processing a return:**
1. Customer initiates the return from `/account/orders/[id]/return`
2. Admin sees it in `/admin/returns` with status "Requested"
3. Admin reviews the reason and either approves (auto-generates a Sendcloud return label and emails it) or declines (the customer is notified)
4. When the customer's return parcel arrives back, admin clicks "Mark as received"
5. The system automatically: issues a Mollie refund for the line items returned, replenishes stock, reverses loyalty points earned on those items, creates a Belgian credit note (creditnota) with sequential numbering, and emails the customer

**Editing the homepage:**
- `/admin/homepage` for the text copy (eyebrows, headlines, lede paragraphs — all per-locale, with "Hide on site" toggles)
- `/admin/homepage/hero` for the hero variant (Typography / Cinematic video / Color block) and its assets, including the video focal-point picker for desktop and mobile

**Configuring a promotion:**
- `/admin/marketing/promotions` is the single source of truth for discount percentages. Change it once; the welcome popup, exit-intent popup, quiz reward, and navigation `-X%` chip all update.

**Issuing a refund manually:**
- `/admin/orders/[id]` → "Refund" → choose full or partial (per-line-item)
- Behind the scenes: Mollie API call, credit note generation, stock replenish, loyalty reversal, customer email — all atomic

**Tracking VAT:**
- `/admin` dashboard shows VAT YTD revenue at the top
- `/admin/analytics` has a "BTW-aangifte" quarterly export — a CSV ready for the accountant

---

## 6. Money flow

```
Customer pays €54.99
        │
        ▼
Mollie collects → deducts ~€1.24 in fees
        │
        ▼
Mollie holds the balance for the standard rolling settlement period (5–7 days)
        │
        ▼
Mollie pays out weekly to the K'Elmus Group business bank account
        │
        ▼
Bank statement matches the Mollie payout report (downloadable per period)
        │
        ▼
Accountant reconciles using the quarterly VAT export from the admin panel
```

**Refunds** go the same way in reverse. The Mollie fee on the original transaction is NOT refunded — that's lost revenue on returned orders. The Belgian credit note created at refund time records this correctly for the bookkeeping.

---

## 7. Logistics flow — shipping, tracking, returns

```
Order placed → status "Paid"
        │
        ▼
Admin clicks "Mark as shipped" (or bulk-mark from the orders list)
        │
        ▼
Sendcloud creates a shipping label using the configured shipping rules
        │
        ▼
Tracking number saved + customer emailed
        │
        ▼
Carrier picks up, updates Sendcloud, Sendcloud updates us via webhook
        │
        ▼
Order timeline reflects each step (Created → Picked up → In transit → Delivered)
        │
        ▼
On Delivered: post-purchase review request scheduled (T+7), replenishment reminder (T+45)
```

**Returns** are customer-initiated:

```
Customer opens /account/orders/[id] → "Return this order"
        │
        ▼
They pick which items, give a reason, choose self-postage or Sendcloud label
        │
        ▼
Admin sees it in /admin/returns → review → approve or decline
        │
        ▼
On approve: return label generated (Sendcloud) and emailed to the customer
        │
        ▼
Customer ships it back
        │
        ▼
Admin clicks "Mark as received" once the parcel is back
        │
        ▼
Atomic transaction: Mollie refund + stock replenish + loyalty reversal + credit note
        │
        ▼
Customer + admin both emailed
```

---

## 8. Email & marketing systems

Every customer-facing email is sent via Resend, branded with the ABS visual identity, and configurable from `/admin/emails`. There are three categories:

**Transactional (must reach inbox):**
- Order confirmation (PDF invoice attached)
- Shipped (with carrier tracking URL)
- Cancelled / refunded
- Auth: email confirmation, magic link, password reset, change email (per-locale Go template)
- Return status changes (received, refunded)

**Automated marketing:**
- Welcome series (10% off coupon for new account)
- Abandoned cart (1 hour, 24 hours after cart abandonment)
- Post-purchase review request (T+7 days after delivery)
- Replenishment reminder (T+45 days after delivery)
- Back-in-stock notification
- Birthday gift (annual, 10% off coupon)
- Subscription renewal reminders
- A-Beauty Club: milestone unlocked, points expiring soon, referral reward credited
- Gift card: purchased, balance reminder

**Operational alerts (to the admin):**
- New order notification
- Low-stock alert (per variant, threshold configurable)
- Failed payment retry suggestion
- Newsletter bounce/complaint summary (weekly)

**Marketing popups** (configured at `/admin/marketing`):
- **Welcome popup** — fires 3 seconds after first paint on the homepage. Offers a discount for account registration. 14-day suppression cookie on dismissal.
- **Hero popup** — a magazine-mosaic editorial popup featuring 3–6 hand-picked products, with per-product image cropping. Fires after the welcome popup is dismissed.
- **Quiz popup** — nudges visitors to take the skin quiz for a 15% reward coupon. Fires after the hero popup.
- **Exit-intent popup** — fires when the customer's cursor leaves the viewport, offering 10% off in exchange for an email.

All popups have a kill switch and a 14-day per-user frequency cap.

**A-Beauty Club** (loyalty program, configurable at `/admin/a-beauty-club`):
- Tiers with thresholds (e.g., Bronze 0pt, Silver 500pt, Gold 2000pt)
- Earn rules (points per euro spent, points per review, points per referral)
- Reward rewards (% discounts, free gifts redeemable for points)
- Referral system with stack-prevention (you can't refer yourself or stack with welcome coupons)

---

## 9. Legal & compliance

### Belgian VAT

The shop is registered for Belgian VAT. The default rate is **21%** applied to most cosmetics. Specific products can override the rate per-product (configurable in admin product → Settings).

- VAT is calculated at checkout, shown to the customer, included in the invoice line items.
- Quarterly **BTW-aangifte** export is available from `/admin/analytics` → BTW report. Hand it to the accountant before the 20th of January, April, July, October.
- Year-end totals visible on the `/admin` dashboard ("VAT YTD").

### Invoices

Every paid order auto-generates a PDF invoice with:
- Sequential invoice number (`ABS-YYYY-NNNN`, starting fresh each calendar year)
- K'Elmus Group BV details (name, VAT, address)
- Customer details + delivery address
- Per-line items with quantity, unit price, VAT %, VAT amount, total
- Final total in EUR
- Bank details (for SEPA-paid orders)
- 7-year retention required by Belgian law

### Credit notes (creditnota's)

When the admin refunds an order (fully or partially), a credit note is automatically generated:
- Sequential number (`CN-YYYY-NNNN`, separate sequence from invoices)
- Same legal entity info
- Negative amounts matching what was refunded
- Linked to the original invoice number
- Same 7-year retention requirement

Both invoices and credit notes are downloadable from the admin order page AND attached to the related customer email.

### GDPR

- **Cookie banner** appears on first visit. Customers can accept all, reject all (Consent Mode v2 sends "denied" signals), or accept analytics only.
- **Newsletter double opt-in** — subscribing sends a confirmation email; the customer must click to confirm.
- **Subject access request** flow at `/admin/customers/[id]` — owner can export everything we hold on a customer to a JSON file, or anonymise/delete the account (the audit trail is preserved with the email replaced).
- **Right to be forgotten** — deleting a customer in admin removes their personal data but retains the order records (legally required for accounting) with the customer fields anonymised.

### Privacy / Terms

The legal pages (`/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/returns`) are editable from `/admin/pages` and reflect K'Elmus Group BV as the data controller.

---

## 10. Costs at steady state

Approximate monthly cost for a shop doing ~100 orders/month. Many costs scale with order volume.

| Vendor | Tier | Monthly cost |
| --- | --- | --- |
| Hostinger Business | Annual | €8–15 |
| Cloudflare | Free | €0 |
| Supabase | Pro | $25 (~€23) |
| Resend | Free (≤ 3 000 emails) | €0 |
| Groq | Free | €0 |
| DeepL | Free | €0 |
| cron-job.org | Free | €0 |
| Google Workspace | per mailbox | €11.50/seat |
| Domain (.eu) | Annual | ~€1/month |
| Mollie | per-transaction | ~€1.20/order (varies by method) |
| Sendcloud | per-parcel | ~€4–7/order (varies by destination + weight) |
| **Fixed costs (excl. per-order)** | | **~€45–70/month** |
| **Per-order incremental costs** | | **~€5–8/order** |

At 100 orders/month, total cost ≈ **€600–870/month**, of which ~€500–800 is variable (Mollie + Sendcloud per order). At 500 orders/month, fixed costs barely move; variable dominates.

---

## 11. Maintenance schedule

### Daily (5 min, by admin)

- Check `/admin` dashboard for the day's orders, refunds, and any low-stock alerts
- Process any new orders (mark as shipped if ready)
- Triage any new customer support emails or contact-form submissions (`/admin/messages`)
- Glance at the orders list for any "Return requested" indicators

### Weekly (15 min)

- Review and approve/decline any pending returns
- Check the **A-Beauty Club** queue for manual task submissions awaiting review
- Glance at the **bounce/complaint** report from Resend — remove any consistently bouncing email addresses
- Check the **Sendcloud** dashboard for any stuck shipments

### Monthly

- Review **Google Search Console** for any indexing issues or new search queries trending
- Review **GA4** to see conversion rate and where visitors come from
- Cross-check **Mollie payouts** against the bank statement
- Look at **VAT YTD** vs. expected — flag the accountant if anything looks unusual

### Quarterly

- Export the **BTW-aangifte** from `/admin/analytics` and forward to the accountant by the 20th of the month following the quarter
- Export invoices + credit notes for the quarter (`/admin/invoices` → quarterly ZIP)
- Review pricing, promotions, and best-sellers — adjust the home page hero or featured products if needed

### Annually

- Renew the `asianbeautyshop.eu` domain in Hostinger (or let auto-renew handle it — recommended)
- Audit access: who still needs admin access? Remove anyone who's left.
- Rotate the most sensitive API keys (Mollie, Supabase service role, Groq) — set a calendar reminder
- Review running costs vs. revenue — upgrade Supabase or Resend tiers if approaching limits

---

## 12. Disaster recovery & backups

### What's backed up automatically

- **Database**: Supabase Pro keeps automatic backups for 7 days (point-in-time recovery). Catastrophic recovery requires opening a Supabase support ticket.
- **Source code**: GitHub. Cloning the `yurskin-solution` repo gives you the complete codebase.
- **Media (images/video)**: Supabase Storage. Lives in the same project as the database; same retention.
- **Emails sent**: Resend retains email logs for 30 days on the free tier.

### What's NOT backed up automatically (and how to handle it)

- **Mollie payments** — Mollie keeps its own indefinite records. Download the payments CSV monthly for offline safety.
- **Sendcloud labels** — Sendcloud keeps records but exports are wise.
- **Invoices/credit notes** — they're generated on demand from the database. If you lose the database, you lose the ability to re-render historical invoices. **Mitigation**: the quarterly ZIP from `/admin/invoices` should be saved to long-term storage (Google Drive or an external accounting system) as a legal compliance measure.

### Recovery scenarios

**The website is down (Hostinger or Cloudflare outage):**
- First, check if it's Cloudflare or Hostinger via https://www.cloudflarestatus.com and https://www.hostinger-status.com
- If Cloudflare: temporarily set the DNS records to "DNS Only" (grey cloud) so traffic bypasses Cloudflare
- If Hostinger: log a ticket; usually resolved within an hour for free-tier plans

**The database is corrupted or lost:**
- Open a Supabase support ticket immediately requesting a point-in-time restore
- Note: the most recent 7 days are recoverable on the Pro tier — anything older is lost
- This is an emergency; involve the original developer if available

**An admin accidentally deletes data:**
- Most actions are logged in `/admin/audit-log` with the before-state
- Some entities (orders, customers) have a soft-delete (`deletedAt` column) — they can be restored by clearing that column directly in Supabase
- Other entities (invoices, credit notes) are hard-deleted with a 7-year retention warning — once deleted, gone

**Forgot the admin password:**
- Use Supabase Auth password reset (sends a magic link to the registered email)
- If the registered email is also lost, the original developer can reset the auth row directly in Supabase

---

## 13. Accounts & credentials inventory

Every service the website uses, the account name where applicable, and what type of credential it manages. **Do not store passwords in this document.** Use a password manager (1Password, Bitwarden) and share access via vault, not plain text.

| Service | Account name | Credentials we hold |
| --- | --- | --- |
| Hostinger | owner email | Password, 2FA on |
| Cloudflare | `yurskin.benelux@gmail.com` | Password, 2FA on |
| Supabase | owner email | Password, 2FA on; **`SUPABASE_SERVICE_ROLE_KEY` is in Hostinger env vars** |
| Mollie | K'Elmus Group BV | Password, 2FA on; **`MOLLIE_API_KEY` (live) is in Hostinger env vars** |
| Sendcloud | K'Elmus Group BV | Password, 2FA on; **`SENDCLOUD_PUBLIC_KEY` + `SENDCLOUD_SECRET_KEY` are in Hostinger env vars** |
| Resend | owner email | Password, 2FA on; **`RESEND_API_KEY` is in Hostinger env vars** |
| Groq | owner email | Password; **`GROQ_API_KEY` is in Hostinger env vars** |
| DeepL | owner email | Password; **`DEEPL_API_KEY` is in Hostinger env vars** |
| Google Workspace | owner email | Password, 2FA on |
| Google Search Console / Tag Manager / Analytics / Ads / Merchant | owner email | Password, 2FA on |
| cron-job.org | owner email | Password |
| GitHub | `yurskinbenelux-maker` | Password, 2FA on |
| Anthropic (unused currently) | owner email | Password |

Environment variables on the production Hostinger Node app:
- `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET`
- `SENDCLOUD_PUBLIC_KEY`, `SENDCLOUD_SECRET_KEY`
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `GROQ_API_KEY`, `DEEPL_API_KEY`
- `NEXT_PUBLIC_SITE_URL=https://asianbeautyshop.eu`
- `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GTM_GATEWAY_URL`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (stable hash for server actions; do not change without redeploy of all open tabs)

Whoever takes over needs admin access to each of the above. The current admin is the original owner.

---

## 14. Glossary

| Term | Meaning |
| --- | --- |
| **ABS** | Asian Beauty Shop — the storefront brand |
| **K'Elmus Group** | The Belgian limited company that legally operates ABS |
| **A-Beauty Club** | The customer loyalty/referral programme |
| **AVIF / WebP** | Modern image formats that load faster than JPEG. The site serves these automatically when the browser supports them. |
| **Cloudflare** | A "CDN" — a network of servers around the world that cache and serve our pages quickly + protect against attacks |
| **CRUD** | Create, Read, Update, Delete — the basic operations on data |
| **Credit note** | A Belgian legal document recording a refund. Required for accounting. |
| **GTM** | Google Tag Manager — a single tool that loads all our analytics tags |
| **GA4** | Google Analytics 4 — measures pageviews, conversions, etc. |
| **LCP** | Largest Contentful Paint — how fast the main image on a page appears. A core Google ranking signal. |
| **MCP** | The Hostinger Management Console — direct admin access to the Hostinger account |
| **PDP** | Product Detail Page — the page for one individual product |
| **PgBouncer** | A database connection pooler used by Supabase to handle many simultaneous connections efficiently |
| **Resend** | Our email delivery service |
| **Sendcloud** | Our shipping label + tracking service |
| **Supabase** | Hosted Postgres database + auth + file storage. Our single source of truth. |
| **Mollie** | Our payment processor |
| **Webhook** | An automated message one service sends to another. E.g., Mollie pings our site when a payment completes. |

---

*This document is the high-level handover. The detailed technical README, code comments, and inline documentation in the source code are the canonical reference for implementation details.*
