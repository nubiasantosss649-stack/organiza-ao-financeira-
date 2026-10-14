import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";
import { formatBRL } from "@/lib/money";

export const metadata: Metadata = { title: "Visão geral" };

interface Metrics {
  users_total: number;
  subscribers_active: number;
  trials_active: number;
  free_users: number;
  conversion_pct: number;
  new_users_month: number;
  revenue_confirmed_month_cents: number;
  mrr_projected_cents: number;
  payments_pending: number;
  payments_rejected_month: number;
  subscriptions_past_due: number;
  checkouts_pending: number;
  cancellations_month: number;
  ai_cost_month_micro_usd: number;
  ai_analyses_month: number;
  revenue_by_month: Array<{ month: string; confirmed_cents: number }>;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const [{ data, error }, { data: emails }] = await Promise.all([
    supabase.rpc("admin_metrics"),
    supabase.rpc("admin_email_stats"),
  ]);
  if (error || !data) throw new Error("Falha ao carregar métricas.");
  const m = data as Metrics;
  const e = (emails ?? {}) as Record<string, number>;
  const usd = (micro: number) => `US$ ${(micro / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Visão geral</h1>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuários" value={m.users_total} hint={`${m.new_users_month} novos no mês`} />
        <Stat label="Assinantes ativos" value={m.subscribers_active} hint="Com período pago vigente" />
        <Stat label="Usuários gratuitos" value={m.free_users} hint={`${m.trials_active} em teste do Pro`} />
        <Stat label="Taxa de conversão" value={`${Number(m.conversion_pct).toLocaleString("pt-BR")}%`} hint="Assinantes ÷ usuários" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Faturamento confirmado no mês" description="Soma dos pagamentos APROVADOS neste mês" />
          <p className="tabular text-3xl font-extrabold text-money-600">{formatBRL(m.revenue_confirmed_month_cents)}</p>
        </Card>
        <Card>
          <CardHeader title="Faturamento projetado (MRR)" description="Assinaturas que renovam × preço contratado. Não é receita recebida." />
          <p className="tabular text-3xl font-extrabold">{formatBRL(m.mrr_projected_cents)}</p>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pagamentos em processamento" value={m.payments_pending} />
        <Stat label="Recusados no mês" value={m.payments_rejected_month} hint={`${m.subscriptions_past_due} assinaturas em atraso`} />
        <Stat label="Checkouts não concluídos" value={m.checkouts_pending} />
        <Stat label="Cancelamentos no mês" value={m.cancellations_month} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Custo estimado com IA no mês" description="Tokens × preço público do modelo; o valor exato está na fatura do provedor" />
          <p className="tabular text-2xl font-bold">{usd(m.ai_cost_month_micro_usd)}</p>
          <p className="text-sm text-slate-500">{m.ai_analyses_month} análises concluídas</p>
        </Card>
        <Card>
          <CardHeader title="Faturamento confirmado por mês" />
          <table className="w-full text-sm">
            <tbody className="tabular">
              {m.revenue_by_month.map((r) => (
                <tr key={r.month} className="border-t border-slate-100"><td className="py-1.5">{r.month}</td><td className="text-right font-semibold">{formatBRL(Number(r.confirmed_cents))}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="E-mails de cobrança enviados" value={e.sent ?? 0} hint="Últimos 30 dias" />
        <Stat label="E-mails na fila" value={(e.pending ?? 0) + (e.sending ?? 0)} hint="Reenvio automático" />
        <Stat label="E-mails com falha" value={e.failed ?? 0} hint="Após 6 tentativas" />
        <Stat label="E-mails sem destinatário" value={e.skipped ?? 0} />
      </section>
    </div>
  );
}
