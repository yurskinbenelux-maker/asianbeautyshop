# Asian Beauty Shop · Google Ads Roadmap

**Goal:** maximum paid orders per euro spent on a small early-stage budget. Ramp deliberately as data accumulates rather than launching broad and burning cash.

---

## 1. The economic framework

Three numbers determine whether ads are profitable. Get these right before spending anything.

### 1.1 Average Order Value (AOV)

Estimated for YurSkin based on the catalogue (typical K-beauty skincare in Europe):

| Cart shape                                          | Items | Subtotal |
|----------------------------------------------------|------|---------|
| Single-item curiosity buy (cleanser only)         | 1    | €25–35  |
| Two-item routine (cleanser + serum)               | 2    | €55–75  |
| **Most likely AOV for new customers**             | 1.6  | **€55** |
| Quiz-completed ritual (3-step routine)            | 3    | €90–130 |
| Full discovery cart (+ free shipping over €50)   | 3+   | €100+   |

**Working assumption: AOV = €55** for first orders. Repeat customers trend higher (~€70).

### 1.2 Gross margin

K-beauty wholesale typically lands at 45–60% gross margin (price minus cost of goods). For YurSkin:
- **Conservative estimate: 50%** (after Mollie fees + Sendcloud shipping cost contribution)
- On a €55 order → **€27.50 gross profit** before any ad spend.

### 1.3 Maximum sustainable CPA (Cost per Acquisition)

This is the most important number. CPA = total ad spend ÷ orders attributed to ads.

|                          | New customer                | Customer with repeat purchase |
|-------------------------|-----------------------------|-------------------------------|
| Gross profit per order  | €27.50                      | €27.50                        |
| Lifetime orders (typical skincare repeat rate ~30% within 6mo) | 1.0 | ~1.4 |
| Lifetime gross profit   | €27.50                      | €38.50                        |
| **Breakeven CPA**       | **€27**                     | **€38**                       |
| **Healthy target CPA**  | **€15–18**                  | **€20–25**                    |

> **Anything above €27 CPA loses money on the first order**, recovered only if the customer comes back. That's the absolute ceiling. Set Smart Bidding's **target CPA = €18** for the first 90 days; raise once LTV data is real.

### 1.4 Target ROAS (Return on Ad Spend)

ROAS = revenue / spend. Easier to talk to an admin about.

- ROAS = AOV / CPA = €55 / €18 = **3.0x minimum target**
- 4x+ ROAS = healthy
- 2x or below = either you're paying too much per click OR converting too poorly

---

## 2. Budget scenarios

Each tier assumes target CPA of €18 and AOV of €55 (3x ROAS).

### Scenario A — Defensive (€100/month)

| Spend            | €100  |
|-----------------|-------|
| Orders (CPA €18) | ~5    |
| Revenue          | €275  |
| Gross profit     | €37   |
| **Margin minus ad spend** | **−€63** |
| Net of LTV uplift | ~€0 (breakeven) |

**Use case:** brand-defense only. Bid only on `yurskin`, `yu r skin`, `yur skin solution`. Costs €0.10–0.30 per click and converts at 15–25% because the searcher is looking for YOU specifically. Stops competitors from running ads against your brand name. Doesn't grow you.

**Output:** 5 orders/month, ROAS ~5–8x on these terms specifically.

### Scenario B — Test the waters (€300/month)

| Spend            | €300  |
|-----------------|-------|
| Orders           | ~16   |
| Revenue          | €880  |
| Gross profit     | €440  |
| **Net after ads**| **+€140** |

**Use case:** real entry point. Layer on top of Scenario A:
- Brand defense (€60/mo)
- **Shopping ads** via Google Merchant Center (€180/mo) — single biggest lever for small e-commerce.
- **Remarketing** to site visitors who didn't buy (€60/mo) — cheapest acquisitions you'll ever get.

**Output:** real signal in GA4 after ~30 days. Smart Bidding starts learning. an admin sees actual conversion data she can show partners.

### Scenario C — Smart growth (€800/month)

| Spend            | €800  |
|-----------------|-------|
| Orders           | ~44   |
| Revenue          | €2,420 |
| Gross profit     | €1,210 |
| **Net after ads**| **+€410** |

**Use case:** profitable, repeatable. Add to B:
- **Performance Max** with full product feed (€400/mo)
- Long-tail commercial search (€200/mo): "vitamin c serum korean", "hyaluronic acid cream sensitive skin"
- Increase remarketing window to 30 days post-visit

**Output:** real ROAS data per channel. Can confidently tell which keyword themes work.

### Scenario D — Scale (€1500/month)

| Spend            | €1,500  |
|-----------------|---------|
| Orders           | ~83     |
| Revenue          | €4,565  |
| Gross profit     | €2,283  |
| **Net after ads**| **+€783** |

**Use case:** only after C has been profitable for 60 days. Add YouTube remarketing video, Demand Gen, broader commercial keywords. Hire someone to manage if an admin can't put 5h/week into it.

---

## 3. The phased roadmap (what to actually do, in order)

### Phase 0 — Foundation (week 0, no spend yet)

- ✅ GA4 + GTM + Google Ads conversion tag wired (this is what we just did).
- ⏭ **GTM container config**: GA4 Configuration tag, GA4 purchase event tag, Google Ads conversion tag, Remarketing tag. Submit + Publish.
- ⏭ **Google Merchant Center**: create account, link domain, upload product feed. Free, but Shopping ads in Phase 2 need this. The feed pulls from your Next.js sitemap + product structured data — already in place.
- ⏭ **Test purchases** with GTM Preview Mode. Confirm conversion fires before spending a euro.

### Phase 1 — Brand defense (€100/mo, weeks 1–4)

Run only one Search campaign, only one ad group, only these keyword variants on **exact match**:
```
[yurskin]
[yur skin]
[yurskin solution]
[yurskinsolution]
[yu.r skin]
```
Add negative keywords: `-recipe -tutorial -wholesale -recruitment -review`

Bidding strategy: **Maximize Clicks**, manual CPC cap €0.40. (Can't use Smart Bidding yet — no conversion data.)

Track: 4 weeks of conversion volume from these terms. If you're getting ~20+ branded conversions, switch to Maximize Conversions strategy and let Smart Bidding take over.

### Phase 2 — Shopping (€300/mo total, weeks 5–12)

Add a **Performance Max with feed** campaign — Google's modern Shopping replacement. €180/mo budget, target ROAS 3.0x.

Add a **Remarketing** campaign on Display: €60/mo, audience = "all site visitors past 30 days, excluding past purchasers". Creative: 6 product images + a "Welcome back, 10% off your first order" copy line (you already have this offer wired in the welcome popup).

Keep brand defense running underneath at €60/mo.

After 30 days you'll have ~16 conversions in Smart Bidding's training set. Switch from "Maximize Conversions" to "**Target CPA €20**" once you have ≥30 conversions.

### Phase 3 — Long-tail commercial search (€800/mo, weeks 13–24)

Add a Search campaign targeting commercial-intent long-tail. Keywords like:

| Theme                   | Sample keywords                                          |
|------------------------|----------------------------------------------------------|
| Ingredient + product   | "centella serum buy", "niacinamide cream europe"         |
| Concern + product      | "cream for hormonal acne", "spf for sensitive skin"      |
| Korean + category      | "korean toner online", "k-beauty cleanser benelux"       |
| Routine                | "korean skincare routine starter kit", "build skincare ritual" |

**Avoid pure informational keywords** like "skincare routine steps" or "how to layer skincare" — they convert 5–10x worse.

Bid type: **Target CPA €22** (raised because Phase 2 data shows it's safe).
Match types: **phrase** match, NOT broad. Broad burns budget on irrelevant junk for low-budget accounts.
Negative keywords: `-jobs -recipe -diy -recipe -free -cheap -tutorial -recruitment -wholesale`

### Phase 4 — Scale & retention (€1500+/mo, month 7+)

- YouTube remarketing video ads (low cost, high recall).
- Demand Gen campaigns (Google's TikTok-like scrollable ads on YouTube + Discover + Gmail).
- Lookalike audiences off your purchaser email list (via Customer Match).
- Increase Target CPA to €28 since you now have LTV data showing repeat purchase rate.

---

## 4. What NOT to spend on (low-budget edition)

| Don't                                          | Why                                                       |
|-----------------------------------------------|-----------------------------------------------------------|
| Broad keywords like "skincare", "moisturizer" | €3–5 CPC, 0.5% conversion. Burns €100 in a day.          |
| Display Network (non-remarketing)             | Reaches everyone everywhere. Dirt cheap clicks but ~0.1% conversion. |
| Generic Performance Max without a feed        | Without Shopping/feed, Pmax is a black box that wastes ~40% of spend. |
| YouTube ads before remarketing data exists    | Cold YouTube audiences are 6–10x more expensive than search converts. |
| Auto-applied recommendations                  | Google silently raises budgets and adds keywords. Turn off in Settings. |
| Targeting "all of Europe"                     | Start with Benelux + France (your shipping sweet spot). Add countries when CPA proves stable. |
| Google's "Maximize Conversion Value" before 30 conversions | Bidding strategy needs training data. Start manual or Maximize Clicks. |

---

## 5. Concrete first-month playbook

If an admin has **€300 to test**, here's the exact split:

| Campaign                  | Type           | Budget/day | Target           | Expected orders |
|--------------------------|----------------|----------|------------------|-----------------|
| Brand Defense            | Search exact   | €2       | Manual CPC €0.40 | 4–6             |
| Shopping (Pmax w/ feed)  | Performance Max| €6       | Max conversions  | 8–12            |
| Remarketing              | Display        | €2       | Manual CPM       | 2–4             |
| **Total**                |                | **€10/day = €300/mo** | | **~16 orders**  |

**Geography:** Belgium, Netherlands, France, Luxembourg only.

**Languages:** match your locales (NL / FR / EN). Skip RU until you have enough RU traffic to warrant it — small audience for now.

**Schedule:** all hours, all days. Skincare is bought on commute, in bed, weekends. Smart Bidding figures out the time-of-day patterns automatically.

**Ad copy for Search ads (brand defense):**
- Headline 1: "YU.R Skin · Korean Skincare Rituals"
- Headline 2: "Free Shipping over €50"
- Headline 3: "Take Our Skin Quiz · 15% Off"
- Description 1: "Korean skincare for every skin type. Discover your ritual with a 2-minute quiz."
- Description 2: "Authentic K-beauty, shipped from the Benelux. Sustainable packaging. Cruelty-free."

---

## 6. Reading the results (how to know it's working)

Check these in **GA4 → Reports → Acquisition** weekly:

| Metric                    | Healthy 30 days in | Yellow flag        | Red flag           |
|--------------------------|--------------------|--------------------|--------------------|
| Conversion rate (paid)   | ≥1.5%              | 1.0–1.5%           | <1.0%              |
| Cost per click avg       | €0.40–€1.20        | €1.20–€2.00        | >€2.00             |
| ROAS overall             | ≥3.0x              | 2.0–3.0x           | <2.0x              |
| Cart abandonment rate    | 60–70%             | 70–80%             | >80%               |
| Brand campaign CTR       | ≥10%               | 5–10%              | <5%                |
| Shopping CTR             | ≥1%                | 0.5–1%             | <0.5%              |

If you're in red after 30 days, stop spending and audit landing pages, mobile UX, and price competitiveness — it's not an ads problem, it's a conversion-rate problem.

---

## 7. The one-line summary

**Spend €300/month on Brand + Shopping + Remarketing for 90 days. Target CPA €18, target ROAS 3x. Don't touch broad keywords or display until conversion data proves the funnel. Reinvest profit into scale, not test campaigns an admin hasn't validated.**
