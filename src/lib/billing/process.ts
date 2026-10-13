import type { BillingProvider } from "./types";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ProcessResult = { status: "processed" | "ignored"; detail: string };

/** Tópicos aceitos (nomes usados pelo Mercado Pago nas notificações de assinaturas). */
export function normalizeTopic(raw: string | null): "subscription" | "payment" | null {
  if (!raw) return null;
  if (raw === "subscription_preapproval" || raw === "preapproval") return "subscription";
  if (raw === "subscription_authorized_payment" || raw === "authorized_payment") return "payment";
  return null;
}

/**
 * Processa uma notificação: NUNCA confia no conteúdo recebido — consulta o
 * recurso diretamente no provedor e aplica no banco com funções idempotentes.
 */
export async function processNotification(
  topicRaw: string | null,
  resourceId: string,
  provider: BillingProvider,
  rpc: Rpc,
  now: () => Date = () => new Date(),
): Promise<ProcessResult> {
  const topic = normalizeTopic(topicRaw);
  if (!topic) return { status: "ignored", detail: "topic" };

  if (topic === "subscription") {
    const sub = await provider.getSubscription(resourceId);
    const { data, error } = await rpc("billing_apply_subscription_status", {
      p_provider: provider.id,
      p_provider_subscription_id: sub.id,
      p_status: sub.status,
      p_provider_status: sub.providerStatus.slice(0, 40),
      p_next_charge_at: sub.nextChargeAt,
    });
    if (error) throw new Error(`DB:${error.message}`);
    const r = data as { applied: boolean; reason?: string };
    return r.applied ? { status: "processed", detail: `subscription:${sub.status}` } : { status: "ignored", detail: r.reason ?? "unchanged" };
  }

  const payment = await provider.getPayment(resourceId);
  // Período pago: 1 mês a partir da data do pagamento aprovado.
  let periodEnd: string | null = null;
  if (payment.status === "approved") {
    const paid = payment.paidAt ? new Date(payment.paidAt) : now();
    const end = new Date(paid);
    end.setUTCMonth(end.getUTCMonth() + 1);
    if (end.getUTCDate() !== paid.getUTCDate()) end.setUTCDate(0); // 31/01 → 28/02
    periodEnd = end.toISOString();
  }
  const { data, error } = await rpc("billing_record_payment", {
    p_provider: provider.id,
    p_provider_subscription_id: payment.subscriptionId,
    p_provider_payment_id: payment.id,
    p_amount_cents: payment.amountCents,
    p_status: payment.status,
    p_status_detail: payment.statusDetail,
    p_paid_at: payment.paidAt,
    p_period_end: periodEnd,
  });
  if (error) throw new Error(`DB:${error.message}`);
  const r = data as { applied: boolean; reason?: string };
  return r.applied ? { status: "processed", detail: `payment:${payment.status}` } : { status: "ignored", detail: r.reason ?? "duplicate" };
}
