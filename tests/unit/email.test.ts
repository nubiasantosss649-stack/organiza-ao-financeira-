import { describe, expect, it } from "vitest";
import { escapeHtml, formatDateBR, renderEmail } from "@/lib/email/templates";
import { processOutbox, type OutboxDeps } from "@/lib/email/outbox";

const ctx = { name: "Maria <b>Silva</b>", siteUrl: "https://controlefacil.app", supportEmail: "suporte@controlefacil.app" };

describe("templates de e-mail de cobrança", () => {
  it("recibo traz valor, período e link da assinatura, sem HTML injetado", () => {
    const m = renderEmail("payment_receipt", { amount_cents: 1990, period_end: "2026-11-14T12:00:00Z", paid_at: "2026-10-14T12:00:00Z" }, ctx);
    expect(m.subject).toBe("Pagamento confirmado — Controle Fácil Pro");
    expect(m.text).toContain("R$ 19,90");
    expect(m.text).toContain("14/11/2026");
    expect(m.html).toContain("https://controlefacil.app/app/assinatura");
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain("Olá, Maria");
  });

  it("falha de pagamento informa até quando o acesso continua", () => {
    const m = renderEmail("payment_failed", { amount_cents: 1990, access_until: "2026-10-20T03:00:00Z" }, ctx);
    expect(m.subject).toBe("Não conseguimos processar seu pagamento");
    expect(m.text).toContain("20/10/2026");
  });

  it("cancelamento informa que os dados são mantidos", () => {
    const m = renderEmail("subscription_canceled", { access_until: "2026-11-14T12:00:00Z" }, { ...ctx, name: null });
    expect(m.subject).toBe("Sua assinatura foi cancelada");
    expect(m.text).toContain("14/11/2026");
    expect(m.html).toContain("Olá!");
  });

  it("valores inválidos no payload não quebram o e-mail", () => {
    const m = renderEmail("payment_receipt", { amount_cents: "abc", period_end: "x" }, ctx);
    expect(m.text).not.toContain("NaN");
    expect(m.text).not.toContain("Invalid");
  });

  it("escapeHtml e formatDateBR", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(formatDateBR("2026-01-01T02:00:00Z")).toBe("31/12/2025");
    expect(formatDateBR(null)).toBeNull();
  });
});

function fakeDeps(over: Partial<OutboxDeps> = {}) {
  const marks: Array<[number, string, string | null]> = [];
  const sent: string[] = [];
  const deps: OutboxDeps = {
    claim: async () => [
      { id: 1, user_id: "u1", kind: "payment_receipt", payload: { amount_cents: 1990 } },
      { id: 2, user_id: "u2", kind: "payment_failed", payload: {} },
      { id: 3, user_id: "u3", kind: "subscription_canceled", payload: {} },
    ],
    mark: async (id, status, error) => { marks.push([id, status, error]); },
    recipient: async (u) => {
      if (u === "u2") return { email: null, name: null };
      if (u === "u3") throw new Error("auth down");
      return { email: "maria@example.com", name: "Maria" };
    },
    send: async (m) => { sent.push(m.to); },
    siteUrl: ctx.siteUrl,
    supportEmail: ctx.supportEmail,
    ...over,
  };
  return { deps, marks, sent };
}

describe("fila de e-mails", () => {
  it("envia, pula quem não tem e-mail e reagenda falha de consulta", async () => {
    const { deps, marks, sent } = fakeDeps();
    expect(await processOutbox(deps)).toEqual({ sent: 1, skipped: 1, retried: 1 });
    expect(sent).toEqual(["maria@example.com"]);
    expect(marks).toEqual([[1, "sent", null], [2, "skipped", "no_email"], [3, "retry", "recipient_lookup_failed"]]);
  });

  it("falha de SMTP volta para a fila registrando só o código do erro", async () => {
    const { deps, marks } = fakeDeps({
      claim: async () => [{ id: 9, user_id: "u1", kind: "payment_receipt", payload: {} }],
      send: async () => { throw Object.assign(new Error("connect ECONNREFUSED maria@example.com"), { code: "ECONNECTION" }); },
    });
    expect(await processOutbox(deps)).toEqual({ sent: 0, skipped: 0, retried: 1 });
    expect(marks).toEqual([[9, "retry", "ECONNECTION"]]);
  });
});
