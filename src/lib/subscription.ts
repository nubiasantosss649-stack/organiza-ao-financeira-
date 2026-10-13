import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing";

export interface SubscriptionRow {
  id: string;
  plan_id: string;
  provider: string;
  provider_subscription_id: string | null;
  status: "pending" | "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired";
  started_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  next_charge_at: string | null;
  price_cents: number | null;
  created_at: string;
}

/** Assinatura mais relevante do usuário logado (em andamento ou a última). */
export async function getMySubscription(): Promise<SubscriptionRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("id, plan_id, provider, provider_subscription_id, status, started_at, current_period_end, canceled_at, next_charge_at, price_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as SubscriptionRow[];
  const open = rows.find((r) => ["active", "past_due", "paused", "pending", "trialing"].includes(r.status) &&
    (r.status === "pending" || !r.current_period_end || new Date(r.current_period_end) > new Date()));
  return open ?? rows.find((r) => r.status !== "expired") ?? null;
}

export function hasPaidAccess(s: SubscriptionRow | null): boolean {
  return Boolean(s?.current_period_end && new Date(s.current_period_end) > new Date() && s.status !== "pending");
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionRow["status"], string> = {
  pending: "Aguardando confirmação do pagamento",
  trialing: "Teste gratuito",
  active: "Ativa",
  past_due: "Pagamento recusado — tentando novamente",
  paused: "Pausada",
  canceled: "Cancelada",
  expired: "Encerrada",
};

/** Atualiza o status da assinatura consultando o provedor (sem revalidar páginas). */
export async function syncSubscriptionFromProvider(): Promise<{ ok?: boolean; error?: string }> {
  const sub = await getMySubscription();
  if (!sub?.provider_subscription_id || sub.provider === "trial" || !process.env.MERCADOPAGO_ACCESS_TOKEN) return { ok: true };
  try {
    const provider = getBillingProvider();
    const remote = await provider.getSubscription(sub.provider_subscription_id);
    await createAdminClient().rpc("billing_apply_subscription_status", {
      p_provider: provider.id, p_provider_subscription_id: remote.id, p_status: remote.status,
      p_provider_status: remote.providerStatus.slice(0, 40), p_next_charge_at: remote.nextChargeAt,
    });
    return { ok: true };
  } catch {
    return { error: "Não foi possível consultar o pagamento agora." };
  }
}
