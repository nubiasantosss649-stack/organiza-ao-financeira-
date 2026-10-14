import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CreditCard, Sparkles } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SubscriptionButton } from "./buttons";
import { cancelSubscription, reactivateSubscription, startCheckout, startTrial } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { billingEnabled } from "@/lib/billing";
import { getMySubscription, hasPaidAccess, SUBSCRIPTION_STATUS_LABELS } from "@/lib/subscription";
import { formatBRL } from "@/lib/money";

export const metadata: Metadata = { title: "Minha assinatura" };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

const PAYMENT_LABELS: Record<string, { label: string; tone: "money" | "danger" | "warning" | "neutral" }> = {
  approved: { label: "Aprovado", tone: "money" },
  rejected: { label: "Recusado", tone: "danger" },
  pending: { label: "Em processamento", tone: "warning" },
  refunded: { label: "Estornado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export default async function SubscriptionPage({ searchParams }: PageProps<"/app/assinatura">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [sub, { data: price }, { data: trialCfg }, { data: payments }, { data: events }, { data: anySubs }] = await Promise.all([
    getMySubscription(),
    supabase.rpc("current_price", { p_plan: "pro" }),
    supabase.from("app_settings").select("value").eq("key", "pro_trial").maybeSingle(),
    supabase.from("billing_payments").select("id, amount_cents, status, status_detail, paid_at, period_end, created_at").order("created_at", { ascending: false }).limit(24),
    supabase.from("subscription_events").select("id, event_type, from_status, to_status, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("subscriptions").select("id, provider, status").limit(50),
  ]);
  const p = price as { price_cents: number; regular_price_cents: number; promotion_name: string | null; ends_at: string | null } | null;
  const trial = (trialCfg?.value ?? { enabled: false, days: 7 }) as { enabled: boolean; days: number };
  const trialEligible = trial.enabled && !(anySubs ?? []).some((s) => s.provider === "trial" || s.status !== "pending");
  const enabled = billingEnabled();
  const access = hasPaidAccess(sub);
  const isTrial = sub?.provider === "trial";
  const renewing = sub && ["active", "past_due"].includes(sub.status) && !isTrial;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Minha assinatura" description="Plano, cobranças e cancelamento — tudo em um só lugar." />
      {sp.teste ? <Alert tone="success">Seu teste gratuito do Pro começou. Não há cobrança automática ao final.</Alert> : null}

      <Card>
        {sub && (access || sub.status === "pending") ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{isTrial ? "Teste do Controle Fácil Pro" : "Controle Fácil Pro"}</h2>
              <Badge tone={sub.status === "active" || sub.status === "trialing" ? "money" : sub.status === "past_due" ? "danger" : "warning"}>
                {SUBSCRIPTION_STATUS_LABELS[sub.status]}
              </Badge>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {!isTrial ? <div><dt className="text-xs text-slate-500">Valor</dt><dd className="tabular font-semibold">{sub.price_cents ? `${formatBRL(sub.price_cents)}/mês` : "—"}</dd></div> : null}
              <div><dt className="text-xs text-slate-500">Acesso Pro até</dt><dd className="font-semibold">{fmtDate(sub.current_period_end)}</dd></div>
              {renewing ? <div><dt className="text-xs text-slate-500">Próxima cobrança</dt><dd className="font-semibold">{fmtDate(sub.next_charge_at ?? sub.current_period_end)}</dd></div> : null}
            </dl>
            {sub.status === "pending" ? (
              <Alert tone="info">
                Estamos aguardando a confirmação do pagamento pelo Mercado Pago. O Pro é liberado automaticamente assim que o pagamento for aprovado.
              </Alert>
            ) : null}
            {sub.status === "past_due" ? (
              <Alert tone="warning">
                A última cobrança foi recusada. O Mercado Pago tentará novamente; confira o cartão cadastrado. Seu acesso continua até {fmtDate(sub.current_period_end)}.
              </Alert>
            ) : null}
            {sub.status === "canceled" ? (
              <Alert tone="info">
                Assinatura cancelada em {fmtDate(sub.canceled_at)}. Você mantém o Pro até {fmtDate(sub.current_period_end)}; depois sua conta volta ao plano Grátis
                sem perder nenhum dado.
              </Alert>
            ) : null}
            {isTrial ? (
              <Alert tone="info">O teste termina em {fmtDate(sub.current_period_end)} e não gera cobrança. Para continuar com o Pro depois, assine quando quiser.</Alert>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-1">
              {["active", "past_due", "paused", "pending"].includes(sub.status) && !isTrial ? (
                <SubscriptionButton
                  action={cancelSubscription}
                  label="Cancelar assinatura"
                  pendingLabel="Cancelando…"
                  variant="secondary"
                  confirmMessage={`Cancelar a assinatura? Não haverá novas cobranças e você continua com o Pro até ${fmtDate(sub.current_period_end)}.`}
                />
              ) : null}
              {(sub.status === "canceled" || sub.status === "paused" || isTrial) && enabled ? (
                <SubscriptionButton action={reactivateSubscription} label={sub.status === "paused" ? "Reativar assinatura" : `Assinar por ${formatBRL(p?.price_cents ?? 0)}/mês`} pendingLabel="Abrindo pagamento…" />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-money-500 p-2.5 text-white"><Sparkles className="h-5 w-5" aria-hidden /></span>
              <div>
                <h2 className="text-lg font-bold">Controle Fácil Pro</h2>
                <p className="text-sm text-slate-600">Você está no plano Grátis. <Link href="/app/planos" className="font-semibold text-navy-600 underline">Comparar planos</Link></p>
              </div>
            </div>
            {p ? (
              <div>
                {p.promotion_name && p.ends_at ? (
                  <p className="text-sm">
                    <Badge tone="money">{p.promotion_name}</Badge>{" "}
                    <span className="text-slate-500 line-through">{formatBRL(p.regular_price_cents)}</span>{" "}
                    válida até {fmtDate(p.ends_at)}
                  </p>
                ) : null}
                <p className="mt-1"><span className="tabular text-3xl font-extrabold">{formatBRL(p.price_cents)}</span><span className="text-slate-500">/mês</span></p>
              </div>
            ) : null}
            <ul className="space-y-1.5 text-sm">
              {["Cobrança mensal recorrente no cartão, pelo Mercado Pago", "Cancele quando quiser, aqui mesmo", "Ao cancelar, o Pro continua até o fim do período pago", "Seus dados nunca são apagados se você voltar ao Grátis"].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-money-600" aria-hidden />{t}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              {enabled ? (
                <SubscriptionButton action={startCheckout} label={`Assinar por ${formatBRL(p?.price_cents ?? 0)}/mês`} pendingLabel="Abrindo pagamento seguro…" />
              ) : (
                <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">A assinatura estará disponível em breve. Nenhuma cobrança é feita até lá.</p>
              )}
              {trialEligible ? (
                <SubscriptionButton action={startTrial} label={`Testar o Pro grátis por ${trial.days} dias`} pendingLabel="Iniciando…" variant="secondary" />
              ) : null}
            </div>
            {trialEligible ? <p className="text-xs text-slate-500">O teste não pede cartão e não vira cobrança automaticamente.</p> : null}
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><CreditCard className="h-3.5 w-3.5" aria-hidden /> O pagamento é feito no ambiente seguro do Mercado Pago. O Controle Fácil não recebe os dados do seu cartão.</p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Histórico de cobranças" />
        {payments?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {payments.map((pay) => {
              const l = PAYMENT_LABELS[pay.status] ?? { label: pay.status, tone: "neutral" as const };
              return (
                <li key={pay.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>{fmtDate(pay.paid_at ?? pay.created_at)}{pay.period_end ? <span className="block text-xs text-slate-500">Período pago até {fmtDate(pay.period_end)}</span> : null}</span>
                  <span className="flex items-center gap-2"><span className="tabular font-semibold">{formatBRL(pay.amount_cents)}</span><Badge tone={l.tone}>{l.label}</Badge></span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma cobrança registrada.</p>
        )}
      </Card>

      {events?.length ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold">Histórico de alterações</summary>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 py-2">
                  <span>{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                  <span className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  checkout_started: "Pagamento iniciado",
  status_changed: "Status atualizado",
  payment_approved: "Pagamento aprovado",
  payment_rejected: "Pagamento recusado",
  payment_refunded: "Pagamento estornado",
  cancel_requested: "Cancelamento solicitado",
  reactivated: "Assinatura reativada",
  trial_started: "Teste gratuito iniciado",
  period_extended: "Período estendido",
};
