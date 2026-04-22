// ─────────────────────────────────────────────────────────────────────────
// Newsletter confirmation email — plain HTML string template.
//
// We deliberately avoid React Email / MJML here. The template is tiny,
// the audience is GDPR-required double-opt-in, and keeping it as a
// string means it ships with zero build-time cost and no extra deps.
//
// The email is intentionally understated — it reflects the brand voice
// (quiet, editorial) rather than a noisy marketing CTA.
//
// All copy is localised per the subscriber's declared locale.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";

// ────────── per-locale strings ──────────────────────────────────────────

type Strings = {
  subject: string;
  preheader: string;
  greeting: string;
  lede: string;
  cta: string;
  alt: string;
  signoff: string;
  footer: string;
  ignore: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Confirm your subscription — YU.R Skin Solution",
    preheader: "One click to confirm your place on the monthly letter.",
    greeting: "Hello,",
    lede:
      "Thank you for signing up to the YU.R letter. Please confirm your email address so we know we have the right inbox.",
    cta: "Confirm my subscription",
    alt: "If the button above doesn't work, copy and paste this link into your browser:",
    signoff: "— The YU.R team",
    footer:
      "You received this email because someone entered this address on yurskinsolution.eu. If it wasn't you, you can ignore this message — we won't add you without confirmation.",
    ignore: "No action needed if this wasn't you.",
  },
  NL: {
    subject: "Bevestig je inschrijving — YU.R Skin Solution",
    preheader: "Eén klik om je plek op de maandelijkse brief te bevestigen.",
    greeting: "Hallo,",
    lede:
      "Bedankt voor je inschrijving op de YU.R-brief. Bevestig je e-mailadres zodat we weten dat we het juiste postvak hebben.",
    cta: "Inschrijving bevestigen",
    alt: "Werkt de knop niet? Kopieer dan deze link naar je browser:",
    signoff: "— Het YU.R-team",
    footer:
      "Je ontvangt deze e-mail omdat iemand dit adres heeft ingevoerd op yurskinsolution.eu. Als dat niet jij was, kun je dit bericht negeren — we voegen je pas toe na bevestiging.",
    ignore: "Was jij dit niet? Dan hoef je niets te doen.",
  },
  FR: {
    subject: "Confirmez votre inscription — YU.R Skin Solution",
    preheader: "Un clic pour confirmer votre place dans la lettre mensuelle.",
    greeting: "Bonjour,",
    lede:
      "Merci de vous être inscrit·e à la lettre YU.R. Veuillez confirmer votre adresse pour que nous sachions que c'est bien la bonne.",
    cta: "Confirmer mon inscription",
    alt: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    signoff: "— L'équipe YU.R",
    footer:
      "Vous recevez cet e-mail parce que quelqu'un a saisi cette adresse sur yurskinsolution.eu. Si ce n'était pas vous, vous pouvez ignorer ce message — nous ne vous ajouterons pas sans confirmation.",
    ignore: "Si ce n'était pas vous, aucune action n'est nécessaire.",
  },
  RU: {
    subject: "Подтвердите подписку — YU.R Skin Solution",
    preheader: "Один клик, чтобы подтвердить подписку на ежемесячное письмо.",
    greeting: "Здравствуйте,",
    lede:
      "Спасибо за подписку на письмо YU.R. Подтвердите, пожалуйста, ваш адрес, чтобы мы были уверены, что это нужный ящик.",
    cta: "Подтвердить подписку",
    alt: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
    signoff: "— Команда YU.R",
    footer:
      "Вы получили это письмо, потому что кто-то ввёл этот адрес на yurskinsolution.eu. Если это были не вы — просто проигнорируйте его; без подтверждения мы не добавим вас в список.",
    ignore: "Если это были не вы, ничего делать не нужно.",
  },
};

// ────────── HTML builder ────────────────────────────────────────────────

export type ConfirmationEmailInput = {
  confirmUrl: string;
  locale: Locale;
};

/**
 * Build { subject, html, text } for the confirmation email.
 * Keep HTML inline-styled — most webmail clients still strip <style> blocks.
 */
export function buildConfirmationEmail(input: ConfirmationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const s = STRINGS[input.locale] ?? STRINGS.EN;
  const url = input.confirmUrl;

  const html = /* html */ `<!doctype html>
<html lang="${input.locale.toLowerCase()}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escape(s.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F3EDE3;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;">
    <!-- preheader (hidden, shows in inbox preview) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escape(s.preheader)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EDE3;">
      <tr>
        <td align="center" style="padding:48px 20px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FBF7EF;border:1px solid rgba(26,26,26,0.08);">
            <tr>
              <td style="padding:40px 44px 32px 44px;">

                <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
                  YU.R &nbsp;·&nbsp; 유알
                </div>

                <h1 style="margin:28px 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:24px;line-height:1.25;color:#1A1A1A;">
                  ${escape(s.greeting)}
                </h1>

                <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
                  ${escape(s.lede)}
                </p>

                <!-- CTA button (table-based for Outlook) -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
                  <tr>
                    <td style="background:#1A1A1A;">
                      <a href="${url}"
                         style="display:inline-block;padding:14px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#FBF7EF;text-decoration:none;">
                        ${escape(s.cta)}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#8A8A8A;">
                  ${escape(s.alt)}
                </p>
                <p style="margin:0 0 32px 0;font-size:12px;line-height:1.6;word-break:break-all;">
                  <a href="${url}" style="color:#C8503A;text-decoration:underline;">${url}</a>
                </p>

                <p style="margin:0 0 6px 0;font-size:14px;color:#1A1A1A;">
                  ${escape(s.signoff)}
                </p>

                <hr style="border:none;border-top:1px solid rgba(26,26,26,0.08);margin:32px 0 20px 0;" />

                <p style="margin:0;font-size:11px;line-height:1.6;color:#8A8A8A;">
                  ${escape(s.footer)}
                </p>

              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            K'Elmus Group BV &nbsp;·&nbsp; Brussels, Belgium
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    s.greeting,
    "",
    s.lede,
    "",
    `${s.cta}: ${url}`,
    "",
    s.signoff,
    "",
    "—",
    s.footer,
  ].join("\n");

  return { subject: s.subject, html, text };
}

// Tiny HTML escape — we don't trust our own strings absolutely, and users
// can't inject here anyway, but it keeps the template safe as it grows.
function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
