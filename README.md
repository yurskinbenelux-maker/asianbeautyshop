# Asian Beauty Shop

Production webshop for **asianbeautyshop.eu** — the trading storefront of **K'Elmus Group BV** (Belgium). Multi-brand Korean beauty, four locales (EN · NL · FR · RU), Belgian VAT-compliant.

> For the full operational handover (services, money flow, admin workflows, costs, maintenance schedule), see **[`docs/HANDOVER.md`](./docs/HANDOVER.md)**.

---

## How it's built

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19, Server Actions, View Transitions) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + a few shadcn/ui primitives |
| i18n | next-intl, locale prefix always (EN · NL · FR · RU) |
| Database | Prisma → Supabase Postgres (Frankfurt) |
| Auth | Supabase Auth (magic link + Google OAuth) |
| File storage | Supabase Storage (`yur-media` bucket) |
| Payments | Mollie |
| Shipping | Sendcloud |
| Email | Resend (18+ branded templates) |
| AI concierge | Groq (Llama 4 Scout) + Vercel AI SDK |
| Translation | DeepL (admin-side fan-out to NL/FR/RU) |
| Hosting | Hostinger Business (Managed Node.js, GitHub auto-deploy) |
| CDN / DNS | Cloudflare (free tier; HTML cache rule + Tag Gateway) |
| Analytics | GA4 via GTM with Consent Mode v2 |
| Scheduled tasks | cron-job.org → webhook endpoints in `/api/cron/*` |

Single Next.js app deployed to Hostinger, sitting behind Cloudflare. All data lives in Supabase. The owner runs everything from `/admin` — no code changes required for normal operations.

---

## Repo layout

```
prisma/            Database schema + migrations (every model commented)
messages/          i18n catalogues (en, nl, fr, ru JSON)
public/            Static assets — brand icons, fonts, OG image
docs/              Operational handover docs
scripts/           Maintenance scripts (Prisma seeds, one-off jobs)
src/
├─ app/
│  ├─ [locale]/    Public site (homepage, shop, PDP, cart, checkout, account, journal…)
│  ├─ admin/       Admin panel (NOT locale-prefixed)
│  ├─ api/         Webhooks (Mollie, Sendcloud, Resend), feeds, cron
│  └─ auth/        Supabase OAuth callback
├─ components/     UI building blocks (storefront, admin, concierge, popups, cart)
├─ lib/            Server-side logic — queries, integrations, business rules
└─ middleware.ts   Supabase session refresh + next-intl routing
```

---

## Local development

You only need this if you're touching code. Day-to-day store operation happens entirely in `/admin`.

```bash
git clone git@github.com:yurskinbenelux-maker/asianbeautyshop.git
cd "YurSkin Solutions website"
pnpm install
cp .env.example .env       # then fill with the real values (ask the owner)
pnpm prisma generate
pnpm dev                   # http://localhost:3000
```

`.env` points at **production Supabase** — there is no separate dev database. Any data you change locally is live data. Read once, write deliberately.

Useful commands:

```bash
pnpm typecheck                 # tsc --noEmit, run before pushing
pnpm prisma studio             # browse the prod DB read-only in your head
pnpm prisma migrate deploy     # apply pending migrations to prod
```

---

## Deployment

The `main` branch on GitHub is wired to Hostinger via auto-deploy. Every push to `main`:

1. Hostinger pulls the latest commit
2. Runs `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build`
3. Restarts the Node process

Typical build time: 3–4 minutes. Watch logs in **hPanel → Websites → asianbeautyshop.eu → Deployments**.

### Database migrations

When a commit adds files under `prisma/migrations/*`, the migration must be applied to the production DB manually — Hostinger's build does **not** run `prisma migrate deploy` automatically. From your terminal:

```bash
pnpm prisma migrate deploy
```

(The command reads `DATABASE_URL` from `.env`.) If you forget, the deploy ships but routes that read the new columns will 500 until the migration is applied. Running it again later is a no-op.

---

## What's not in this repo (and why)

The shop relies on the following external configurations that don't live in source code:

- **Environment variables** — set on Hostinger (`hPanel → Node.js app → Environment variables`). See `.env.example` for the canonical list.
- **Supabase auth email templates** — edited in Supabase Studio, multi-locale via Go template conditionals.
- **Sendcloud shipping rules** — configured in the Sendcloud dashboard, picks the cheapest stamped/tracked option per destination zone.
- **Mollie statement descriptor + webhook URLs** — in the Mollie dashboard. Webhooks must point at `asianbeautyshop.eu/api/webhooks/mollie`.
- **Cloudflare Cache Rules + Tag Gateway** — in the Cloudflare dashboard. The homepage HTML is cached for 60s for anonymous traffic; `/_next/image*` is cached at the edge for 1 year.
- **Cron schedules** — defined at cron-job.org, each hitting a specific `/api/cron/...` endpoint.

`docs/HANDOVER.md` has the full inventory.

---

## Conventions

- **Comments matter.** Most non-obvious code carries a "why" comment explaining the design choice. When you change behaviour, update the comment.
- **No emoji in code** unless explicitly requested.
- **Server actions** live next to their routes (`actions.ts` files inside route segments). Each does its own auth check via `requireCapability(...)`.
- **Database access** is centralised in `src/lib/queries/` — one file per domain. Components never call Prisma directly.
- **Type-check before pushing.** `pnpm typecheck` catches the issues Hostinger's strict build would catch 4 minutes later.

---

## License

Private. © K'Elmus Group BV. All rights reserved.
