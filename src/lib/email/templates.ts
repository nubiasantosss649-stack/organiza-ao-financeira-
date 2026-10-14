import { formatBRL } from "@/lib/money";

/** E-mails transacionais de cobrança — sem dados de cartão, apenas valores, datas e links. */
export type EmailKind = "payment_receipt" | "payment_failed" | "subscription_canceled";

export interface EmailContext {
  name: string | null;
  siteUrl: string;
  supportEmail: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function formatDateBR(iso: unknown): string | null {
  if (typeof iso !== "string" || !iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function cents(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? formatBRL(n) : null;
}

function firstName(name: string | null): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n ? n.slice(0, 40) : "";
}

interface Block {
  title: string;
  intro: string;
  rows: Array<[string, string]>;
  paragraphs: string[];
  cta: { label: string; href: string };
}

function layout(subject: string, b: Block, ctx: EmailContext): RenderedEmail {
  const hello = firstName(ctx.name) ? `Olá, ${firstName(ctx.name)}!` : "Olá!";
  const rowsHtml = b.rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0b1f3a">${escapeHtml(v)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#0b1f3a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0b1f3a;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:800">CONTROLE <span style="color:#34c48b">FÁCIL</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(b.title)}</h1>
<p style="margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(b.intro)}</p>
${b.rows.length ? `<table role="presentation" width="100%" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 16px;font-size:14px">${rowsHtml}</table>` : ""}
${b.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5;font-size:14px">${escapeHtml(p)}</p>`).join("")}
<p style="margin:20px 0"><a href="${escapeHtml(b.cta.href)}" style="display:inline-block;background:#12a26e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">${escapeHtml(b.cta.label)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#64748b;line-height:1.5">Dúvidas? Responda para ${escapeHtml(ctx.supportEmail)}. Este é um e-mail automático sobre a sua assinatura e não é nota fiscal.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    "CONTROLE FÁCIL",
    "",
    b.title,
    "",
    hello,
    b.intro,
    "",
    ...b.rows.map(([k, v]) => `${k}: ${v}`),
    ...(b.rows.length ? [""] : []),
    ...b.paragraphs,
    "",
    `${b.cta.label}: ${b.cta.href}`,
    "",
    `Dúvidas? Escreva para ${ctx.supportEmail}. Este é um e-mail automático sobre a sua assinatura e não é nota fiscal.`,
  ].join("\n");
  return { subject, html, text };
}

export function renderEmail(kind: EmailKind, payload: Record<string, unknown>, ctx: EmailContext): RenderedEmail {
  const manage = `${ctx.siteUrl}/app/assinatura`;
  switch (kind) {
    case "payment_receipt": {
      const amount = cents(payload.amount_cents);
      const paidAt = formatDateBR(payload.paid_at);
      const until = formatDateBR(payload.period_end);
      return layout("Pagamento confirmado — Controle Fácil Pro", {
        title: "Pagamento confirmado",
        intro: "Recebemos o pagamento da sua assinatura do Controle Fácil Pro. Obrigado!",
        rows: [
          ...(amount ? [["Valor", amount] as [string, string]] : []),
          ...(paidAt ? [["Data", paidAt] as [string, string]] : []),
          ...(until ? [["Pro garantido até", until] as [string, string]] : []),
        ],
        paragraphs: ["Você pode ver o histórico de cobranças e cancelar quando quiser na página da sua assinatura."],
        cta: { label: "Ver minha assinatura", href: manage },
      }, ctx);
    }
    case "payment_failed": {
      const amount = cents(payload.amount_cents);
      const until = formatDateBR(payload.access_until);
      return layout("Não conseguimos processar seu pagamento", {
        title: "Pagamento não aprovado",
        intro: "A cobrança da sua assinatura do Controle Fácil Pro não foi aprovada pela operadora do cartão.",
        rows: [
          ...(amount ? [["Valor", amount] as [string, string]] : []),
          ...(until ? [["Seu acesso Pro continua até", until] as [string, string]] : []),
        ],
        paragraphs: [
          "O Mercado Pago tentará a cobrança novamente nos próximos dias. Confira se o cartão está válido e com limite disponível.",
          "Se preferir, você pode cancelar a assinatura a qualquer momento. Seus dados continuam salvos no plano Grátis.",
        ],
        cta: { label: "Ver minha assinatura", href: manage },
      }, ctx);
    }
    case "subscription_canceled": {
      const until = formatDateBR(payload.access_until);
      return layout("Sua assinatura foi cancelada", {
        title: "Assinatura cancelada",
        intro: "Confirmamos o cancelamento da sua assinatura do Controle Fácil Pro. Não haverá novas cobranças.",
        rows: until ? [["Você continua com o Pro até", until]] : [],
        paragraphs: [
          "Depois dessa data, sua conta volta para o plano Grátis. Nenhum dado é apagado: tudo o que você registrou continua disponível.",
          "Se mudar de ideia, é só assinar novamente pela página da assinatura.",
        ],
        cta: { label: "Ver minha assinatura", href: manage },
      }, ctx);
    }
  }
}
