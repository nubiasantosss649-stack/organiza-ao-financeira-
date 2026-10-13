import type { Metadata } from "next";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { PlanForm, PromotionForm, TrialForm } from "../forms";
import { requireAdmin } from "@/lib/admin";
import { FEATURE_LABELS } from "@/lib/plans";
import { formatBRL, formatDecimalBR } from "@/lib/money";
import { nowMs } from "@/lib/dates";

export const metadata: Metadata = { title: "Planos e ofertas" };

/** Converte timestamp para o valor de <input type="datetime-local"> no horário de Brasília. */
function toLocalInput(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export default async function AdminPlansPage() {
  const { supabase } = await requireAdmin();
  const [{ data: plans }, { data: trial }, { data: promos }] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase.from("app_settings").select("value").eq("key", "pro_trial").maybeSingle(),
    supabase.rpc("admin_list_promotions"),
  ]);
  const t = (trial?.value ?? { enabled: false, days: 7 }) as { enabled: boolean; days: number };
  const now = nowMs();
  const num = (v: number | null) => (v === null ? "" : String(v));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Planos e ofertas</h1>
      {(plans ?? []).map((p) => (
        <Card key={p.id}>
          <CardHeader title={p.name} description={`Preço atual: ${formatBRL(p.price_cents)}${p.billing_interval === "month" ? "/mês" : ""}`} />
          <PlanForm
            featureLabels={FEATURE_LABELS}
            plan={{
              id: p.id, name: p.name, price: formatDecimalBR(p.price_cents),
              max_accounts: num(p.max_accounts), max_active_budgets: num(p.max_active_budgets), max_active_goals: num(p.max_active_goals),
              ai_limit: num(p.ai_analyses_limit), ai_period: p.ai_limit_period, features: p.features,
            }}
          />
        </Card>
      ))}

      <Card>
        <CardHeader title="Teste gratuito do Pro" description="Controlado pelo banco: um teste por conta, termina automaticamente e nunca gera cobrança." />
        <TrialForm enabled={t.enabled} days={t.days} />
      </Card>

      <Card>
        <CardHeader title="Ofertas com prazo" description="Só são exibidas aos clientes entre o início e o fim configurados." />
        <div className="space-y-4">
          {(promos ?? []).map((pr: { id: string; name: string; description: string | null; price_cents: number; starts_at: string; ends_at: string; is_active: boolean }) => {
            const live = pr.is_active && now >= new Date(pr.starts_at).getTime() && now <= new Date(pr.ends_at).getTime();
            return (
              <details key={pr.id} className="rounded-xl border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <strong>{pr.name}</strong> · <span className="tabular">{formatBRL(pr.price_cents)}/mês</span>
                  <Badge tone={live ? "money" : "neutral"}>{live ? "No ar" : pr.is_active ? "Fora do período" : "Inativa"}</Badge>
                </summary>
                <div className="mt-3">
                  <PromotionForm defaults={{
                    id: pr.id, name: pr.name, description: pr.description ?? "", price: formatDecimalBR(pr.price_cents),
                    starts_at: toLocalInput(pr.starts_at), ends_at: toLocalInput(pr.ends_at), active: pr.is_active,
                  }} />
                </div>
              </details>
            );
          })}
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold">Nova oferta</p>
            <PromotionForm />
          </div>
        </div>
      </Card>
    </div>
  );
}
