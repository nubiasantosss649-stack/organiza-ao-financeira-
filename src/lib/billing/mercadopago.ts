import type { BillingProvider, PaymentStatus, ProviderPayment, ProviderSubscription, SubscriptionStatus } from "./types";

/**
 * Adaptador do Mercado Pago — Assinaturas sem plano associado (API /preapproval)
 * com pagamento pendente: o cliente informa o cartão no checkout do Mercado Pago
 * (init_point). Nenhum dado de cartão passa pelo Controle Fácil.
 *
 * ATENÇÃO: implementado conforme a API pública de assinaturas do Mercado Pago;
 * deve ser validado no ambiente de testes antes de habilitar BILLING_ENABLED.
 */

export function mapPreapprovalStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "authorized":
      return "active";
    case "paused":
      return "paused";
    case "cancelled":
    case "canceled":
      return "canceled";
    default:
      return "pending";
  }
}

/** Status da cobrança recorrente (authorized_payment) e do pagamento vinculado. */
export function mapAuthorizedPaymentStatus(apStatus: string, paymentStatus: string | null): PaymentStatus {
  switch (paymentStatus) {
    case "approved":
      return "approved";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
  }
  if (apStatus === "recycling") return "rejected"; // falhou e o Mercado Pago vai tentar de novo
  if (apStatus === "cancelled") return "cancelled";
  return "pending";
}

/** Converte valor decimal da API (19.9) em centavos sem erro de ponto flutuante. */
export function toCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const s = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return Number(i) * 100 + Number(f.padEnd(2, "0"));
}

export function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

type Fetch = typeof fetch;

export class MercadoPagoProvider implements BillingProvider {
  readonly id = "mercadopago";
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = "https://api.mercadopago.com",
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Não registra o corpo (pode conter dados do pagador).
      throw new Error(`MERCADOPAGO_HTTP_${res.status}`);
    }
    return (await res.json()) as T;
  }

  private toSubscription(p: Record<string, unknown>): ProviderSubscription {
    const auto = (p.auto_recurring ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id),
      status: mapPreapprovalStatus(String(p.status ?? "")),
      providerStatus: String(p.status ?? ""),
      externalReference: typeof p.external_reference === "string" ? p.external_reference : null,
      nextChargeAt: typeof p.next_payment_date === "string" ? p.next_payment_date : null,
      amountCents: toCents(auto.transaction_amount),
      checkoutUrl: typeof p.init_point === "string" ? p.init_point : null,
    };
  }

  async createSubscription(input: { userId: string; payerEmail: string; reason: string; amountCents: number; backUrl: string }) {
    const body = {
      reason: input.reason,
      external_reference: input.userId,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: fromCents(input.amountCents),
        currency_id: "BRL",
      },
    };
    const p = await this.request<Record<string, unknown>>("POST", "/preapproval", body, `checkout-${input.userId}-${Date.now()}`);
    return this.toSubscription(p);
  }

  async getSubscription(id: string) {
    return this.toSubscription(await this.request<Record<string, unknown>>("GET", `/preapproval/${encodeURIComponent(id)}`));
  }

  async setSubscriptionStatus(id: string, status: "paused" | "canceled" | "active") {
    const mpStatus = status === "canceled" ? "cancelled" : status === "active" ? "authorized" : "paused";
    const p = await this.request<Record<string, unknown>>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: mpStatus });
    return this.toSubscription(p);
  }

  /** Cobrança recorrente de uma assinatura (tópico subscription_authorized_payment). */
  async getPayment(id: string): Promise<ProviderPayment> {
    const ap = await this.request<Record<string, unknown>>("GET", `/authorized_payments/${encodeURIComponent(id)}`);
    const payment = (ap.payment ?? {}) as Record<string, unknown>;
    const status = mapAuthorizedPaymentStatus(String(ap.status ?? ""), typeof payment.status === "string" ? payment.status : null);
    return {
      id: String(ap.id),
      subscriptionId: String(ap.preapproval_id),
      status,
      statusDetail: typeof payment.status_detail === "string" ? payment.status_detail.slice(0, 80) : null,
      amountCents: toCents(ap.transaction_amount) ?? 0,
      paidAt: status === "approved" ? (typeof ap.last_modified === "string" ? ap.last_modified : typeof ap.date_created === "string" ? ap.date_created : null) : null,
    };
  }
}
