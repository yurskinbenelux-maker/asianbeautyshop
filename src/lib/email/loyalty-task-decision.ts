// ─────────────────────────────────────────────────────────────────────────
// Email — task approved / rejected.
//
// Fires from the admin review action. Localised EN / NL / FR / RU. We
// keep the copy short — it's a transactional nudge, not a newsletter.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";

type Strings = {
  approved: {
    subject: (taskTitle: string) => string;
    preheader: string;
    heading: (firstName: string | null) => string;
    body: (taskTitle: string, points: number) => string;
    cta: string;
  };
  rejected: {
    subject: (taskTitle: string) => string;
    preheader: string;
    heading: (firstName: string | null) => string;
    body: (taskTitle: string, reason: string) => string;
    cta: string;
  };
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    approved: {
      subject: (t) => `Approved — ${t}`,
      preheader: "Points just landed in your account.",
      heading: (f) => (f ? `Done, ${f}.` : "Done."),
      body: (t, p) =>
        `We've added ${p} points to your account for "${t}". They're in your balance now — open the A-Beauty Club drawer to spend or save them.`,
      cta: "Open my account",
    },
    rejected: {
      subject: (t) => `Update on ${t}`,
      preheader: "A quick note about your submission.",
      heading: (f) => (f ? `${f},` : "Hello,"),
      body: (t, reason) =>
        `Thank you for submitting "${t}". This time it didn't quite meet the brief: ${reason} You're welcome to try again — same task, fresh submission.`,
      cta: "Try again",
    },
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    approved: {
      subject: (t) => `Goedgekeurd — ${t}`,
      preheader: "Punten staan op je rekening.",
      heading: (f) => (f ? `Gedaan, ${f}.` : "Gedaan."),
      body: (t, p) =>
        `We hebben ${p} punten op je account gezet voor "${t}". Ze staan nu in je saldo — open de A-Beauty Club lade om ze in te wisselen of te bewaren.`,
      cta: "Open mijn account",
    },
    rejected: {
      subject: (t) => `Update over ${t}`,
      preheader: "Een korte notitie over je inzending.",
      heading: (f) => (f ? `${f},` : "Hallo,"),
      body: (t, reason) =>
        `Bedankt voor je inzending van "${t}". Deze keer voldeed het net niet: ${reason} Je mag het gerust opnieuw proberen — zelfde taak, nieuwe inzending.`,
      cta: "Opnieuw proberen",
    },
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    approved: {
      subject: (t) => `Validé — ${t}`,
      preheader: "Vos points sont arrivés.",
      heading: (f) => (f ? `Voilà, ${f}.` : "Voilà."),
      body: (t, p) =>
        `Nous avons crédité ${p} points sur votre compte pour "${t}". Ils sont disponibles dès maintenant — ouvrez le tiroir A-Beauty Club pour les utiliser ou les garder.`,
      cta: "Ouvrir mon compte",
    },
    rejected: {
      subject: (t) => `Au sujet de ${t}`,
      preheader: "Un mot rapide sur votre soumission.",
      heading: (f) => (f ? `${f},` : "Bonjour,"),
      body: (t, reason) =>
        `Merci pour votre soumission "${t}". Cette fois, elle ne correspondait pas tout à fait : ${reason} N'hésitez pas à recommencer — même tâche, nouvelle soumission.`,
      cta: "Réessayer",
    },
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    approved: {
      subject: (t) => `Одобрено — ${t}`,
      preheader: "Баллы уже на вашем счёте.",
      heading: (f) => (f ? `Готово, ${f}.` : "Готово."),
      body: (t, p) =>
        `Мы добавили ${p} баллов на ваш счёт за «${t}». Они уже в балансе — откройте окно A-Beauty Club, чтобы потратить или сохранить.`,
      cta: "Открыть аккаунт",
    },
    rejected: {
      subject: (t) => `Обновление по «${t}»`,
      preheader: "Краткая заметка о вашей заявке.",
      heading: (f) => (f ? `${f},` : "Здравствуйте,"),
      body: (t, reason) =>
        `Спасибо за заявку на «${t}». В этот раз она не совсем подошла: ${reason} Можно попробовать снова — та же задача, новая заявка.`,
      cta: "Попробовать снова",
    },
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type LoyaltyTaskDecisionPayload = {
  email: string;
  firstName: string | null;
  locale: Locale;
  taskTitle: string;
  decision: "approved" | "rejected";
  pointsAwarded?: number;
  /** Required when decision === "rejected". Free-text from the admin. */
  reason?: string;
};

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendLoyaltyTaskDecisionEmail(
  payload: LoyaltyTaskDecisionPayload,
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const accountUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/account`;

  const isApproved = payload.decision === "approved";
  const subject = isApproved
    ? s.approved.subject(payload.taskTitle)
    : s.rejected.subject(payload.taskTitle);
  const preheader = isApproved ? s.approved.preheader : s.rejected.preheader;
  const heading = isApproved
    ? s.approved.heading(payload.firstName)
    : s.rejected.heading(payload.firstName);
  const body = isApproved
    ? s.approved.body(payload.taskTitle, payload.pointsAwarded ?? 0)
    : s.rejected.body(payload.taskTitle, payload.reason ?? "");
  const ctaLabel = isApproved ? s.approved.cta : s.rejected.cta;

  const html = renderEmailShell({
    title: subject,
    preheader,
    lang: payload.locale.toLowerCase(),
    body: `
      <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#121110;font-weight:400;">
        ${esc(heading)}
      </h1>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
        ${esc(body)}
      </p>
      ${renderCtaButton(accountUrl, ctaLabel)}
      <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
        ${esc(s.signoff)}
      </p>
    `,
    footerNote: s.footer,
  });

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject,
      html,
      tags: [
        { name: "type", value: "loyalty-task-decision" },
        { name: "decision", value: payload.decision },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/loyalty-task-decision] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}
