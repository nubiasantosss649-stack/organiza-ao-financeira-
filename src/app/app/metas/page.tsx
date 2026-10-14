import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Target } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui/card";
import { PlanLimitNotice } from "@/components/app/plan-limit-notice";
import { GoalForm } from "@/components/forms/goal-forms";
import { getEntitlements } from "@/lib/auth";
import { listGoals, monthlySummary } from "@/lib/queries";
import { addMonths, formatDateBR, todayISO } from "@/lib/dates";
import { canCreate, goalPlan } from "@/lib/finance";
import { formatBRL, formatDecimalBR } from "@/lib/money";
import { GOAL_KIND_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Minhas metas" };

export default async function GoalsPage() {
  const today = todayISO();
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [goals, ent, lastMonths] = await Promise.all([
    listGoals(),
    getEntitlements(),
    monthlySummary(addMonths(thisMonth, -3), addMonths(thisMonth, -1)),
  ]);
  const active = goals.filter((g) => g.status === "active");
  const others = goals.filter((g) => g.status !== "active");
  const allowed = canCreate(ent.limits.active_goals, ent.usage.active_goals);

  // Reserva de emergência: referência de 6x a média das despesas pagas nos 3 últimos meses completos.
  const monthsWithData = lastMonths.filter((m) => m.expensePaidCents > 0);
  const avgExpense = monthsWithData.length
    ? Math.round(monthsWithData.reduce((a, m) => a + m.expensePaidCents, 0) / monthsWithData.length)
    : 0;
  const emergencyTarget = avgExpense * 6;

  return (
    <div className="space-y-5">
      <PageHeader title="Minhas metas" description="Defina objetivos, registre o que guardou e veja quanto falta por mês." />
      <PlanLimitNotice used={ent.usage.active_goals} limit={ent.limits.active_goals} noun="metas ativas" />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {active.length === 0 ? (
            <Card><EmptyState icon={<Target className="h-6 w-6" />} title="Nenhuma meta ativa" description="Crie uma meta como reserva de emergência, viagem ou a compra de um notebook." /></Card>
          ) : (
            active.map((g) => {
              const plan = goalPlan(g.target_cents, g.saved_cents, g.target_date, today);
              return (
                <Link key={g.id} href={`/app/metas/${g.id}`} className="card block p-4 transition hover:border-navy-600/40 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{GOAL_KIND_LABELS[g.kind]}</p>
                      <h2 className="truncate text-lg font-semibold">{g.name}</h2>
                    </div>
                    {plan.completed ? <Badge tone="money">Atingida!</Badge> : plan.overdue ? <Badge tone="danger">Prazo vencido</Badge> : null}
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-sm">
                    <span className="tabular font-semibold">{formatBRL(g.saved_cents)}</span>
                    <span className="tabular text-slate-500">de {formatBRL(g.target_cents)}</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar value={plan.progressPct} label={`Progresso da meta ${g.name}`} /></div>
                  <p className="mt-2 text-xs text-slate-500">
                    {plan.progressPct.toLocaleString("pt-BR")}% concluído
                    {g.target_date ? ` · prazo ${formatDateBR(g.target_date)}` : " · sem prazo definido"}
                    {plan.monthlyNeededCents ? ` · guardar ${formatBRL(plan.monthlyNeededCents)} por mês` : ""}
                  </p>
                </Link>
              );
            })
          )}

          {others.length ? (
            <Card>
              <CardHeader title="Concluídas e arquivadas" />
              <ul className="divide-y divide-slate-100">
                {others.map((g) => (
                  <li key={g.id}>
                    <Link href={`/app/metas/${g.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:bg-slate-50">
                      <span className="truncate">{g.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular text-slate-600">{formatBRL(g.saved_cents)}</span>
                        <Badge tone={g.status === "completed" ? "money" : "neutral"}>{g.status === "completed" ? "Concluída" : "Arquivada"}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Nova meta" />
            {allowed ? (
              <GoalForm
                suggestions={[
                  { label: "Reserva de emergência", name: "Reserva de emergência", kind: "emergency", target: emergencyTarget ? formatDecimalBR(emergencyTarget) : undefined },
                  { label: "Guardar R$ 5.000", name: "Guardar R$ 5.000", kind: "savings", target: "5.000,00" },
                  { label: "Viagem", name: "Viagem", kind: "travel" },
                  { label: "Notebook", name: "Comprar um notebook", kind: "purchase" },
                ]}
              />
            ) : (
              <p className="text-sm text-slate-600">O plano Grátis permite {ent.limits.active_goals} meta ativa. Conclua ou arquive a atual para criar outra, ou conheça o Pro para ter metas ilimitadas.</p>
            )}
          </Card>
          <Card className="bg-navy-50/60">
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-navy-700" aria-hidden />
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-navy-900">Reserva de emergência</p>
                {avgExpense ? (
                  <p className="mt-1">
                    Sua média de despesas pagas nos últimos {monthsWithData.length} {monthsWithData.length === 1 ? "mês" : "meses"} foi de{" "}
                    <strong className="tabular">{formatBRL(avgExpense)}</strong>. Uma referência comum é guardar 6 meses de gastos:{" "}
                    <strong className="tabular">{formatBRL(emergencyTarget)}</strong>.
                  </p>
                ) : (
                  <p className="mt-1">Uma referência comum é guardar o equivalente a 3 a 6 meses dos seus gastos. Registre suas despesas para calcularmos esse valor com base nos seus dados.</p>
                )}
                <p className="mt-1 text-xs text-slate-500">Hipótese: média simples das despesas pagas dos meses anteriores completos; não inclui gastos futuros ou imprevistos.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
