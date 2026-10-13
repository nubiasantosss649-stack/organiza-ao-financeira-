import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Info, Plus, Sparkles, Wallet,
} from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { MonthlyChart } from "@/components/charts/monthly-chart";
import { CategoryBars } from "@/components/charts/category-bars";
import { TransactionRow } from "@/components/app/transaction-row";
import { getEntitlements, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  budgetSpending, categoryTotals, listAccounts, listActiveBudgets, listCategories, listGoals, monthParam, monthlySummary,
} from "@/lib/queries";
import { addMonths, endOfMonth, formatDateBR, formatMonthLong, formatMonthShort, todayISO } from "@/lib/dates";
import { budgetStatus, computeDashboard, goalPlan, type MonthTotals } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import type { Transaction } from "@/lib/types";

export const metadata: Metadata = { title: "Início" };

const EMPTY_MONTH = (month: string): MonthTotals => ({
  month, incomePaidCents: 0, expensePaidCents: 0, incomePendingCents: 0, expensePendingCents: 0,
});

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const user = await requireUser();
  const month = monthParam(sp.mes);
  const monthEnd = endOfMonth(month);
  const today = todayISO();
  const supabase = await createClient();

  const [accounts, summary, catTotals, pendingRes, recentRes, budgets, goals, categories, ent] = await Promise.all([
    listAccounts({ includeArchived: true }),
    monthlySummary(addMonths(month, -5), month),
    categoryTotals(month, monthEnd),
    supabase
      .from("transactions")
      .select("id, description, amount_cents, occurred_on")
      .eq("kind", "expense")
      .eq("status", "pending")
      .lte("occurred_on", monthEnd)
      .order("occurred_on")
      .limit(500),
    supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    listActiveBudgets(),
    listGoals("active"),
    listCategories({ includeArchived: true }),
    getEntitlements(),
  ]);

  if (!user.onboardingCompleted && accounts.length === 0) redirect("/app/boas-vindas");

  const pending = (pendingRes.data ?? []).map((p) => ({ ...p, amount_cents: Number(p.amount_cents) }));
  const recent = (recentRes.data ?? []) as Transaction[];
  const current = summary[summary.length - 1] ?? EMPTY_MONTH(month);
  const previous = summary[summary.length - 2] ?? EMPTY_MONTH(addMonths(month, -1));

  const dash = computeDashboard({
    today,
    month,
    accountBalancesCents: accounts.map((a) => Number(a.balance_cents)),
    currentMonth: current,
    previousMonth: previous,
    pendingExpenses: pending.map((p) => ({ amountCents: p.amount_cents, occurredOn: p.occurred_on })),
  });

  const overdueList = pending.filter((p) => p.occurred_on < today).slice(0, 5);
  const upcomingList = pending.filter((p) => p.occurred_on >= today).slice(0, 5);
  const chartData = summary.map((m) => ({
    label: formatMonthShort(m.month),
    receitas: m.incomePaidCents,
    despesas: m.expensePaidCents,
  }));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const activeBudgets = budgets.filter((b) => b.is_active);
  const isCurrentMonth = month.slice(0, 7) === today.slice(0, 7);
  const prevMonthParam = addMonths(month, -1).slice(0, 7);
  const nextMonthParam = addMonths(month, 1).slice(0, 7);
  const firstName = user.fullName?.split(" ")[0];
  const hasAnyData = summary.some((m) => m.incomePaidCents || m.expensePaidCents || m.expensePendingCents || m.incomePendingCents);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Olá{firstName ? `, ${firstName}` : ""}!</p>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">Resumo financeiro</h1>
        </div>
        <div className="flex items-center gap-2">
          <nav aria-label="Mês" className="flex items-center rounded-xl border border-slate-200 bg-white">
            <Link href={`/app?mes=${prevMonthParam}`} className="p-2.5 text-slate-600 hover:text-navy-900" aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-36 text-center text-sm font-semibold text-navy-900">{formatMonthLong(month)}</span>
            <Link href={`/app?mes=${nextMonthParam}`} className="p-2.5 text-slate-600 hover:text-navy-900" aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>
          <span className="hidden sm:block">
            <ButtonLink href="/app/lancamentos/novo" variant="money">
              <Plus className="h-4 w-4" aria-hidden /> Novo lançamento
            </ButtonLink>
          </span>
        </div>
      </div>

      {/* Saldo + disponível */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card relative overflow-hidden bg-navy-900 p-5 text-white lg:col-span-2">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-money-500/20 blur-2xl" aria-hidden />
          <p className="flex items-center gap-2 text-sm text-navy-100/80"><Wallet className="h-4 w-4" aria-hidden /> Saldo total nas contas</p>
          <p className="tabular mt-1 text-3xl font-bold sm:text-4xl">{formatBRL(dash.totalBalanceCents)}</p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
            <div>
              <p className="text-xs text-navy-100/70">Valor disponível</p>
              <p className={`tabular text-lg font-semibold ${dash.availableCents < 0 ? "text-red-300" : "text-money-400"}`}>
                {formatBRL(dash.availableCents)}
              </p>
            </div>
            <div>
              <p className="text-xs text-navy-100/70">Resultado do mês</p>
              <p className={`tabular text-lg font-semibold ${dash.monthResultCents < 0 ? "text-red-300" : "text-white"}`}>
                {formatBRL(dash.monthResultCents)}
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-navy-100/60">
            <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
            Disponível = saldo das contas − contas pendentes vencidas e a vencer até o fim do mês.
          </p>
        </div>

        <Card className="flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">Progresso financeiro</h2>
            <p className="mt-0.5 text-xs text-slate-500">Quanto da renda recebida sobrou no mês</p>
          </div>
          {dash.savingsRatePct === null ? (
            <p className="mt-4 text-sm text-slate-500">Registre suas receitas do mês para ver sua taxa de economia.</p>
          ) : (
            <div className="mt-4">
              <p className={`tabular text-3xl font-bold ${dash.savingsRatePct < 0 ? "text-danger-700" : "text-money-600"}`}>
                {dash.savingsRatePct.toLocaleString("pt-BR")}%
              </p>
              <ProgressBar value={dash.savingsRatePct} label="Taxa de economia" tone={dash.savingsRatePct < 0 ? "danger" : "money"} />
              <p className="mt-2 text-xs text-slate-500">
                {dash.savingsRatePct >= 20
                  ? "Ótimo! Você está guardando 20% ou mais do que recebe."
                  : dash.savingsRatePct >= 0
                    ? "Uma referência comum é guardar ao menos 10% a 20% da renda."
                    : "As despesas pagas superaram as receitas recebidas neste mês."}
              </p>
            </div>
          )}
        </Card>
      </section>

      {/* Cards de receitas/despesas/contas */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores do mês">
        <StatCard
          label="Receitas recebidas"
          value={dash.incomeCents}
          icon={<ArrowUpRight className="h-4 w-4 text-money-600" aria-hidden />}
          change={dash.incomeChangePct}
          goodWhenUp
          previous={dash.previousIncomeCents}
        />
        <StatCard
          label="Despesas pagas"
          value={dash.expenseCents}
          icon={<ArrowDownRight className="h-4 w-4 text-navy-600" aria-hidden />}
          change={dash.expenseChangePct}
          goodWhenUp={false}
          previous={dash.previousExpenseCents}
        />
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CalendarClock className="h-4 w-4 text-warning-700" aria-hidden /> A pagar no mês
          </p>
          <p className="tabular mt-1 text-lg font-bold text-navy-900 sm:text-xl">{formatBRL(dash.toPayCents)}</p>
          <p className="text-xs text-slate-500">{dash.toPayCount} {dash.toPayCount === 1 ? "conta" : "contas"} a vencer</p>
        </div>
        <div className={`card p-4 ${dash.overdueCount ? "border-danger-100 bg-danger-50" : ""}`}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <AlertTriangle className="h-4 w-4 text-danger-600" aria-hidden /> Contas vencidas
          </p>
          <p className={`tabular mt-1 text-lg font-bold sm:text-xl ${dash.overdueCount ? "text-danger-700" : "text-navy-900"}`}>
            {formatBRL(dash.overdueCents)}
          </p>
          <p className="text-xs text-slate-500">{dash.overdueCount} {dash.overdueCount === 1 ? "conta" : "contas"} em atraso</p>
        </div>
      </section>

      {!hasAnyData ? (
        <Card>
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Seu painel vai ganhar vida com os primeiros lançamentos"
            description="Registre uma receita ou um gasto e o Controle Fácil atualiza saldo, gráficos e indicadores automaticamente."
            action={<ButtonLink href="/app/lancamentos/novo" variant="money"><Plus className="h-4 w-4" /> Registrar primeiro lançamento</ButtonLink>}
          />
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Receitas x despesas" description="Valores recebidos e pagos nos últimos 6 meses, em R$" />
          <MonthlyChart data={chartData} />
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-navy-600">Ver dados em tabela</summary>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-1 font-medium">Mês</th><th className="font-medium">Receitas</th><th className="font-medium">Despesas</th></tr></thead>
              <tbody className="tabular">
                {summary.map((m) => (
                  <tr key={m.month} className="border-t border-slate-100">
                    <td className="py-1">{formatMonthShort(m.month)}</td>
                    <td>{formatBRL(m.incomePaidCents)}</td>
                    <td>{formatBRL(m.expensePaidCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Gastos por categoria"
            description="Despesas do mês, pagas e pendentes"
            action={<Link href={`/app/lancamentos?tipo=expense&periodo=month&ref=${month}`} className="text-sm font-medium text-navy-600 hover:underline">Ver todas</Link>}
          />
          {catTotals.length ? (
            <CategoryBars items={catTotals.map((c) => ({ key: c.category_id ?? "none", name: c.name, color: c.color, totalCents: c.total_cents }))} />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">Nenhuma despesa registrada neste mês.</p>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contas a pagar" description={isCurrentMonth ? "Vencidas e a vencer neste mês" : "Pendentes até o fim do mês selecionado"} />
          {overdueList.length + upcomingList.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Nenhuma conta pendente. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...overdueList, ...upcomingList].map((p) => {
                const late = p.occurred_on < today;
                return (
                  <li key={p.id}>
                    <Link href={`/app/lancamentos/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-900">{p.description}</p>
                        <p className="text-xs text-slate-500">Vence em {formatDateBR(p.occurred_on)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {late ? <Badge tone="danger">Vencida</Badge> : p.occurred_on === today ? <Badge tone="warning">Hoje</Badge> : null}
                        <span className="tabular text-sm font-semibold">{formatBRL(p.amount_cents)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Últimas movimentações"
            action={<Link href="/app/lancamentos" className="text-sm font-medium text-navy-600 hover:underline">Histórico</Link>}
          />
          {recent.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.map((t) => (
                <TransactionRow key={t.id} tx={{ ...t, amount_cents: Number(t.amount_cents) }} category={t.category_id ? catById.get(t.category_id) : undefined} accountName={accById.get(t.account_id)?.name} today={today} compact />
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-slate-500">Nenhuma movimentação ainda.</p>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Orçamento do mês"
            action={<Link href="/app/orcamentos" className="text-sm font-medium text-navy-600 hover:underline">Gerenciar</Link>}
          />
          {activeBudgets.length ? (
            <ul className="space-y-4">
              {activeBudgets.slice(0, 4).map((b) => {
                const spent = budgetSpending(b, catTotals);
                const st = budgetStatus(spent, Number(b.amount_cents));
                const name = b.category_id ? catById.get(b.category_id)?.name ?? "Categoria" : "Orçamento geral";
                return (
                  <li key={b.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{name}</span>
                      <span className="tabular text-slate-600">{formatBRL(spent)} de {formatBRL(Number(b.amount_cents))}</span>
                    </div>
                    <ProgressBar value={st.pct} tone={st.state === "over" ? "danger" : st.state === "warning" ? "warning" : "money"} label={`Uso do orçamento ${name}`} />
                    {st.state === "over" ? (
                      <p className="mt-1 text-xs font-medium text-danger-700">Acima do orçamento em {formatBRL(st.overCents)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Defina um limite de gastos" description="Crie um orçamento mensal e acompanhe se está gastando acima do planejado."
              action={<ButtonLink href="/app/orcamentos" variant="secondary" size="sm">Criar orçamento</ButtonLink>} />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Minhas metas"
            action={<Link href="/app/metas" className="text-sm font-medium text-navy-600 hover:underline">Ver metas</Link>}
          />
          {goals.length ? (
            <ul className="space-y-4">
              {goals.slice(0, 3).map((g) => {
                const plan = goalPlan(g.target_cents, g.saved_cents, g.target_date, today);
                return (
                  <li key={g.id}>
                    <Link href={`/app/metas/${g.id}`} className="block">
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{g.name}</span>
                        <span className="tabular text-slate-600">{plan.progressPct.toLocaleString("pt-BR")}%</span>
                      </div>
                      <ProgressBar value={plan.progressPct} label={`Progresso da meta ${g.name}`} />
                      <p className="tabular mt-1 text-xs text-slate-500">
                        {formatBRL(g.saved_cents)} de {formatBRL(g.target_cents)}
                        {plan.monthlyNeededCents ? ` · guardar ${formatBRL(plan.monthlyNeededCents)}/mês` : ""}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Crie sua primeira meta" description="Reserva de emergência, viagem, um notebook… Defina um valor e acompanhe o progresso."
              action={<ButtonLink href="/app/metas" variant="secondary" size="sm">Criar meta</ButtonLink>} />
          )}
        </Card>
      </section>

      {ent.plan_id === "free" ? (
        <Link href="/app/planos" className="card flex items-center gap-4 border-money-100 bg-gradient-to-r from-money-50 to-white p-4 hover:border-money-400">
          <div className="rounded-xl bg-money-500 p-2.5 text-white"><Sparkles className="h-5 w-5" aria-hidden /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-navy-900">Descubra onde seu dinheiro está indo.</p>
            <p className="text-sm text-slate-600">Conheça o Controle Fácil Pro: análises com IA, dívidas, cartões e importação de extratos.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function StatCard({
  label, value, icon, change, goodWhenUp, previous,
}: {
  label: string; value: number; icon: React.ReactNode; change: number | null; goodWhenUp: boolean; previous: number;
}) {
  const good = change === null ? null : goodWhenUp ? change >= 0 : change <= 0;
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icon} {label}</p>
      <p className="tabular mt-1 text-lg font-bold text-navy-900 sm:text-xl">{formatBRL(value)}</p>
      <p className="text-xs text-slate-500" title={`Mês anterior: ${formatBRL(previous)}`}>
        {change === null ? (
          "Sem base no mês anterior"
        ) : (
          <>
            <span className={good ? "font-semibold text-money-700" : "font-semibold text-danger-700"}>
              {change > 0 ? "▲" : change < 0 ? "▼" : "="} {Math.abs(change).toLocaleString("pt-BR")}%
            </span>{" "}
            vs. mês anterior
          </>
        )}
      </p>
    </div>
  );
}
