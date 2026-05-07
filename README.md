# YU.R Skin Solution — production webshop

A luxury Korean cosmetics webshop for **asianbeautyshop.eu**, built with Next.js 15, TypeScript, Prisma, Supabase, Mollie, and Anthropic Claude. Designed so the owner (an admin) can run every aspect of the shop — products, images, content, journal, translations, AI concierge — without touching code.

**Business:** K'Elmus Group · Boomsesteenweg 41/4b · 2630 Aartselaar · Belgium
**Hosting:** Hostinger Business plan (Managed Node.js + GitHub auto-deploy)
**Data:** Supabase (Postgres + Auth + Storage)
**Languages:** EN · NL · FR · RU
**Design direction:** ink & vermilion — rice-paper white, sumi black, Korean seal red, maehwa motif. See `design-preview-v2.html` for the full visual system and `admin-preview.html` for the admin UI.

---

## Phase 1 setup (once)

Follow this top to bottom. Takes ~30 minutes the first time.

### 1 · Prerequisites

- **Node.js 20 LTS** (`node -v` should print `v20.x.x`). Install from [nodejs.org](https://nodejs.org) if missing.
- **pnpm** (faster than npm, smaller install): `npm i -g pnpm`
- **git** and a **GitHub account**
- A **Supabase account** (free): https://supabase.com
- A **Mollie account** (free sandbox): https://www.mollie.com
- A **Resend account** (free tier): https://resend.com
- An **Anthropic API key**: https://console.anthropic.com

### 2 · Scaffold the Next.js project

In a terminal, `cd` into this folder, then:

```bash
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --eslint \
  --import-alias "@/*" \
  --use-pnpm \
  --no-turbopack

# When it asks about colors / overwrite, say yes to overwrite — keep README, prisma/, design previews.
```

### 3 · Install project dependencies

```bash
pnpm add \
  @prisma/client \
  next-intl \
  @anthropic-ai/sdk ai @ai-sdk/anthropic \
  @supabase/supabase-js @supabase/ssr \
  @mollie/api-client \
  resend \
  zod react-hook-form @hookform/resolvers \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder \
  framer-motion \
  lucide-react \
  clsx tailwind-merge class-variance-authority \
  date-fns \
  nanoid \
  sonner

pnpm add -D prisma tsx @types/node
```

Then set up shadcn/ui:

```bash
pnpm dlx shadcn@latest init -d
# When prompted: Neutral base, CSS variables yes, React Server Components yes.

pnpm dlx shadcn@latest add button input label textarea select sheet dialog dropdown-menu tabs badge card separator toast skeleton
```

### 4 · Supabase setup

1. Go to https://supabase.com, sign in with GitHub, click **New project**.
2. Name: `yurskin-prod`. Region: **Frankfurt (eu-central-1)** — closest to BE. Set a strong DB password and save it in a password manager.
3. Wait for provisioning (~2 min).
4. **Settings → Database → Connection pooler**: copy the Transaction connection string for `DATABASE_URL` and the Session string for `DIRECT_URL` in `.env.local`.
5. **Settings → API**: copy the `anon public` key and the `service_role` key.
6. **Storage → New bucket**: create a public bucket called `yur-media`. This is where product images and journal covers live.

### 5 · Environment variables

```bash
cp .env.example .env.local
# Open .env.local and fill in every value.
```

Double-check: `.env.local` is in `.gitignore` (create-next-app adds it by default). **Never commit it.**

### 6 · Initialise Prisma + run the first migration

```bash
pnpm prisma generate
pnpm prisma migrate dev --name init
```

This creates every table defined in `prisma/schema.prisma` in your Supabase database. Verify by opening Supabase → Table Editor — you should see Product, Order, User, etc.

### 7 · Run locally

```bash
pnpm dev
```

Open http://localhost:3000. You'll see the homepage with Hero B (Moon Jar) once Phase 1B ships (see below).

### 8 · Set up GitHub + Hostinger auto-deploy

1. Create a new **private** repo on GitHub: `yurskin-solution`.
2. From this folder:

   ```bash
   git init
   git add -A
   git commit -m "Phase 1: initial scaffold"
   git branch -M main
   git remote add origin git@github.com:<your-user>/yurskin-solution.git
   git push -u origin main
   ```

3. In Hostinger **hPanel → Websites → Add website → Node.js Web App**:
   - Source: GitHub (authorise Hostinger's GitHub app).
   - Repo: `yurskin-solution`. Branch: `main`. Auto-deploy: on.
   - Node version: **20.x**.
   - Build command: `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build`
   - Start command: `pnpm start -p $PORT`
   - Root: `/`
4. Open the Node.js app → **Environment variables** → paste every key from `.env.local` (production values where different: live Mollie key, production Supabase project, `NEXT_PUBLIC_SITE_URL=https://asianbeautyshop.eu`).
5. Point `asianbeautyshop.eu` at the Node.js app in hPanel → Domains.
6. First deploy will run automatically from the `main` push. Check logs in hPanel; any issues will show there.

---

## What's in the repo already (before Phase 1B)

```
/
├─ CLAUDE.md                  ← project brief
├─ README.md                  ← this file
├─ .env.example               ← env var template
├─ prisma/
│  └─ schema.prisma           ← full database schema (Phase 1 delivered)
├─ design-preview.html        ← earlier peony concept (archived, keep for reference)
├─ design-preview-v2.html     ← locked ink & vermilion visual system
└─ admin-preview.html         ← admin panel UI mock
```

## What's coming in Phase 1B (next)

- Next.js project scaffold (after you run the commands above)
- `src/app/` route groups: `(public)`, `(admin)`, `(api)`
- Design tokens in `tailwind.config.ts` (rice paper, sumi ink, vermilion, aged gold, celadon)
- `src/styles/globals.css` with Fraunces + Noto Serif KR + Inter + hanji paper grain
- `src/components/layout/nav.tsx` — sticky glass nav with locale switcher
- `src/components/layout/footer.tsx` — full footer with K'Elmus Group legal
- `src/app/(public)/[locale]/page.tsx` — Homepage with Hero B (Moon Jar), bestsellers, ritual, testimonials, journal teaser, newsletter
- Seed script with 4 real YU.R products in 4 languages
- `src/components/concierge/` — floating red-seal orb + chat drawer (UI shell, AI wired up in Phase 3)

## Phase roadmap at a glance

| Phase | What ships                                  | Ready when                         |
| ----- | ------------------------------------------- | ---------------------------------- |
| **1** | Foundations, design system, homepage        | an admin sees the styled homepage live |
| **2** | Shop, filters, PDP, cart, checkout (Mollie) | She can take a real €0.01 order    |
| **3** | AI concierge (streaming + tool calling)     | The orb talks and recommends       |
| **4** | Admin panel (CRUD, Tiptap, translations)    | an admin adds a product herself       |
| **5** | Launch hardening (GDPR, Sendcloud, SEO)     | DNS flipped, live                  |

## Running costs (at steady state)

Hostinger Business — already paid. Supabase free tier. Mollie 1.8% + €0.25 per transaction. Resend free tier (3000/mo). Anthropic API ~€5-15/mo depending on chat volume. Sendcloud ~€30/mo once shipping is live. Plausible ~€9/mo. Total ~€50-70/mo + transaction fees.

## License

Private. © 2026 K'Elmus Group.
