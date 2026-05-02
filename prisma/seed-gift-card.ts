// ─────────────────────────────────────────────────────────────────────────
// prisma/seed-gift-card.ts — creates / updates the gift-card product.
//
// Idempotent: upserts the product by SKU and the variants by SKU. Re-running
// is safe — Sofia's later edits to the descriptions, slugs, or media are
// preserved (we only `create:` translations the first time and skip on
// subsequent runs via upsert).
//
// Run with:  npx tsx prisma/seed-gift-card.ts
//
// What this creates:
//   · One Product row with `kind = GIFT_CARD`, slug `gift-card` per locale
//   · Five ProductVariant rows: 25 / 50 / 100 / 200 / 500 EUR
//   · ProductTranslation in EN/NL/FR/RU
// ─────────────────────────────────────────────────────────────────────────

import {
  PrismaClient,
  Locale,
  ProductStatus,
  ProductKind,
  Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

// Denominations the customer can buy. Update this list to add/remove tiers
// — variants are upserted by SKU so renames stay durable.
const DENOMINATIONS = [25, 50, 100, 200, 500];

const COPY: Record<
  Locale,
  {
    name: string;
    slug: string;
    short: string;
    description: string;
    seoTitle: string;
    seoDescription: string;
  }
> = {
  EN: {
    name: "YU•R Gift Card",
    slug: "gift-card",
    short:
      "A digital gift card delivered by email — for the friend who's earned a slow ritual.",
    description: `<p>The YU•R gift card is the most thoughtful way to share Korean skincare with someone who already takes ritual seriously — or who deserves to start.</p>
<p>Choose any denomination from €25 to €500. We send the unique code by email — to you, or directly to your friend on the date you pick. They redeem at checkout. No expiry surprises: codes are good for a full year.</p>
<ul>
  <li>Five tiers — €25, €50, €100, €200, €500</li>
  <li>Delivered instantly by email</li>
  <li>Redeem in one or many orders — balance carries over</li>
  <li>Stack multiple cards on one purchase</li>
  <li>Valid 12 months from issue</li>
</ul>`,
    seoTitle: "Gift Card — YU•R Skin Solution",
    seoDescription:
      "Give the gift of a slow Korean ritual. YU•R gift cards from €25 to €500, delivered instantly by email. Redeemable on any product, valid 12 months.",
  },
  NL: {
    name: "YU•R Cadeaubon",
    slug: "cadeaubon",
    short:
      "Een digitale cadeaubon per e-mail — voor wie een langzaam ritueel verdient.",
    description: `<p>De YU•R cadeaubon is de meest doordachte manier om Koreaanse huidverzorging te delen met iemand die rituelen al serieus neemt — of dat zou moeten gaan doen.</p>
<p>Kies elk bedrag van €25 tot €500. Wij sturen de unieke code per e-mail — naar jou of rechtstreeks naar je vriend(in) op een datum die jij kiest. Inwisselen aan de kassa. Geen vervaldatum-verrassingen: codes zijn een vol jaar geldig.</p>
<ul>
  <li>Vijf bedragen — €25, €50, €100, €200, €500</li>
  <li>Direct geleverd per e-mail</li>
  <li>In één of meerdere bestellingen inwisselbaar — saldo blijft staan</li>
  <li>Combineer meerdere kaarten op één bestelling</li>
  <li>12 maanden geldig vanaf uitgifte</li>
</ul>`,
    seoTitle: "Cadeaubon — YU•R Skin Solution",
    seoDescription:
      "Geef het cadeau van een langzaam Koreaans ritueel. YU•R cadeaubonnen van €25 tot €500, direct per e-mail geleverd. 12 maanden geldig.",
  },
  FR: {
    name: "Carte cadeau YU•R",
    slug: "carte-cadeau",
    short:
      "Une carte cadeau numérique par e-mail — pour qui mérite un rituel lent.",
    description: `<p>La carte cadeau YU•R est la façon la plus délicate de partager le soin coréen avec une personne qui prend déjà ses rituels au sérieux — ou qui devrait commencer.</p>
<p>Choisissez le montant, de 25 € à 500 €. Nous envoyons le code unique par e-mail — à vous, ou directement à votre ami(e) à la date choisie. À échanger en caisse. Pas de mauvaise surprise : les codes sont valables un an.</p>
<ul>
  <li>Cinq paliers — 25 €, 50 €, 100 €, 200 €, 500 €</li>
  <li>Livraison instantanée par e-mail</li>
  <li>À utiliser en une ou plusieurs commandes — le solde reste</li>
  <li>Cumul de plusieurs cartes sur une même commande</li>
  <li>Valable 12 mois à partir de l'émission</li>
</ul>`,
    seoTitle: "Carte cadeau — YU•R Skin Solution",
    seoDescription:
      "Offrez un rituel coréen lent. Cartes cadeaux YU•R de 25 € à 500 €, livrées par e-mail. Valables 12 mois.",
  },
  RU: {
    name: "Подарочная карта YU•R",
    slug: "podarochnaya-karta",
    short:
      "Цифровой подарочный сертификат по электронной почте — для тех, кто заслуживает медленного ритуала.",
    description: `<p>Подарочная карта YU•R — самый продуманный способ поделиться корейским уходом с тем, кто уже относится к ритуалам серьёзно, или с тем, кому пора начать.</p>
<p>Выбирайте номинал от €25 до €500. Мы отправим уникальный код по электронной почте — вам или напрямую вашему другу в выбранную дату. Применяется при оформлении заказа. Без сюрпризов: код действует целый год.</p>
<ul>
  <li>Пять номиналов — €25, €50, €100, €200, €500</li>
  <li>Мгновенная доставка по электронной почте</li>
  <li>Можно применять в нескольких заказах — баланс сохраняется</li>
  <li>Можно объединять несколько карт в одном заказе</li>
  <li>Срок действия — 12 месяцев с момента выпуска</li>
</ul>`,
    seoTitle: "Подарочная карта — YU•R Skin Solution",
    seoDescription:
      "Подарите медленный корейский ритуал. Подарочные карты YU•R от €25 до €500, мгновенно по электронной почте. Срок 12 месяцев.",
  },
};

async function main() {
  console.log("🎁  Seeding YU•R Gift Card product…");

  // ── Product (status PUBLISHED so it appears on the shop right away) ──
  // The base price equals the smallest denomination (€25); per-variant
  // prices override this so the PDP "from €25" badge stays accurate even
  // if the smallest tier is removed later.
  const product = await prisma.product.upsert({
    where: { sku: "GIFT-CARD" },
    update: {
      kind: ProductKind.GIFT_CARD,
      status: ProductStatus.PUBLISHED,
      isAvailableForAi: false,
    },
    create: {
      sku: "GIFT-CARD",
      kind: ProductKind.GIFT_CARD,
      status: ProductStatus.PUBLISHED,
      isAvailableForAi: false,
      isFeatured: false,
      hideFromSearch: false,
      price: new Prisma.Decimal(25),
      // No physical attributes — gift cards aren't shipped.
      weightGrams: 0,
    },
    select: { id: true },
  });

  // Translations — `connectOrCreate` so re-runs don't duplicate.
  for (const [locale, copy] of Object.entries(COPY) as [
    Locale,
    (typeof COPY)[Locale],
  ][]) {
    await prisma.productTranslation.upsert({
      where: { productId_locale: { productId: product.id, locale } },
      update: {
        // Refresh SEO on re-run; leave name/description alone so admin edits
        // don't get clobbered.
        seoTitle: copy.seoTitle,
        seoDescription: copy.seoDescription,
      },
      create: {
        productId: product.id,
        locale,
        name: copy.name,
        slug: copy.slug,
        shortDescription: copy.short,
        description: copy.description,
        seoTitle: copy.seoTitle,
        seoDescription: copy.seoDescription,
      },
    });
  }

  // ── Variants (one per denomination) ────────────────────────────────────
  for (const [i, eur] of DENOMINATIONS.entries()) {
    const sku = `GIFT-CARD-${eur}`;
    await prisma.productVariant.upsert({
      where: { sku },
      update: {
        price: new Prisma.Decimal(eur),
        // Stock kept at a synthetic high number — gift cards are infinite.
        // We don't want low-stock alerts firing.
        stock: 9_999,
        sortOrder: i,
      },
      create: {
        sku,
        productId: product.id,
        label: `€${eur}`,
        price: new Prisma.Decimal(eur),
        stock: 9_999,
        isDefault: i === 1, // €50 is the gentle default
        sortOrder: i,
      },
    });
  }

  console.log(
    `✅  Gift card product ready (${DENOMINATIONS.length} variants seeded)`,
  );
}

main()
  .catch((err) => {
    console.error("Gift-card seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
