// ─────────────────────────────────────────────────────────────────────────
// prisma/seed-legal.ts — seeds legal / informational Page rows.
//
// Creates five Page entries keyed by a short identifier:
//   · privacy   — GDPR-compliant privacy policy (placeholder; an admin to refine with counsel)
//   · terms     — terms & conditions of sale
//   · cookies   — cookie policy that mirrors the banner categories
//   · returns   — right of withdrawal / refund policy (mandatory in EU)
//   · imprint   — legal imprint (mandatory in BE/EU: company, VAT, address)
//
// Run with:  npx tsx prisma/seed-legal.ts
//
// Idempotent: upserts by unique Page.key and PageTranslation [pageId,locale],
// so an admin can re-run safely. Re-runs DON'T overwrite edits — we only create
// translations that are missing. To reset to placeholder copy, first delete
// the PageTranslation rows in the admin, then re-run this seed.
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, Locale } from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────
// Page copy. All bodies are rich HTML — wrapped in paragraphs / headings so
// the PageBody renderer can style them with the `prose-editorial` utility.
// The copy is intentionally generic + jurisdiction-neutral so an admin (or her
// lawyer) can tune it via the admin without touching this file.
// ─────────────────────────────────────────────────────────────────────────

type PageCopy = {
  key: string;
  translations: Partial<
    Record<
      Locale,
      { title: string; body: string; seoTitle?: string; seoDescription?: string }
    >
  >;
};

const PAGES: PageCopy[] = [
  // ── Privacy ─────────────────────────────────────────────────────────────
  {
    key: "privacy",
    translations: {
      [Locale.EN]: {
        title: "Privacy policy",
        seoTitle: "Privacy policy — Asian Beauty Shop",
        seoDescription:
          "How Asian Beauty Shop collects, uses, and protects your personal data under the GDPR.",
        body: `
<p><em>Last updated: 21 April 2026.</em></p>

<p>Asian Beauty Shop is operated by <strong>K'Elmus Group BV</strong>, Boomsesteenweg 41/4b, 2630 Aartselaar, Belgium ("we", "us"). We are the data controller for the personal data processed through this website.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account data</strong> — your email, name, and preferred language when you create an account or place an order.</li>
  <li><strong>Order data</strong> — shipping and billing address, the items you ordered, and the payment status. Payment card details are handled by our payment processor and never stored on our servers.</li>
  <li><strong>Technical data</strong> — IP address, browser type, and device information collected via cookies and server logs for security and fraud prevention.</li>
  <li><strong>Support data</strong> — the content of your messages to our AI skin concierge and customer service, kept only as long as needed to answer you.</li>
</ul>

<h2>How we use it</h2>
<p>We process your data to fulfil your orders, provide customer support, send you transactional emails about your orders, and, with your explicit consent, to send marketing communications. We also use aggregated, non-identifying analytics to improve the website.</p>

<h2>Legal basis</h2>
<p>Our lawful bases under the GDPR are (i) performance of a contract (when you place an order), (ii) legitimate interests (fraud prevention, securing the site), (iii) your consent (marketing, non-essential cookies), and (iv) legal obligations (accounting, tax).</p>

<h2>Sharing</h2>
<p>We share data only with processors we have contracts with: Supabase (hosting &amp; database, EU), Mollie (payments, EU), Sendcloud (shipping, EU), and our email provider. We do not sell your data.</p>

<h2>Your rights</h2>
<p>You can access, correct, export, or delete your personal data at any time. Email us at <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> and we will respond within 30 days. You also have the right to lodge a complaint with the Belgian Data Protection Authority (gegevensbeschermingsautoriteit.be).</p>

<h2>Retention</h2>
<p>Order records are kept for seven years (legal requirement for Belgian accounting). Account data is kept until you ask us to close your account. Marketing consent is kept until you unsubscribe.</p>
`,
      },
      [Locale.NL]: {
        title: "Privacybeleid",
        seoTitle: "Privacybeleid — Asian Beauty Shop",
        seoDescription:
          "Hoe Asian Beauty Shop jouw persoonsgegevens verzamelt, gebruikt en beschermt onder de AVG.",
        body: `
<p><em>Laatst bijgewerkt: 21 april 2026.</em></p>

<p>Asian Beauty Shop wordt uitgebaat door <strong>K'Elmus Group BV</strong>, Boomsesteenweg 41/4b, 2630 Aartselaar, België ("wij", "ons"). Wij zijn de verwerkingsverantwoordelijke voor de persoonsgegevens die via deze website worden verwerkt.</p>

<h2>Wat we verzamelen</h2>
<ul>
  <li><strong>Accountgegevens</strong> — je e-mailadres, naam en voorkeurstaal wanneer je een account aanmaakt of een bestelling plaatst.</li>
  <li><strong>Bestelgegevens</strong> — verzend- en factuuradres, de producten die je hebt besteld en de betaalstatus. Kaartgegevens worden behandeld door onze betaalprovider en nooit op onze servers bewaard.</li>
  <li><strong>Technische gegevens</strong> — IP-adres, browsertype en apparaatinformatie via cookies en serverlogs voor veiligheid en fraudepreventie.</li>
  <li><strong>Supportgegevens</strong> — de inhoud van je gesprekken met onze AI-huidconcierge en klantenservice, enkel bewaard zolang nodig om je te antwoorden.</li>
</ul>

<h2>Waarom we het gebruiken</h2>
<p>Wij verwerken je gegevens om je bestellingen te verwerken, klantenservice te bieden, transactionele e-mails te sturen en, met je uitdrukkelijke toestemming, marketingcommunicatie te versturen. Geaggregeerde, niet-identificeerbare analytics helpen ons de site te verbeteren.</p>

<h2>Rechtsgrond</h2>
<p>Onze rechtsgronden onder de AVG zijn (i) uitvoering van een overeenkomst (bij een bestelling), (ii) gerechtvaardigde belangen (fraudepreventie, beveiliging), (iii) jouw toestemming (marketing, niet-essentiële cookies), en (iv) wettelijke verplichtingen (boekhouding, fiscaliteit).</p>

<h2>Delen</h2>
<p>We delen gegevens enkel met verwerkers waarmee we een contract hebben: Supabase (hosting &amp; database, EU), Mollie (betalingen, EU), Sendcloud (verzending, EU) en onze e-mailprovider. Wij verkopen je gegevens niet.</p>

<h2>Jouw rechten</h2>
<p>Je kan je persoonsgegevens op elk moment inkijken, corrigeren, exporteren of laten verwijderen. Mail ons op <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> en we antwoorden binnen 30 dagen. Je hebt ook het recht om een klacht in te dienen bij de Gegevensbeschermingsautoriteit (gegevensbeschermingsautoriteit.be).</p>

<h2>Bewaartermijn</h2>
<p>Bestelgegevens worden zeven jaar bewaard (wettelijke verplichting voor Belgische boekhouding). Accountgegevens blijven bewaard tot je vraagt je account te sluiten. Marketingtoestemming blijft geldig tot je je uitschrijft.</p>
`,
      },
      [Locale.FR]: {
        title: "Politique de confidentialité",
        seoTitle: "Politique de confidentialité — Asian Beauty Shop",
        seoDescription:
          "Comment Asian Beauty Shop collecte, utilise et protège vos données personnelles dans le cadre du RGPD.",
        body: `
<p><em>Dernière mise à jour : 21 avril 2026.</em></p>

<p>Asian Beauty Shop est exploité par <strong>K'Elmus Group BV</strong>, Boomsesteenweg 41/4b, 2630 Aartselaar, Belgique (« nous »). Nous sommes le responsable du traitement des données personnelles collectées via ce site.</p>

<h2>Ce que nous collectons</h2>
<ul>
  <li><strong>Données de compte</strong> — votre e-mail, votre nom et votre langue préférée lorsque vous créez un compte ou passez commande.</li>
  <li><strong>Données de commande</strong> — adresse de livraison et de facturation, articles commandés et statut du paiement. Les données de carte bancaire sont traitées par notre prestataire de paiement et ne sont jamais stockées chez nous.</li>
  <li><strong>Données techniques</strong> — adresse IP, type de navigateur, informations d'appareil collectées via les cookies et les journaux serveur, pour la sécurité et la prévention de la fraude.</li>
  <li><strong>Données de support</strong> — le contenu de vos échanges avec notre concierge IA et le service client, conservé uniquement le temps nécessaire.</li>
</ul>

<h2>Comment nous les utilisons</h2>
<p>Nous traitons vos données pour honorer vos commandes, vous assister, vous envoyer des e-mails transactionnels et, avec votre consentement explicite, vous adresser des communications marketing. Des statistiques agrégées et anonymes nous permettent d'améliorer le site.</p>

<h2>Base légale</h2>
<p>Nos bases légales au titre du RGPD sont (i) l'exécution d'un contrat (lors d'une commande), (ii) l'intérêt légitime (prévention de la fraude, sécurité), (iii) votre consentement (marketing, cookies non essentiels) et (iv) les obligations légales (comptabilité, fiscalité).</p>

<h2>Partage</h2>
<p>Nous ne partageons vos données qu'avec des sous-traitants contractualisés : Supabase (hébergement &amp; base de données, UE), Mollie (paiements, UE), Sendcloud (expédition, UE) et notre fournisseur d'e-mail. Nous ne vendons pas vos données.</p>

<h2>Vos droits</h2>
<p>Vous pouvez à tout moment accéder, corriger, exporter ou supprimer vos données. Écrivez-nous à <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>, nous répondrons sous 30 jours. Vous pouvez également introduire une plainte auprès de l'Autorité de protection des données belge (autoriteprotectiondonnees.be).</p>

<h2>Durée de conservation</h2>
<p>Les commandes sont conservées sept ans (obligation comptable belge). Les données de compte sont conservées jusqu'à fermeture du compte. Le consentement marketing reste valable jusqu'à votre désinscription.</p>
`,
      },
      [Locale.RU]: {
        title: "Политика конфиденциальности",
        seoTitle: "Политика конфиденциальности — Asian Beauty Shop",
        seoDescription:
          "Как Asian Beauty Shop собирает, использует и защищает ваши персональные данные согласно GDPR.",
        body: `
<p><em>Последнее обновление: 21 апреля 2026 г.</em></p>

<p>Сайт Asian Beauty Shop принадлежит компании <strong>K'Elmus Group BV</strong>, Boomsesteenweg 41/4b, 2630 Aartselaar, Бельгия («мы»). Мы являемся контроллером персональных данных, обрабатываемых на этом сайте.</p>

<h2>Что мы собираем</h2>
<ul>
  <li><strong>Данные аккаунта</strong> — адрес электронной почты, имя и предпочтительный язык при создании аккаунта или оформлении заказа.</li>
  <li><strong>Данные заказа</strong> — адрес доставки и платёжный адрес, товары, статус оплаты. Данные банковской карты обрабатываются платёжным провайдером и никогда не хранятся у нас.</li>
  <li><strong>Технические данные</strong> — IP-адрес, тип браузера, информация об устройстве, собранные через cookie и серверные логи для безопасности.</li>
  <li><strong>Данные поддержки</strong> — содержимое ваших диалогов с AI-консьержем и службой поддержки. Хранятся только столько, сколько необходимо для ответа.</li>
</ul>

<h2>Как мы используем</h2>
<p>Мы обрабатываем данные для выполнения заказов, клиентской поддержки, отправки транзакционных писем и — с вашего явного согласия — для маркетинговых писем. Агрегированная, неперсонализированная аналитика помогает улучшать сайт.</p>

<h2>Правовое основание</h2>
<p>В рамках GDPR наши основания: (i) исполнение договора (при заказе), (ii) законные интересы (безопасность, защита от мошенничества), (iii) ваше согласие (маркетинг, необязательные cookie), (iv) юридические обязательства (бухгалтерия, налогообложение).</p>

<h2>Передача данных</h2>
<p>Мы передаём данные только проверенным обработчикам: Supabase (хостинг и база данных, ЕС), Mollie (платежи, ЕС), Sendcloud (доставка, ЕС) и нашему e-mail провайдеру. Мы не продаём ваши данные.</p>

<h2>Ваши права</h2>
<p>Вы можете в любой момент запросить доступ, исправление, экспорт или удаление данных. Напишите на <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>, мы ответим в течение 30 дней. Также вы имеете право подать жалобу в бельгийский орган по защите данных (gegevensbeschermingsautoriteit.be).</p>

<h2>Сроки хранения</h2>
<p>Заказы хранятся семь лет (бельгийское бухгалтерское законодательство). Данные аккаунта — до запроса на его удаление. Согласие на маркетинг действует до вашей отписки.</p>
`,
      },
    },
  },

  // ── Terms & Conditions ─────────────────────────────────────────────────
  {
    key: "terms",
    translations: {
      [Locale.EN]: {
        title: "Terms &amp; conditions",
        seoTitle: "Terms &amp; conditions — Asian Beauty Shop",
        seoDescription:
          "The terms that apply to your use of asianbeautyshop.eu and any purchase made on it.",
        body: `
<p><em>Last updated: 21 April 2026.</em></p>

<p>These terms apply to every purchase made on asianbeautyshop.eu. By placing an order you confirm that you have read, understood, and accepted them. The site is operated by <strong>K'Elmus Group BV</strong>, VAT BE&nbsp;1031.312.116, Boomsesteenweg 41/4b, 2630 Aartselaar, Belgium.</p>

<h2>1. Orders &amp; contract</h2>
<p>A contract is formed when we send you the order confirmation email. Before that point we may refuse an order — for example if a product is unexpectedly out of stock, a pricing error is detected, or the delivery address is outside our shipping zone.</p>

<h2>2. Prices &amp; payment</h2>
<p>All prices are shown in euros and include Belgian VAT (21% on finished cosmetics). Shipping costs are calculated at checkout. Payment is processed securely by Mollie; we do not see or store your card number.</p>

<h2>3. Shipping</h2>
<p>We ship within the EU via Sendcloud. Typical delivery is 2–5 business days. Tracking is emailed to you the moment your parcel leaves our warehouse.</p>

<h2>4. Right of withdrawal</h2>
<p>As a consumer in the EU you have 14 calendar days from the moment you receive your order to withdraw from the contract, without giving a reason. See our <a href="/legal/returns">returns &amp; refunds policy</a> for the full procedure and exceptions.</p>

<h2>5. Warranty</h2>
<p>All products are covered by the statutory two-year conformity warranty. If a product reaches you damaged or defective, contact us within 14 days at <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with a photo and your order number.</p>

<h2>6. Limitation of liability</h2>
<p>We are not liable for skin reactions caused by known allergens disclosed on the product ingredient list. Patch-test new products before full use; discontinue and seek medical advice if irritation occurs.</p>

<h2>7. Governing law</h2>
<p>These terms are governed by Belgian law. Any dispute falls under the exclusive jurisdiction of the courts of Antwerp (Antwerpen), without prejudice to consumer rights under EU law. You may also use the EU online dispute resolution platform at <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
`,
      },
      [Locale.NL]: {
        title: "Algemene voorwaarden",
        seoTitle: "Algemene voorwaarden — Asian Beauty Shop",
        seoDescription:
          "De voorwaarden voor het gebruik van asianbeautyshop.eu en elke bestelling die je er plaatst.",
        body: `
<p><em>Laatst bijgewerkt: 21 april 2026.</em></p>

<p>Deze voorwaarden gelden voor elke bestelling op asianbeautyshop.eu. Door te bestellen bevestig je dat je ze hebt gelezen, begrepen en aanvaard. De website wordt uitgebaat door <strong>K'Elmus Group BV</strong>, BTW BE&nbsp;1031.312.116, Boomsesteenweg 41/4b, 2630 Aartselaar, België.</p>

<h2>1. Bestelling &amp; overeenkomst</h2>
<p>De overeenkomst komt tot stand wanneer wij je de bevestigingsmail sturen. Tot dat moment kunnen we een bestelling weigeren — bijvoorbeeld bij onverwachte voorraadproblemen, een prijsfout of een adres buiten onze verzendzone.</p>

<h2>2. Prijzen &amp; betaling</h2>
<p>Alle prijzen zijn in euro en inclusief Belgische BTW (21% op afgewerkte cosmetica). Verzendkosten worden berekend bij het afrekenen. Betalingen worden veilig verwerkt door Mollie; wij zien of bewaren je kaartnummer niet.</p>

<h2>3. Verzending</h2>
<p>We verzenden binnen de EU via Sendcloud. Gemiddelde levertijd is 2–5 werkdagen. Je track &amp; trace wordt verstuurd zodra je pakket ons magazijn verlaat.</p>

<h2>4. Herroepingsrecht</h2>
<p>Als consument binnen de EU heb je 14 kalenderdagen vanaf ontvangst van je bestelling om de overeenkomst zonder opgave van reden te ontbinden. Zie ons <a href="/legal/returns">retour- en terugbetalingsbeleid</a> voor de volledige procedure en uitzonderingen.</p>

<h2>5. Garantie</h2>
<p>Alle producten vallen onder de wettelijke conformiteitsgarantie van twee jaar. Komt een product beschadigd of defect aan, contacteer ons binnen 14 dagen via <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> met een foto en je bestelnummer.</p>

<h2>6. Aansprakelijkheid</h2>
<p>We zijn niet aansprakelijk voor huidreacties veroorzaakt door op de ingrediëntenlijst vermelde allergenen. Test nieuwe producten met een kleine dosis voor gebruik; stop bij irritatie en raadpleeg een arts.</p>

<h2>7. Toepasselijk recht</h2>
<p>Op deze voorwaarden is het Belgisch recht van toepassing. Geschillen vallen onder de exclusieve bevoegdheid van de rechtbanken van Antwerpen, onverminderd je consumentenrechten onder EU-recht. Je kan ook het EU ODR-platform gebruiken op <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
`,
      },
      [Locale.FR]: {
        title: "Conditions générales",
        seoTitle: "Conditions générales — Asian Beauty Shop",
        seoDescription:
          "Les conditions applicables à toute utilisation de asianbeautyshop.eu et à tout achat effectué.",
        body: `
<p><em>Dernière mise à jour : 21 avril 2026.</em></p>

<p>Les présentes conditions s'appliquent à tout achat effectué sur asianbeautyshop.eu. En passant commande, vous confirmez les avoir lues, comprises et acceptées. Le site est exploité par <strong>K'Elmus Group BV</strong>, TVA BE&nbsp;1031.312.116, Boomsesteenweg 41/4b, 2630 Aartselaar, Belgique.</p>

<h2>1. Commande &amp; contrat</h2>
<p>Le contrat est formé à l'envoi de notre e-mail de confirmation de commande. Jusqu'à ce point nous pouvons refuser une commande — par exemple en cas de rupture de stock inattendue, d'erreur de prix ou d'adresse hors zone de livraison.</p>

<h2>2. Prix &amp; paiement</h2>
<p>Tous les prix sont en euros et incluent la TVA belge (21% pour les cosmétiques finis). Les frais de port sont calculés à la validation. Les paiements sont traités en toute sécurité par Mollie ; nous ne voyons ni ne stockons votre numéro de carte.</p>

<h2>3. Livraison</h2>
<p>Nous expédions dans l'UE via Sendcloud. Délai moyen : 2 à 5 jours ouvrés. Le suivi vous est envoyé par e-mail dès que votre colis quitte notre entrepôt.</p>

<h2>4. Droit de rétractation</h2>
<p>En tant que consommateur dans l'UE, vous disposez de 14 jours calendrier à compter de la réception pour vous rétracter sans motif. Consultez notre <a href="/legal/returns">politique de retour</a> pour la procédure complète et les exceptions.</p>

<h2>5. Garantie</h2>
<p>Tous les produits bénéficient de la garantie légale de conformité de deux ans. En cas de produit endommagé ou défectueux, contactez-nous sous 14 jours à <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> avec photo et numéro de commande.</p>

<h2>6. Responsabilité</h2>
<p>Nous ne sommes pas responsables des réactions cutanées dues aux allergènes listés dans la composition. Faites un test de tolérance sur une petite zone avant usage ; arrêtez en cas d'irritation et consultez un médecin.</p>

<h2>7. Droit applicable</h2>
<p>Les présentes conditions sont régies par le droit belge. Tout litige relève de la compétence exclusive des tribunaux d'Anvers, sans préjudice des droits des consommateurs au titre du droit de l'UE. Vous pouvez aussi utiliser la plateforme européenne de règlement en ligne sur <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
`,
      },
      [Locale.RU]: {
        title: "Пользовательское соглашение",
        seoTitle: "Пользовательское соглашение — Asian Beauty Shop",
        seoDescription:
          "Условия использования asianbeautyshop.eu и совершения покупок на нём.",
        body: `
<p><em>Последнее обновление: 21 апреля 2026 г.</em></p>

<p>Настоящие условия применяются к каждой покупке на asianbeautyshop.eu. Оформляя заказ, вы подтверждаете, что прочли и приняли их. Сайтом владеет <strong>K'Elmus Group BV</strong>, НДС BE&nbsp;1031.312.116, Boomsesteenweg 41/4b, 2630 Aartselaar, Бельгия.</p>

<h2>1. Заказ и договор</h2>
<p>Договор заключается в момент, когда мы отправляем вам подтверждение заказа. До этого мы можем отказаться от заказа — например, если товар закончился, обнаружена ошибка в цене или адрес за пределами нашей зоны доставки.</p>

<h2>2. Цены и оплата</h2>
<p>Все цены указаны в евро с учётом бельгийского НДС (21% на готовую косметику). Стоимость доставки рассчитывается при оформлении. Платежи обрабатывает Mollie; мы не видим и не храним номер вашей карты.</p>

<h2>3. Доставка</h2>
<p>Мы отправляем по ЕС через Sendcloud. Средний срок — 2–5 рабочих дней. Трек-номер приходит на почту, как только посылка покидает наш склад.</p>

<h2>4. Право отказа</h2>
<p>Как потребитель в ЕС, у вас есть 14 календарных дней с момента получения, чтобы отказаться от договора без объяснения причин. Подробная процедура и исключения — в нашей <a href="/legal/returns">политике возврата</a>.</p>

<h2>5. Гарантия</h2>
<p>На все товары действует установленная законом двухлетняя гарантия соответствия. Если товар пришёл повреждённым или неисправным, свяжитесь с нами в течение 14 дней по адресу <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>, приложив фото и номер заказа.</p>

<h2>6. Ограничение ответственности</h2>
<p>Мы не несём ответственности за реакции кожи на аллергены, указанные в составе. Проведите тест на небольшом участке перед применением; при раздражении прекратите использование и обратитесь к врачу.</p>

<h2>7. Применимое право</h2>
<p>Настоящие условия регулируются правом Бельгии. Споры подсудны судам Антверпена, без ущерба для прав потребителей по праву ЕС. Вы также можете воспользоваться платформой ОDR ЕС: <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
`,
      },
    },
  },

  // ── Cookie policy ───────────────────────────────────────────────────────
  {
    key: "cookies",
    translations: {
      [Locale.EN]: {
        title: "Cookie policy",
        seoTitle: "Cookie policy — Asian Beauty Shop",
        seoDescription:
          "What cookies we set, why we set them, and how you can change your preferences.",
        body: `
<p><em>Last updated: 21 April 2026.</em></p>

<p>Cookies are small text files stored on your device when you visit a website. We use them to keep your basket, remember your language, understand how the site is used, and — if you agree — to measure the effectiveness of our marketing.</p>

<h2>Categories</h2>
<h3>Necessary</h3>
<p>These cookies are required for the site to work — they keep you logged in, remember the items in your basket, and protect the site from abuse. They are set automatically and cannot be refused.</p>
<ul>
  <li><code>cart_token</code> — identifies your shopping basket (30 days)</li>
  <li><code>yur_consent</code> — remembers your cookie preferences (12 months)</li>
  <li><code>locale</code> — remembers your preferred language (12 months)</li>
</ul>

<h3>Analytics</h3>
<p>These cookies help us measure how visitors use the site (pages viewed, time on page, device type). The data is aggregated and never linked to your identity. You can refuse these at any time.</p>

<h3>Marketing</h3>
<p>These cookies power personalised advertising on partner sites and measure the success of our campaigns. You can refuse these at any time.</p>

<h2>Change your preferences</h2>
<p>Click the "Cookie preferences" link in the footer to open the banner again and update your choices. Your preferences are recorded for audit purposes.</p>
`,
      },
      [Locale.NL]: {
        title: "Cookiebeleid",
        seoTitle: "Cookiebeleid — Asian Beauty Shop",
        seoDescription:
          "Welke cookies we plaatsen, waarom en hoe je je voorkeuren kan aanpassen.",
        body: `
<p><em>Laatst bijgewerkt: 21 april 2026.</em></p>

<p>Cookies zijn kleine tekstbestanden die op je toestel worden opgeslagen wanneer je een website bezoekt. Wij gebruiken ze om je winkelmand te behouden, je taal te onthouden, te begrijpen hoe de site wordt gebruikt en — als je toestemming geeft — om onze marketing te meten.</p>

<h2>Categorieën</h2>
<h3>Noodzakelijk</h3>
<p>Deze cookies zijn nodig om de site te laten werken — ze houden je ingelogd, onthouden wat in je winkelmand zit en beschermen de site tegen misbruik. Ze worden automatisch geplaatst en kunnen niet worden geweigerd.</p>
<ul>
  <li><code>cart_token</code> — identificeert je winkelmand (30 dagen)</li>
  <li><code>yur_consent</code> — onthoudt je cookievoorkeuren (12 maanden)</li>
  <li><code>locale</code> — onthoudt je voorkeurstaal (12 maanden)</li>
</ul>

<h3>Analytisch</h3>
<p>Deze cookies helpen ons te meten hoe bezoekers de site gebruiken (bezochte pagina's, tijd per pagina, toesteltype). De data zijn geaggregeerd en nooit gelinkt aan je identiteit. Je kan ze op elk moment weigeren.</p>

<h3>Marketing</h3>
<p>Deze cookies maken gepersonaliseerde advertenties op partnersites mogelijk en meten het succes van onze campagnes. Je kan ze op elk moment weigeren.</p>

<h2>Voorkeuren aanpassen</h2>
<p>Klik op "Cookievoorkeuren" in de footer om de banner opnieuw te openen en je keuzes aan te passen. Je voorkeuren worden bijgehouden voor audit.</p>
`,
      },
      [Locale.FR]: {
        title: "Politique de cookies",
        seoTitle: "Politique de cookies — Asian Beauty Shop",
        seoDescription:
          "Quels cookies nous déposons, pourquoi, et comment modifier vos préférences.",
        body: `
<p><em>Dernière mise à jour : 21 avril 2026.</em></p>

<p>Les cookies sont de petits fichiers texte stockés sur votre appareil lors de votre visite. Nous les utilisons pour conserver votre panier, mémoriser votre langue, comprendre l'usage du site et — avec votre accord — mesurer l'efficacité de notre marketing.</p>

<h2>Catégories</h2>
<h3>Nécessaires</h3>
<p>Ces cookies sont indispensables au fonctionnement du site — ils vous maintiennent connecté, conservent les articles dans votre panier et protègent le site contre les abus. Ils sont déposés automatiquement et ne peuvent pas être refusés.</p>
<ul>
  <li><code>cart_token</code> — identifie votre panier (30 jours)</li>
  <li><code>yur_consent</code> — mémorise vos préférences cookies (12 mois)</li>
  <li><code>locale</code> — mémorise votre langue préférée (12 mois)</li>
</ul>

<h3>Analytiques</h3>
<p>Ces cookies nous aident à mesurer comment les visiteurs utilisent le site (pages vues, temps par page, type d'appareil). Les données sont agrégées et jamais liées à votre identité. Vous pouvez les refuser à tout moment.</p>

<h3>Marketing</h3>
<p>Ces cookies permettent la publicité personnalisée sur les sites partenaires et mesurent l'efficacité de nos campagnes. Vous pouvez les refuser à tout moment.</p>

<h2>Modifier vos préférences</h2>
<p>Cliquez sur « Préférences cookies » en pied de page pour rouvrir la bannière et ajuster vos choix. Vos préférences sont enregistrées à des fins d'audit.</p>
`,
      },
      [Locale.RU]: {
        title: "Политика cookie",
        seoTitle: "Политика cookie — Asian Beauty Shop",
        seoDescription:
          "Какие cookie мы используем, зачем и как изменить ваши предпочтения.",
        body: `
<p><em>Последнее обновление: 21 апреля 2026 г.</em></p>

<p>Cookie — это небольшие текстовые файлы, которые сохраняются на вашем устройстве при посещении сайта. Мы используем их для сохранения корзины, запоминания языка, анализа использования сайта и — с вашего согласия — оценки эффективности маркетинга.</p>

<h2>Категории</h2>
<h3>Необходимые</h3>
<p>Эти cookie нужны для работы сайта — они сохраняют вашу сессию, содержимое корзины и защищают сайт от злоупотреблений. Они устанавливаются автоматически и не могут быть отключены.</p>
<ul>
  <li><code>cart_token</code> — идентифицирует вашу корзину (30 дней)</li>
  <li><code>yur_consent</code> — сохраняет ваши предпочтения по cookie (12 месяцев)</li>
  <li><code>locale</code> — сохраняет предпочитаемый язык (12 месяцев)</li>
</ul>

<h3>Аналитические</h3>
<p>Эти cookie помогают измерять, как посетители пользуются сайтом (просмотренные страницы, время, тип устройства). Данные агрегированы и не связаны с вашей личностью. Вы можете отклонить их в любой момент.</p>

<h3>Маркетинговые</h3>
<p>Эти cookie нужны для персонализированной рекламы на партнёрских сайтах и оценки эффективности кампаний. Вы можете отклонить их в любой момент.</p>

<h2>Изменить предпочтения</h2>
<p>Нажмите «Настройки cookie» в подвале сайта, чтобы снова открыть баннер и изменить выбор. Ваши предпочтения сохраняются для аудита.</p>
`,
      },
    },
  },

  // ── Returns ─────────────────────────────────────────────────────────────
  {
    key: "returns",
    translations: {
      [Locale.EN]: {
        title: "Returns &amp; refunds",
        seoTitle: "Returns &amp; refunds — Asian Beauty Shop",
        seoDescription:
          "How to return a Asian Beauty Shop order within 14 days under EU consumer law — process, timing, return address and the model withdrawal form.",
        body: `
<p>We want you to love what you ordered. If something isn't right, here's how to send it back. This policy follows the EU Consumer Rights Directive 2011/83 and is the one that applies to every order shipped from Belgium.</p>

<h2>Your right of withdrawal (14 days)</h2>
<p>You have <strong>14 calendar days</strong> from the day the parcel is delivered to tell us you wish to return it — no reason required. The 14-day clock starts the moment you (or someone you nominated) physically receive the last item in the order.</p>

<h2>How to start a return</h2>
<ol>
  <li>Email <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with your order number (e.g. <em>YUR-1042</em>) and which items you'd like to return. You can also copy-paste the model withdrawal form at the bottom of this page.</li>
  <li>We'll reply within two working days with a return reference and — depending on your country — a prepaid return label or the return address.</li>
  <li>Pack the products in their original box where possible. Include a note with your order number so we can match the parcel quickly.</li>
  <li>Ship the parcel within <strong>14 days</strong> of notifying us.</li>
</ol>

<h2>Return address</h2>
<p>K'Elmus Group BV — Returns<br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
Belgium</p>

<h2>Condition of the products</h2>
<p>You may open the outer packaging to inspect what you've received, the same way you would in a physical shop. For hygiene reasons set out in EU Directive 2011/83, Article 16(e), opened or unsealed cosmetics cannot be returned once the protective seal has been broken.</p>
<p>If you handle the product beyond what's necessary to assess its nature and features, we may deduct a proportionate amount from your refund.</p>

<h2>Refunds</h2>
<p>Once we receive and inspect your return, we refund the full price of the returned items to your <strong>original payment method</strong> within <strong>14 days</strong>. Most banks and card issuers then credit the amount within 3–5 working days.</p>
<p>Outbound shipping is refunded on your first return per order; return shipping is at your expense unless the product arrived damaged, defective, or not as described.</p>

<h2>Damaged, defective, or wrong products</h2>
<p>If your parcel arrives damaged or you receive the wrong product, email <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with a photo and your order number within 14 days. We'll send a replacement or issue a full refund — including return shipping — at no cost to you.</p>

<h2>Questions?</h2>
<p>Write to <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>. We reply within one working day (Mon–Fri).</p>

<h2>Model withdrawal form</h2>
<p>You aren't required to use this form — any clear statement of your decision to withdraw is enough — but you can copy, fill in and send the lines below if you prefer.</p>
<blockquote>
<p><em>To: K'Elmus Group BV, Boomsesteenweg 41/4b, 2630 Aartselaar, Belgium — hello@asianbeautyshop.eu</em></p>
<p>I/we hereby give notice that I/we withdraw from my/our contract of sale of the following goods:<br>
Order number:<br>
Ordered on / received on:<br>
Name of consumer(s):<br>
Address of consumer(s):<br>
Date:<br>
Signature (only if this form is notified on paper):</p>
</blockquote>

<h2>Alternative dispute resolution</h2>
<p>If we can't resolve a complaint directly, you can submit it to the European Commission's <a href="https://ec.europa.eu/consumers/odr" rel="noreferrer">Online Dispute Resolution platform</a>.</p>
`,
      },
      [Locale.NL]: {
        title: "Retour &amp; terugbetaling",
        seoTitle: "Retour &amp; terugbetaling — Asian Beauty Shop",
        seoDescription:
          "Hoe je een Asian Beauty Shop-bestelling binnen 14 dagen retourneert volgens Europees consumentenrecht — procedure, termijnen, retouradres en modelformulier voor herroeping.",
        body: `
<p>We willen dat je houdt van wat je bestelde. Is er iets niet goed? Zo stuur je het terug. Dit beleid volgt de Europese richtlijn consumentenrechten 2011/83 en geldt voor elke bestelling die we verzenden vanuit België.</p>

<h2>Je herroepingsrecht (14 dagen)</h2>
<p>Je hebt <strong>14 kalenderdagen</strong> vanaf de dag dat het pakket is geleverd om ons te laten weten dat je wilt retourneren — zonder reden. De termijn begint op het moment dat jij (of iemand die je hebt aangewezen) het laatste artikel van de bestelling fysiek in handen krijgt.</p>

<h2>Hoe start je een retour</h2>
<ol>
  <li>Mail <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> met je bestelnummer (bv. <em>YUR-1042</em>) en welke artikelen je wilt retourneren. Je kunt ook het modelformulier onderaan deze pagina kopiëren.</li>
  <li>We antwoorden binnen twee werkdagen met een retourreferentie en — afhankelijk van je land — een retourlabel of het retouradres.</li>
  <li>Verpak de producten indien mogelijk in hun oorspronkelijke doos. Voeg een briefje toe met je bestelnummer zodat we het pakket snel kunnen koppelen.</li>
  <li>Verstuur het pakket binnen <strong>14 dagen</strong> na je melding.</li>
</ol>

<h2>Retouradres</h2>
<p>K'Elmus Group BV — Retours<br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
België</p>

<h2>Staat van de producten</h2>
<p>Je mag de buitenverpakking openen om te bekijken wat je hebt ontvangen, net zoals in een fysieke winkel. Om hygiënische redenen, vastgelegd in EU-richtlijn 2011/83, artikel 16(e), kunnen geopende of ontzegelde cosmetica niet worden geretourneerd zodra de beschermingsverzegeling is verbroken.</p>
<p>Als je het product verder hebt gehanteerd dan nodig om de aard en eigenschappen te beoordelen, kunnen we een evenredig bedrag inhouden op de terugbetaling.</p>

<h2>Terugbetaling</h2>
<p>Zodra we je retour ontvangen en beoordeeld hebben, betalen we de volledige productprijs binnen <strong>14 dagen</strong> terug via je <strong>oorspronkelijke betaalmethode</strong>. De meeste banken en kaartuitgevers crediteren het bedrag vervolgens binnen 3–5 werkdagen.</p>
<p>Uitgaande verzendkosten worden terugbetaald bij je eerste retour per bestelling; retourkosten zijn voor jouw rekening, tenzij het product beschadigd, defect of niet conform was.</p>

<h2>Beschadigd, defect of verkeerd product</h2>
<p>Is je pakket beschadigd aangekomen of heb je het verkeerde product ontvangen? Mail binnen 14 dagen naar <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> met een foto en je bestelnummer. We sturen een vervanging of betalen alles terug — inclusief retourkosten — kosteloos.</p>

<h2>Vragen?</h2>
<p>Schrijf naar <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>. We antwoorden binnen één werkdag (ma–vr).</p>

<h2>Modelformulier voor herroeping</h2>
<p>Je bent niet verplicht dit formulier te gebruiken — elke duidelijke verklaring dat je de overeenkomst wilt herroepen volstaat — maar je mag onderstaande tekst kopiëren, invullen en opsturen als je dat prettig vindt.</p>
<blockquote>
<p><em>Aan: K'Elmus Group BV, Boomsesteenweg 41/4b, 2630 Aartselaar, België — hello@asianbeautyshop.eu</em></p>
<p>Ik/wij deel/delen u hierbij mede dat ik/wij onze overeenkomst betreffende de verkoop van de volgende goederen herroep/herroepen:<br>
Bestelnummer:<br>
Besteld op / ontvangen op:<br>
Naam van de consument(en):<br>
Adres van de consument(en):<br>
Datum:<br>
Handtekening (alleen wanneer dit formulier op papier wordt ingediend):</p>
</blockquote>

<h2>Alternatieve geschillenbeslechting</h2>
<p>Als we een klacht niet rechtstreeks kunnen oplossen, kun je ze voorleggen aan het <a href="https://ec.europa.eu/consumers/odr" rel="noreferrer">ODR-platform van de Europese Commissie</a>.</p>
`,
      },
      [Locale.FR]: {
        title: "Retours &amp; remboursements",
        seoTitle: "Retours &amp; remboursements — Asian Beauty Shop",
        seoDescription:
          "Comment retourner une commande Asian Beauty Shop sous 14 jours conformément au droit européen — procédure, délais, adresse de retour et formulaire de rétractation.",
        body: `
<p>Nous voulons que vous aimiez ce que vous avez commandé. Si quelque chose ne va pas, voici comment nous le renvoyer. Cette politique suit la directive européenne 2011/83 relative aux droits des consommateurs et s'applique à chaque commande expédiée depuis la Belgique.</p>

<h2>Votre droit de rétractation (14 jours)</h2>
<p>Vous disposez de <strong>14 jours calendrier</strong> à compter du jour de la livraison pour nous informer de votre souhait de retour — sans avoir à fournir de motif. Le délai commence au moment où vous (ou une personne désignée par vous) recevez physiquement le dernier article de la commande.</p>

<h2>Comment initier un retour</h2>
<ol>
  <li>Écrivez à <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> avec votre numéro de commande (ex. <em>YUR-1042</em>) et les articles à retourner. Vous pouvez aussi copier-coller le formulaire type de rétractation en bas de cette page.</li>
  <li>Nous répondons sous deux jours ouvrés avec une référence de retour et — selon votre pays — une étiquette prépayée ou l'adresse de retour.</li>
  <li>Emballez les produits dans leur boîte d'origine si possible. Joignez un mot avec votre numéro de commande pour que nous puissions associer le colis rapidement.</li>
  <li>Expédiez le colis dans les <strong>14 jours</strong> suivant votre notification.</li>
</ol>

<h2>Adresse de retour</h2>
<p>K'Elmus Group BV — Retours<br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
Belgique</p>

<h2>État des produits</h2>
<p>Vous pouvez ouvrir l'emballage extérieur pour inspecter ce que vous avez reçu, comme vous le feriez dans une boutique physique. Pour des raisons d'hygiène prévues à l'article 16(e) de la directive UE 2011/83, les cosmétiques ouverts ou descellés ne peuvent plus être retournés dès que le scellé de protection a été brisé.</p>
<p>Si vous avez manipulé le produit au-delà de ce qui est nécessaire pour en évaluer la nature et les caractéristiques, nous pouvons retenir un montant proportionné sur votre remboursement.</p>

<h2>Remboursements</h2>
<p>Dès la réception et la vérification de votre retour, nous remboursons l'intégralité du prix des articles retournés sur votre <strong>moyen de paiement initial</strong> dans un délai de <strong>14 jours</strong>. La plupart des banques et émetteurs de cartes créditent ensuite le montant sous 3–5 jours ouvrés.</p>
<p>Les frais d'expédition aller sont remboursés sur votre premier retour par commande ; les frais de retour restent à votre charge, sauf si le produit est arrivé endommagé, défectueux ou non conforme à la description.</p>

<h2>Produit endommagé, défectueux ou incorrect</h2>
<p>Si votre colis arrive endommagé ou que vous recevez un produit incorrect, écrivez-nous sous 14 jours à <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> avec une photo et votre numéro de commande. Nous envoyons un remplacement ou remboursons l'intégralité — frais de retour inclus — sans frais pour vous.</p>

<h2>Des questions ?</h2>
<p>Écrivez à <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>. Nous répondons sous un jour ouvré (lun–ven).</p>

<h2>Formulaire type de rétractation</h2>
<p>Vous n'êtes pas tenu d'utiliser ce formulaire — toute déclaration claire de votre décision de vous rétracter suffit — mais vous pouvez copier, remplir et envoyer le texte ci-dessous si vous préférez.</p>
<blockquote>
<p><em>À : K'Elmus Group BV, Boomsesteenweg 41/4b, 2630 Aartselaar, Belgique — hello@asianbeautyshop.eu</em></p>
<p>Je/nous vous notifie/notifions par la présente ma/notre rétractation du contrat portant sur la vente des biens suivants :<br>
Numéro de commande :<br>
Commandé le / reçu le :<br>
Nom du/des consommateur(s) :<br>
Adresse du/des consommateur(s) :<br>
Date :<br>
Signature (uniquement en cas de notification du présent formulaire par papier) :</p>
</blockquote>

<h2>Règlement alternatif des litiges</h2>
<p>Si nous ne parvenons pas à résoudre une réclamation directement, vous pouvez la soumettre à la <a href="https://ec.europa.eu/consumers/odr" rel="noreferrer">plateforme de règlement en ligne des litiges de la Commission européenne</a>.</p>
`,
      },
      [Locale.RU]: {
        title: "Возврат и возмещение",
        seoTitle: "Возврат и возмещение — Asian Beauty Shop",
        seoDescription:
          "Как вернуть заказ Asian Beauty Shop в течение 14 дней согласно европейскому законодательству — процедура, сроки, адрес возврата и типовая форма отказа.",
        body: `
<p>Мы хотим, чтобы вам нравился ваш заказ. Если что-то не так — вот как его вернуть. Эта политика основана на Директиве ЕС 2011/83 о правах потребителей и действует для каждого заказа, отправленного из Бельгии.</p>

<h2>Ваше право на отказ (14 дней)</h2>
<p>У вас есть <strong>14 календарных дней</strong> со дня доставки, чтобы сообщить нам о желании вернуть заказ — без объяснения причин. Отсчёт начинается с момента, когда вы (или указанное вами лицо) физически получили последний товар из заказа.</p>

<h2>Как оформить возврат</h2>
<ol>
  <li>Напишите на <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> с номером заказа (например, <em>YUR-1042</em>) и списком товаров к возврату. Можно также скопировать типовую форму отказа в конце страницы.</li>
  <li>Мы ответим в течение двух рабочих дней, пришлём номер возврата и — в зависимости от страны — предоплаченную этикетку либо адрес возврата.</li>
  <li>По возможности упакуйте товары в оригинальную коробку. Приложите записку с номером заказа, чтобы мы быстро сопоставили посылку.</li>
  <li>Отправьте посылку в течение <strong>14 дней</strong> после уведомления.</li>
</ol>

<h2>Адрес возврата</h2>
<p>K'Elmus Group BV — Returns<br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
Бельгия</p>

<h2>Состояние товаров</h2>
<p>Вы можете вскрыть внешнюю упаковку и осмотреть полученный товар — как в обычном магазине. Из соображений гигиены, закреплённых в ст. 16(e) Директивы ЕС 2011/83, вскрытая или распечатанная косметика не принимается к возврату после нарушения защитной пломбы.</p>
<p>Если обращение с товаром выходит за пределы проверки его характеристик и свойств, мы вправе удержать соразмерную сумму из возмещения.</p>

<h2>Возмещение</h2>
<p>Как только мы получим и проверим возврат, мы вернём полную стоимость возвращённых товаров на ваш <strong>исходный способ оплаты</strong> в течение <strong>14 дней</strong>. Большинство банков и эмитентов карт зачисляют деньги в течение 3–5 рабочих дней после этого.</p>
<p>Стоимость прямой доставки возмещается при первом возврате по заказу; обратная доставка оплачивается вами, если только товар не пришёл повреждённым, неисправным или не соответствующим описанию.</p>

<h2>Повреждённый, неисправный или неверный товар</h2>
<p>Если посылка пришла повреждённой или вы получили не тот товар — напишите в течение 14 дней на <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> с фотографией и номером заказа. Мы бесплатно отправим замену или вернём полную сумму, включая стоимость обратной доставки.</p>

<h2>Вопросы?</h2>
<p>Пишите на <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a>. Мы отвечаем в течение одного рабочего дня (пн–пт).</p>

<h2>Типовая форма отказа</h2>
<p>Использовать эту форму не обязательно — достаточно любого ясного заявления о вашем намерении отказаться — но вы можете скопировать, заполнить и отправить приведённый ниже текст, если так удобнее.</p>
<blockquote>
<p><em>Кому: K'Elmus Group BV, Boomsesteenweg 41/4b, 2630 Aartselaar, Бельгия — hello@asianbeautyshop.eu</em></p>
<p>Настоящим я/мы уведомляю/уведомляем об отказе от заключённого мной/нами договора купли-продажи следующих товаров:<br>
Номер заказа:<br>
Дата заказа / дата получения:<br>
Имя потребителя(ей):<br>
Адрес потребителя(ей):<br>
Дата:<br>
Подпись (только если форма подаётся на бумаге):</p>
</blockquote>

<h2>Альтернативное урегулирование споров</h2>
<p>Если мы не можем решить претензию напрямую, вы можете подать её через <a href="https://ec.europa.eu/consumers/odr" rel="noreferrer">платформу онлайн-урегулирования споров Европейской комиссии</a>.</p>
`,
      },
    },
  },

  // ── Imprint ─────────────────────────────────────────────────────────────
  {
    key: "imprint",
    translations: {
      [Locale.EN]: {
        title: "Imprint",
        seoTitle: "Imprint — Asian Beauty Shop",
        seoDescription:
          "Legal information about K'Elmus Group BV, the company behind Asian Beauty Shop.",
        body: `
<h2>Company</h2>
<p><strong>K'Elmus Group BV</strong><br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
Belgium</p>

<h2>Registration</h2>
<p>Enterprise number (KBO/BCE): <strong>BE 1031.312.116</strong><br>
VAT: <strong>BE 1031.312.116</strong><br>
Registered at the Crossroads Bank for Enterprises, Brussels.</p>

<h2>Bank</h2>
<p>K'Elmus Group BV<br>
IBAN: <strong>BE96 0689 5761 0905</strong><br>
BIC/SWIFT: GKCCBEBB</p>

<h2>Contact</h2>
<p>Email: <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a></p>

<h2>Responsible for content</h2>

<h2>Dispute resolution</h2>
<p>The European Commission provides an online dispute resolution platform at <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>. We are not obliged to participate in dispute resolution proceedings before a consumer arbitration board, but we are willing to do so.</p>
`,
      },
      [Locale.NL]: {
        title: "Wettelijke vermeldingen",
        seoTitle: "Wettelijke vermeldingen — Asian Beauty Shop",
        seoDescription:
          "Juridische informatie over K'Elmus Group BV, het bedrijf achter Asian Beauty Shop.",
        body: `
<h2>Onderneming</h2>
<p><strong>K'Elmus Group BV</strong><br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
België</p>

<h2>Registratie</h2>
<p>Ondernemingsnummer (KBO): <strong>BE 1031.312.116</strong><br>
BTW: <strong>BE 1031.312.116</strong><br>
Ingeschreven bij de Kruispuntbank van Ondernemingen, Brussel.</p>

<h2>Bank</h2>
<p>K'Elmus Group BV<br>
IBAN: <strong>BE96 0689 5761 0905</strong><br>
BIC/SWIFT: GKCCBEBB</p>

<h2>Contact</h2>
<p>E-mail: <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a></p>

<h2>Verantwoordelijk voor de inhoud</h2>

<h2>Geschillenregeling</h2>
<p>De Europese Commissie voorziet in een online geschillenplatform op <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>. Wij zijn niet verplicht om deel te nemen aan een consumentenarbitrageprocedure, maar staan daarvoor open.</p>
`,
      },
      [Locale.FR]: {
        title: "Mentions légales",
        seoTitle: "Mentions légales — Asian Beauty Shop",
        seoDescription:
          "Informations légales sur K'Elmus Group BV, la société derrière Asian Beauty Shop.",
        body: `
<h2>Société</h2>
<p><strong>K'Elmus Group BV</strong><br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
Belgique</p>

<h2>Enregistrement</h2>
<p>Numéro d'entreprise (BCE) : <strong>BE 1031.312.116</strong><br>
TVA : <strong>BE 1031.312.116</strong><br>
Inscrite à la Banque-Carrefour des Entreprises, Bruxelles.</p>

<h2>Banque</h2>
<p>K'Elmus Group BV<br>
IBAN : <strong>BE96 0689 5761 0905</strong><br>
BIC/SWIFT : GKCCBEBB</p>

<h2>Contact</h2>
<p>E-mail : <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a></p>

<h2>Responsable du contenu</h2>

<h2>Règlement des litiges</h2>
<p>La Commission européenne met à disposition une plateforme de règlement en ligne des litiges : <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>. Nous ne sommes pas tenus de participer à une procédure d'arbitrage de consommation, mais y sommes ouverts.</p>
`,
      },
      [Locale.RU]: {
        title: "Выходные данные",
        seoTitle: "Выходные данные — Asian Beauty Shop",
        seoDescription:
          "Юридическая информация о K'Elmus Group BV, компании, стоящей за Asian Beauty Shop.",
        body: `
<h2>Компания</h2>
<p><strong>K'Elmus Group BV</strong><br>
Boomsesteenweg 41/4b<br>
2630 Aartselaar<br>
Бельгия</p>

<h2>Регистрация</h2>
<p>Регистрационный номер предприятия (KBO): <strong>BE 1031.312.116</strong><br>
НДС: <strong>BE 1031.312.116</strong><br>
Зарегистрировано в Crossroads Bank for Enterprises, Брюссель.</p>

<h2>Банк</h2>
<p>K'Elmus Group BV<br>
IBAN: <strong>BE96 0689 5761 0905</strong><br>
BIC/SWIFT: GKCCBEBB</p>

<h2>Контакты</h2>
<p>E-mail: <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a></p>

<h2>Ответственный за содержание</h2>

<h2>Разрешение споров</h2>
<p>Еврокомиссия предоставляет онлайн-платформу для разрешения споров: <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>. Мы не обязаны участвовать в процедуре потребительского арбитража, но готовы это делать.</p>
`,
      },
    },
  },

  // ── About ───────────────────────────────────────────────────────────────
  // Seeded from the HQ brand materials doc (2026-04-23). EN only for now;
  // NL / FR / RU translations to follow after an admin's sign-off on the copy.
  // Structure mirrors the HQ doc: philosophy → story → mission → values
  // → production → certifications.
  {
    key: "about",
    translations: {
      [Locale.EN]: {
        title: "About Asian Beauty Shop",
        seoTitle: "About — Asian Beauty Shop",
        seoDescription:
          "The brand, story, and philosophy behind Asian Beauty Shop — Korean skincare built on 30 years of expertise, made for skin that wants to work with it, not against it.",
        body: `
<p class="lede"><em>You Are the Skin Solution.</em> Asian Beauty Shop is dedicated to high-performance skincare that blends traditional Korean beauty wisdom with modern cosmetic science. Founded on innovation and uncompromising quality, we create products that deliver visible results — and that respect the skin's long-term health while they do it.</p>

<h2>Our story</h2>
<p>Founded by Mr. and Mrs. Jung — renowned experts with over thirty years of experience in Korean skincare manufacturing — Asian Beauty Shop launched in South Korea in 2017, bringing together deep expertise, innovation, and a refined approach to skin health.</p>
<p>Initially growing across the Commonwealth of Independent States, the brand has been expanding its global presence since 2023, entering and captivating international markets.</p>
<p>Asian Beauty Shop was created in response to the growing need for effective, science-driven skincare that goes beyond surface-level results. The brand was founded with a clear vision: to deliver targeted solutions that address the root causes of skin concerns rather than simply concealing them.</p>
<p>At the heart of Asian Beauty Shop lies its philosophy — <strong>"You Are the Skin Solution"</strong> — emphasising the importance of personalised care and the belief that healthy skin begins with understanding its unique needs.</p>

<h2>Our mission</h2>
<p>To create intelligent, science-driven skincare that delivers visible and lasting results. We aim to provide targeted solutions that address individual skin concerns while supporting the skin's natural health, balance, and radiance.</p>

<h2>Our values</h2>
<ul>
  <li><strong>Innovation.</strong> We continuously develop advanced formulations based on cutting-edge cosmetic science.</li>
  <li><strong>Effectiveness.</strong> Every product is designed to deliver real, visible improvements to the skin.</li>
  <li><strong>Personalised care.</strong> Skincare should adapt to individual skin needs and conditions.</li>
  <li><strong>Skin health first.</strong> Long-term skin wellness is always our top priority.</li>
  <li><strong>Trust &amp; quality.</strong> We are committed to high standards, safety, and transparency in every product we create.</li>
</ul>

<h2>Production</h2>
<p>Our products are manufactured at two advanced facilities in South Korea — <strong>ECIS</strong> and <strong>CIT</strong> — both recognised for their innovation and uncompromising quality standards.</p>
<p>Located in the heart of South Korea, ECIS is a state-of-the-art production facility dedicated to crafting premium skincare through advanced technologies and strict quality control. Every formula undergoes rigorous testing to ensure both safety and proven efficacy.</p>
<p>Alongside ECIS, the CIT factory plays a key role in our production process, upholding equally high standards. With cutting-edge technology and modern manufacturing practices, CIT ensures consistency, performance, and reliability across every product.</p>
<p>Sustainability remains a core part of our philosophy. Across both facilities, we prioritise eco-conscious processes, reducing waste and incorporating environmentally friendly materials wherever possible.</p>

<h2>Certifications &amp; compliance</h2>
<p>Asian Beauty Shop products are certified and compliant with international safety and cosmetic regulations, including <strong>CPNP</strong> (EU Cosmetic Notification), <strong>ECAS</strong> (Emirates Conformity Assessment Scheme), <strong>Montaji</strong> (Dubai Municipality Authority), and <strong>GMP</strong> (Good Manufacturing Practice).</p>

<h2>A note on pregnancy &amp; breastfeeding</h2>
<p>Our products are formulated with carefully selected ingredients and are designed to be gentle on the skin. During pregnancy and breastfeeding, skin can become more sensitive — we advise consulting a healthcare professional before introducing any new skincare into your routine during this period.</p>
`,
      },
      // NL / FR / RU translations are deliberately omitted. The Page
      // query layer falls back to EN if a locale is missing, so /nl/about
      // etc. will render the EN copy (with a small fallback banner) until
      // an admin ships proper translations via /admin/pages.
    },
  },

  // ── Shipping ────────────────────────────────────────────────────────────
  // Public pre-contractual shipping info. Mandatory under Belgian Code of
  // Economic Law Art. VI.45 (delivery time + cost must be disclosed before
  // the customer is bound). EN-first; other locales fall back until an admin
  // translates them via /admin/pages.
  {
    key: "shipping",
    translations: {
      [Locale.EN]: {
        title: "Shipping",
        seoTitle: "Shipping — Asian Beauty Shop",
        seoDescription:
          "Where we ship, how long it takes, and how much it costs. Flat-rate across Belgium, the Netherlands, France, Luxembourg and Germany — free above €75.",
        body: `
<p class="lede">We ship from our studio in Aartselaar, Belgium, by local carrier. Orders placed before 14:00 CET on working days are handed to the carrier the same day. We aim to confirm dispatch within one working day and will always email you a tracking link the moment your parcel is on the way.</p>

<h2>Where we ship</h2>
<p>We currently ship across Belgium, the Netherlands, Luxembourg, France, and Germany. If you'd like us to reach further, <a href="/contact">write to us</a> — we're expanding carefully, country by country.</p>

<h2>Rates &amp; delivery times</h2>
<p>Flat-rate shipping of €5.95 on every order, with free delivery above €75. Typical carrier times from dispatch:</p>
<ul>
  <li><strong>Belgium &amp; Luxembourg</strong> — 1–2 working days</li>
  <li><strong>Netherlands</strong> — 2–3 working days</li>
  <li><strong>France &amp; Germany</strong> — 3–5 working days</li>
</ul>
<p>Delivery times are indicative; they can stretch around public holidays and Belgian postal strike days. If a parcel takes longer than a week beyond the upper estimate, email <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with your order number and we'll trace it together.</p>

<h2>Tracking</h2>
<p>Once your parcel ships you'll receive an email with a tracking link. You can also find it inside your <a href="/account/orders">account</a> under the order details.</p>

<h2>VAT, duties &amp; taxes</h2>
<p>All prices on the site include Belgian VAT (21% on finished cosmetics). No customs duties apply inside the EU. If we expand outside the EU in future, any import duties would be the recipient's responsibility — we'll flag it clearly at checkout when that time comes.</p>

<h2>Failed delivery &amp; re-shipment</h2>
<p>If your parcel is returned to us as undeliverable — wrong address, missed collection, refused delivery — we'll email you for the correct details. A re-shipment is covered by our flat-rate fee; we'll confirm the total before anything leaves the studio a second time.</p>

<h2>Damaged in transit</h2>
<p>If your parcel arrives damaged, email <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with a photo and your order number within 14 days. We'll replace the affected items or issue a full refund at no cost to you — see our <a href="/legal/returns">returns policy</a> for full details.</p>

<h2>Packaging</h2>
<p>Glass and ceramic go out in recycled moulded-pulp trays. The outer carton is FSC-certified cardboard, sealed with paper tape. No plastic void-fill. Everything we send is curb-side recyclable.</p>

<h2>Questions</h2>
<p>Anything we haven't covered? Write to <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> — we reply within one working day, Monday to Friday.</p>
`,
      },
    },
  },

  // ── FAQ ─────────────────────────────────────────────────────────────────
  // Q&A-style page covering the top questions an admin gets over email, so
  // we deflect the obvious ones and leave her time for real skincare
  // conversations. Structure mirrors Google's FAQ schema (each <h3> is a
  // question, each <p>/<ul> after it is the answer) so we can attach
  // FAQPage JSON-LD in a later pass.
  {
    key: "faq",
    translations: {
      [Locale.EN]: {
        title: "Frequently asked questions",
        seoTitle: "FAQ — Asian Beauty Shop",
        seoDescription:
          "Answers to the questions we get most often — about ordering, shipping, returns, ingredients, routines, and the Asian Beauty Shop brand.",
        body: `
<p class="lede">Before writing to us, have a look below — the answer is probably here. If it isn't, we'd rather hear from you. <a href="/contact">Contact us</a> any time.</p>

<h2>Ordering</h2>

<h3>Do I need an account to order?</h3>
<p>No — you can check out as a guest. An account is useful if you want to track orders, reorder a ritual, save addresses, or use the wishlist. You can <a href="/sign-up">create one</a> any time, and we'll link past guest orders placed under the same email.</p>

<h3>Which payment methods do you accept?</h3>
<p>Bancontact, iDEAL, credit card (Visa, Mastercard, Amex), and SEPA bank transfer — all processed securely by Mollie. We don't see or store your card details.</p>

<h3>Can I change or cancel an order after it's placed?</h3>
<p>If your order hasn't shipped yet, email <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with your order number and the change you need — we'll help where we can. Once the parcel is with the carrier, you'll need to use our <a href="/legal/returns">returns flow</a> when it arrives.</p>

<h2>Shipping &amp; delivery</h2>

<h3>How long does delivery take?</h3>
<p>Belgium and Luxembourg: 1–2 working days from dispatch. Netherlands: 2–3. France and Germany: 3–5. Full details on our <a href="/shipping">shipping page</a>.</p>

<h3>How much is shipping?</h3>
<p>Flat €5.95 across Belgium, the Netherlands, Luxembourg, France and Germany — free above €75.</p>

<h3>Do you ship outside the EU?</h3>
<p>Not yet. If you'd like us to reach your country, <a href="/contact">let us know</a>.</p>

<h2>Returns &amp; refunds</h2>

<h3>What is your returns policy?</h3>
<p>14 days from the day you receive your order, under EU right-of-withdrawal rules. Unopened, unused items are fully refundable. Used skincare — for hygiene reasons — we take back only if it's defective or damaged. See the full <a href="/legal/returns">returns policy</a>.</p>

<h3>How do I start a return?</h3>
<p>Sign in, open the relevant order under <a href="/account/orders">Your orders</a>, and choose <em>Return this order</em>. We'll email an RMA number and the return address. Refunds land within 14 days of us receiving the parcel.</p>

<h2>Products &amp; ingredients</h2>

<h3>Are Asian Beauty Shop products cruelty-free and vegan?</h3>
<p>All Asian Beauty Shop products are cruelty-free — no animal testing at any stage, as required by EU cosmetic law and by our own standards. Most (not all) of our range is also vegan; check each product's detail page for the specific designation.</p>

<h3>Are your products suitable during pregnancy or breastfeeding?</h3>
<p>Our formulas are gentle, but the skin can behave differently during pregnancy and breastfeeding. We advise consulting a healthcare professional before introducing any new skincare into your routine during this period.</p>

<h3>Where are Asian Beauty Shop products manufactured?</h3>
<p>At two advanced facilities in South Korea — ECIS and CIT — both GMP-certified and compliant with EU (CPNP), Emirates (ECAS) and Dubai (Montaji) cosmetic regulations. Read more on our <a href="/about">about page</a>.</p>

<h3>How do I choose the right products for my skin?</h3>
<p>Take the <a href="/quiz">skin quiz</a> — four short questions and we'll suggest a four-step routine that fits. If you'd rather talk it through, tap the Asian Beauty Shop seal in the bottom-right corner and our concierge will help you narrow it down.</p>

<h2>Account &amp; privacy</h2>

<h3>How do I reset my password?</h3>
<p>Use the <a href="/forgot-password">forgot password</a> link. We'll email a reset link that stays valid for one hour.</p>

<h3>How do I delete my account or export my data?</h3>
<p>Under EU GDPR you can request a full export of your data or delete your account any time from <a href="/account/privacy">Privacy &amp; data</a>. Deletion is soft for 30 days — you can undo it if you change your mind — and becomes permanent after that.</p>

<h2>Business &amp; wholesale</h2>

<h3>Do you offer wholesale or professional accounts?</h3>
<p>Yes — if you run a salon, spa, or retail space and want to stock Asian Beauty Shop, email <a href="mailto:hello@asianbeautyshop.eu">hello@asianbeautyshop.eu</a> with a brief description of your business. We'll come back with the wholesale terms and the onboarding steps.</p>
`,
      },
    },
  },
];

async function main() {
  // ── CLI flags ────────────────────────────────────────────────────────
  // Default behaviour: don't overwrite existing translations (an admin may
  // have edited them in admin).
  //
  //   --force           overwrite ALL legal translations
  //   --force=returns   overwrite just one key (comma-separated list OK)
  //
  // The "just one key" flavour is the one an admin will reach for when we
  // refresh, e.g., the returns policy to reflect a legal-counsel update.
  const args = process.argv.slice(2);
  const forceFlag = args.find((a) => a === "--force" || a.startsWith("--force="));
  const forceAll = forceFlag === "--force";
  const forcedKeys = new Set<string>(
    forceFlag && forceFlag.startsWith("--force=")
      ? forceFlag.slice("--force=".length).split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  );

  console.log(
    forceAll
      ? "🌱  Seeding legal pages (FORCE ALL — will overwrite every translation) …"
      : forcedKeys.size > 0
        ? `🌱  Seeding legal pages (forcing: ${[...forcedKeys].join(", ")}) …`
        : "🌱  Seeding legal pages …",
  );

  for (const p of PAGES) {
    // 1. Upsert the Page row (key is unique)
    const page = await prisma.page.upsert({
      where: { key: p.key },
      update: {}, // don't touch existing isActive/etc
      create: { key: p.key, isActive: true },
    });

    const shouldOverwrite = forceAll || forcedKeys.has(p.key);

    // 2. For each locale, upsert the translation.  By default we don't
    //    overwrite existing rows — an admin may have edited them.  With
    //    --force or --force=<key> we overwrite in place.
    for (const locale of Object.keys(p.translations) as Locale[]) {
      const t = p.translations[locale];
      if (!t) continue; // Partial — skip locales the entry deliberately omits
      const existing = await prisma.pageTranslation.findUnique({
        where: { pageId_locale: { pageId: page.id, locale } },
      });

      if (existing && !shouldOverwrite) {
        console.log(`   · ${p.key} (${locale}) already exists — skipping`);
        continue;
      }

      if (existing && shouldOverwrite) {
        await prisma.pageTranslation.update({
          where: { pageId_locale: { pageId: page.id, locale } },
          data: {
            title: t.title,
            body: t.body.trim(),
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
          },
        });
        console.log(`   · UPDATED ${p.key} (${locale})`);
        continue;
      }

      await prisma.pageTranslation.create({
        data: {
          pageId: page.id,
          locale,
          title: t.title,
          body: t.body.trim(),
          seoTitle: t.seoTitle,
          seoDescription: t.seoDescription,
        },
      });
      console.log(`   · created ${p.key} (${locale})`);
    }
  }

  console.log("✅  Legal seed complete.");
}

main()
  .catch((e) => {
    console.error("❌  Legal seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
