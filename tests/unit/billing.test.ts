import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildManifest, parseSignatureHeader, verifyWebhookSignature } from "@/lib/billing/signature";
import { MercadoPagoProvider, fromCents, mapAuthorizedPaymentStatus, mapPreapprovalStatus, toCents } from "@/lib/billing/mercadopago";
import { normalizeTopic, processNotification } from "@/lib/billing/process";
import type { BillingProvider } from "@/lib/billing/types";

const SECRET = "segredo-de-teste";
function sign(dataId: string, requestId: string, ts = "1760000000") {
  const v1 = createHmac("sha256", SECRET).update(buildManifest(dataId, requestId, ts)).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("assinatura do webhook", () => {
  it("monta o manifesto no formato id;request-id;ts e minúsculas para ids alfanuméricos", () => {
    expect(buildManifest("ABC123", "req-1", "99")).toBe("id:abc123;request-id:req-1;ts:99;");
    expect(buildManifest("2c938084-a", "r", "1")).toBe("id:2c938084-a;request-id:r;ts:1;");
  });
  it("aceita assinatura válida", () => {
    expect(verifyWebhookSignature({ signatureHeader: sign("123", "req-1"), requestId: "req-1", dataId: "123", secret: SECRET })).toBe(true);
  });
  it("rejeita assinatura de outro recurso, outra chave, cabeçalho ausente ou malformado", () => {
    const header = sign("123", "req-1");
    expect(verifyWebhookSignature({ signatureHeader: header, requestId: "req-1", dataId: "999", secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: header, requestId: "req-2", dataId: "123", secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: header, requestId: "req-1", dataId: "123", secret: "outra" })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: null, requestId: "req-1", dataId: "123", secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: "ts=1,v1=zz", requestId: "req-1", dataId: "123", secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: header, requestId: "req-1", dataId: "123", secret: "" })).toBe(false);
  });
  it("lê o cabeçalho com espaços", () => {
    expect(parseSignatureHeader(` ts=5 , v1=${"a".repeat(64)}`)).toEqual({ ts: "5", v1: "a".repeat(64) });
  });
});

describe("mapeamento de status do Mercado Pago", () => {
  it("assinatura", () => {
    expect(mapPreapprovalStatus("authorized")).toBe("active");
    expect(mapPreapprovalStatus("paused")).toBe("paused");
    expect(mapPreapprovalStatus("cancelled")).toBe("canceled");
    expect(mapPreapprovalStatus("pending")).toBe("pending");
    expect(mapPreapprovalStatus("qualquer")).toBe("pending");
  });
  it("cobrança", () => {
    expect(mapAuthorizedPaymentStatus("processed", "approved")).toBe("approved");
    expect(mapAuthorizedPaymentStatus("recycling", "rejected")).toBe("rejected");
    expect(mapAuthorizedPaymentStatus("recycling", null)).toBe("rejected");
    expect(mapAuthorizedPaymentStatus("scheduled", null)).toBe("pending");
    expect(mapAuthorizedPaymentStatus("processed", "refunded")).toBe("refunded");
    expect(mapAuthorizedPaymentStatus("processed", "charged_back")).toBe("refunded");
  });
  it("converte valores sem ponto flutuante", () => {
    expect(toCents(19.9)).toBe(1990);
    expect(toCents("19.90")).toBe(1990);
    expect(toCents(14)).toBe(1400);
    expect(toCents("abc")).toBeNull();
    expect(fromCents(1990)).toBe(19.9);
  });
});

describe("adaptador Mercado Pago (HTTP simulado)", () => {
  it("cria assinatura mensal pendente em BRL com referência ao usuário", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "pre_1", status: "pending", init_point: "https://pagamento.exemplo/checkout", external_reference: "user-1",
      auto_recurring: { transaction_amount: 19.9 },
    }), { status: 201 }));
    const mp = new MercadoPagoProvider("TEST-token", "https://api.exemplo", fetchMock as unknown as typeof fetch);
    const sub = await mp.createSubscription({ userId: "user-1", payerEmail: "a@b.com", reason: "Pro", amountCents: 1990, backUrl: "https://app/ret" });
    expect(sub).toMatchObject({ id: "pre_1", status: "pending", checkoutUrl: "https://pagamento.exemplo/checkout", amountCents: 1990 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.exemplo/preapproval");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TEST-token");
    expect(JSON.parse(String(init.body))).toMatchObject({
      external_reference: "user-1", payer_email: "a@b.com", status: "pending", back_url: "https://app/ret",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 19.9, currency_id: "BRL" },
    });
  });
  it("erros HTTP não vazam o corpo da resposta", async () => {
    const mp = new MercadoPagoProvider("t", "https://x", (async () => new Response("{\"payer\":\"dados\"}", { status: 400 })) as unknown as typeof fetch);
    await expect(mp.getSubscription("1")).rejects.toThrow(/^MERCADOPAGO_HTTP_400$/);
  });
  it("lê cobrança recorrente", async () => {
    const mp = new MercadoPagoProvider("t", "https://x", (async () => new Response(JSON.stringify({
      id: 77, preapproval_id: "pre_1", status: "processed", transaction_amount: 19.9, last_modified: "2026-10-13T12:00:00.000-03:00",
      payment: { id: 5, status: "approved", status_detail: "accredited" },
    }))) as unknown as typeof fetch);
    expect(await mp.getPayment("77")).toEqual({
      id: "77", subscriptionId: "pre_1", status: "approved", statusDetail: "accredited", amountCents: 1990, paidAt: "2026-10-13T12:00:00.000-03:00",
    });
  });
});

describe("processamento de notificações", () => {
  const provider = (overrides: Partial<BillingProvider> = {}): BillingProvider => ({
    id: "mercadopago",
    createSubscription: vi.fn(),
    setSubscriptionStatus: vi.fn(),
    getSubscription: vi.fn(async (id: string) => ({ id, status: "active" as const, providerStatus: "authorized", externalReference: "u", nextChargeAt: "2026-11-13T00:00:00Z", amountCents: 1990, checkoutUrl: null })),
    getPayment: vi.fn(async (id: string) => ({ id, subscriptionId: "pre_1", status: "approved" as const, statusDetail: "accredited", amountCents: 1990, paidAt: "2026-01-31T15:00:00.000Z" })),
    ...overrides,
  });

  it("ignora tópicos desconhecidos sem consultar o provedor", async () => {
    const p = provider();
    expect(normalizeTopic("merchant_order")).toBeNull();
    expect(await processNotification("merchant_order", "1", p, vi.fn())).toEqual({ status: "ignored", detail: "topic" });
    expect(p.getPayment).not.toHaveBeenCalled();
  });

  it("assinatura: consulta o provedor e aplica o status (não confia no corpo da notificação)", async () => {
    const rpc = vi.fn(async () => ({ data: { applied: true }, error: null }));
    const r = await processNotification("subscription_preapproval", "pre_1", provider(), rpc);
    expect(r).toEqual({ status: "processed", detail: "subscription:active" });
    expect(rpc).toHaveBeenCalledWith("billing_apply_subscription_status", expect.objectContaining({ p_provider_subscription_id: "pre_1", p_status: "active" }));
  });

  it("pagamento aprovado registra período de 1 mês (31/01 → 28/02)", async () => {
    const rpc = vi.fn(async () => ({ data: { applied: true }, error: null }));
    await processNotification("subscription_authorized_payment", "77", provider(), rpc);
    expect(rpc).toHaveBeenCalledWith("billing_record_payment", expect.objectContaining({
      p_provider_payment_id: "77", p_status: "approved", p_amount_cents: 1990, p_period_end: "2026-02-28T15:00:00.000Z",
    }));
  });

  it("notificação repetida é tratada como duplicada; erro do banco é propagado para nova tentativa", async () => {
    const dup = vi.fn(async () => ({ data: { applied: false, reason: "duplicate" }, error: null }));
    expect(await processNotification("subscription_authorized_payment", "77", provider(), dup)).toEqual({ status: "ignored", detail: "duplicate" });
    const fail = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    await expect(processNotification("subscription_authorized_payment", "77", provider(), fail)).rejects.toThrow("DB:boom");
  });
});
