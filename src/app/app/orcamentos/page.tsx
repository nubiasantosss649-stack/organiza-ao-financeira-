import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PieChart } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PlanLimitNotice } from "@/components/app/plan-limit-notice";
import { ActionForm } from "@/components/forms/action-form";
import { BudgetAmountForm, BudgetForm } from "@/components/forms/budget-forms";
import { deleteBudget, setBudgetActive } from "./actions";
import { getEntitlements } from "@/lib/auth";
import { budgetSpending, categoryTotals, listActiveBudgets, listCategories, monthParam } from "@/lib/queries";
import { addMonths, endOfMonth, formatMonthLong } from "@/lib/dates";
import { budgetStatus, canCreate } from "@/lib/finance";
import { formatBRL, formatDecimalBR } from "@/lib/money";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function BudgetsPage({ searchParams }: PageProps<"/app/orcamentos">) {
  const sp = await searchParams;
  const month = monthParam(sp.mes);
  const [budgets, categories, totals, ent] = await Promise.all([
    listActiveBudgets(),
    listCategories({ includeArchived: true }),
    categoryTotals(month, endOfMonth(month)),
    getEntitlements(),
  ]);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const active = budgets.filter((b) => b.is_active);
  const inactive = budgets.filter((b) => !b.is_active);
  const allowed = canCreate(ent.limits.active_budgets, ent.usage.active_budgets);
  const usedCategoryIds = new Set(active.map((b) => b.category_id));
  const options = categories.filter((c) => c.kind === "expense" && !c.archived_at && !usedCategoryIds.has(c.id));

  return (
    <div className="space-y-5">
      <PageHeader title="Orçamentos" description="Defina limites mensais e descubra quando está gastando acima do planejado." />
      <PlanLimitNotice used={ent.usage.active_budgets} limit={ent.limits.active_budgets} noun="orçamentos ativos" />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Acompanhamento"
            description="Despesas pagas e pendentes do mês"
            action={
              <nav aria-label="Mês" className="flex items-center rounded-xl border border-slate-200">
                <Link href={`/app/orcamentos?mes=${addMonths(month, -1).slice(0, 7)}`} className="p-2" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Link>
                <span className="px-1 text-sm font-semibold">{formatMonthLong(month)}</span>
                <Link href={`/app/orcamentos?mes=${addMonths(month, 1).slice(0, 7)}`} className="p-2" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Link>
              </nav>
            }
          />
          {active.length === 0 ? (
            <EmptyState icon={<PieChart className="h-6 w-6" />} title="Nenhum orçamento ativo" description="Crie um limite mensal geral ou por categoria, como Restaurantes ou Mercado." />
          ) : (
            <ul className="space-y-5">
              {active.map((b) => {
                const spent = budgetSpending(b, totals);
                const limit = Number(b.amount_cents);
                const st = budgetStatus(spent, limit);
                const name = b.category_id ? catById.get(b.category_id)?.name ?? "Categoria" : "Orçamento geral";
                return (
                  <li key={b.id}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{name}</span>
                      <span className="tabular text-sm text-slate-600">{formatBRL(spent)} de {formatBRL(limit)}</span>
                    </div>
                    <ProgressBar value={st.pct} tone={st.state === "over" ? "danger" : st.state === "warning" ? "warning" : "money"} label={`Uso do orçamento ${name}`} />
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {st.state === "over" ? (
                        <Badge tone="danger">Acima do orçamento em {formatBRL(st.overCents)}</Badge>
                      ) : st.state === "warning" ? (
                        <Badge tone="warning">{st.pct.toLocaleString("pt-BR")}% usado · restam {formatBRL(st.remainingCents)}</Badge>
                      ) : (
                        <span className="text-slate-500">Restam {formatBRL(st.remainingCents)} ({st.pct.toLocaleString("pt-BR")}% usado)</span>
                      )}
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-navy-600">Ajustar</summary>
                      <div className="mt-2 space-y-3 rounded-xl bg-slate-50 p-3">
                        <BudgetAmountForm id={b.id} amount={formatDecimalBR(limit)} />
                        <div className="flex gap-2">
                          <ActionForm action={setBudgetActive} hidden={{ id: b.id, active: "0" }}>
                            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Desativar</button>
                          </ActionForm>
                          <ActionForm action={deleteBudget} hidden={{ id: b.id }}>
                            <ConfirmButton variant="ghost" size="sm" className="text-danger-700" message="Excluir este orçamento?">Excluir</ConfirmButton>
                          </ActionForm>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Novo orçamento" />
            {allowed ? (
              <BudgetForm categories={options} />
            ) : (
              <p className="text-sm text-slate-600">O plano Grátis permite {ent.limits.active_budgets} orçamento ativo. Desative o atual para criar outro, ou conheça o Pro.</p>
            )}
          </Card>
          {inactive.length ? (
            <Card>
              <CardHeader title="Desativados" />
              <ul className="divide-y divide-slate-100">
                {inactive.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{b.category_id ? catById.get(b.category_id)?.name : "Orçamento geral"} · <span className="tabular">{formatBRL(Number(b.amount_cents))}</span></span>
                    <ActionForm action={setBudgetActive} hidden={{ id: b.id, active: "1" }}>
                      <button className="font-medium text-navy-600 hover:underline">Reativar</button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
