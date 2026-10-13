import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/card";
import { PremiumFeature } from "@/components/app/premium-gate";
import { Assumptions } from "@/components/app/assumptions";
import { DebtForm } from "@/components/forms/debt-forms";
import { BalanceLines } from "@/components/charts/balance-lines";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { listDebts, minimumPayment, type DebtSummary } from "@/lib/debt-queries";
import { DEBT_ASSUMPTIONS, DEBT_KIND_LABELS, formatRateBp, simulateStrategy, type StrategyResult } from "@/lib/debts";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatDecimalBR, parseBRL, percent } from "@/lib/money";

export const metadata: Metadata = { title: "Minhas dívidas" };

function monthsLabel(n: number) {
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y ? `${y} ${y === 1 ? "ano" : "anos"}` : "", m ? `${m} ${m === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ") || "0 mês";
}

function StrategyCard({ title, subtitle, r, best }: { title: string; subtitle: string; r: StrategyResult; best: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${best ? "border-money-400 bg-money-50/50" : "border-slate-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        {best ? <Badge tone="money">Menos juros</Badge> : null}
      </div>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {r.feasible ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-slate-500">Quitação em</dt><dd className="font-semibold">{monthsLabel(r.months)}</dd></div>
          <div><dt className="text-xs text-slate-500">Juros pagos</dt><dd className="tabular font-semibold">{formatBRL(r.totalInterestCents)}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Ordem de quitação</dt>
            <dd>{r.payoffOrder.map((p) => `${p.name} (mês ${p.month})`).join(" → ")}</dd></div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-danger-700">Com esse valor mensal as dívidas não são quitadas (não cobre os mínimos ou os juros).</p>
      )}
    </div>
  );
}

async function DebtsContent({ budgetParam, canCreate }: { budgetParam?: string; canCreate: boolean }) {
  const today = todayISO();
  const debts = await listDebts();
  const active = debts.filter((d) => d.status === "active" && d.remaining_cents > 0);
  const others = debts.filter((d) => !active.includes(d));
  const totalRemaining = active.reduce((a, d) => a + d.remaining_cents, 0);
  const minTotal = active.reduce((a, d) => a + minimumPayment(d), 0);
  const budget = (budgetParam ? parseBRL(budgetParam) : null) ?? minTotal;

  const strategyDebts = active.map((d) => ({ id: d.id, name: d.name, balanceCents: d.remaining_cents, rateBp: d.monthly_rate_bp, minPaymentCents: minimumPayment(d) }));
  const avalanche = simulateStrategy(strategyDebts, budget, "avalanche");
  const snowball = simulateStrategy(strategyDebts, budget, "snowball");
  const tie = avalanche.feasible && snowball.feasible && avalanche.totalInterestCents === snowball.totalInterestCents && avalanche.months === snowball.months;
  const bestIsAvalanche = avalanche.feasible && (!snowball.feasible || avalanche.totalInterestCents <= snowball.totalInterestCents);
  const best = bestIsAvalanche ? avalanche : snowball;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-slate-500">Total devido</p><p className="tabular text-xl font-bold">{formatBRL(totalRemaining)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Dívidas ativas</p><p className="text-xl font-bold">{active.length}</p></div>
        <div className="card col-span-2 p-4 lg:col-span-1"><p className="text-xs text-slate-500">Pagamentos mínimos por mês</p><p className="tabular text-xl font-bold">{formatBRL(minTotal)}</p></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {active.length === 0 ? (
            <Card><EmptyState icon={<HandCoins className="h-6 w-6" />} title="Nenhuma dívida ativa" description="Cadastre empréstimos, cheque especial, financiamentos ou parcelamentos para montar seu plano de quitação." /></Card>
          ) : active.map((d) => <DebtRow key={d.id} d={d} />)}
          {others.length ? (
            <Card>
              <CardHeader title="Quitadas e arquivadas" />
              <ul className="divide-y divide-slate-100 text-sm">
                {others.map((d) => (
                  <li key={d.id}><Link href={`/app/dividas/${d.id}`} className="flex justify-between py-2"><span>{d.name}</span><Badge tone={d.status === "archived" ? "neutral" : "money"}>{d.status === "archived" ? "Arquivada" : "Quitada"}</Badge></Link></li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <div className="lg:col-span-2">
          {canCreate ? (
            <Card>
              <CardHeader title="Nova dívida" />
              <DebtForm today={today} />
            </Card>
          ) : null}
        </div>
      </div>

      {active.length ? (
        <Card>
          <CardHeader title="Plano de quitação" description="Compare duas estratégias com o valor que você pode pagar por mês." />
          <form className="mb-4 flex flex-wrap items-end gap-2" action="/app/dividas">
            <div>
              <label htmlFor="orcamento" className="label">Quanto você pode pagar por mês no total (R$)</label>
              <input id="orcamento" name="orcamento" inputMode="decimal" defaultValue={formatDecimalBR(budget)} className="input tabular w-48" />
            </div>
            <button className="h-11 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">Simular</button>
          </form>
          {budget < minTotal ? (
            <p className="mb-3 text-sm text-warning-700">O valor está abaixo da soma dos pagamentos mínimos ({formatBRL(minTotal)}).</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <StrategyCard title="Avalanche" subtitle="Paga os mínimos e coloca o restante na dívida com MAIOR juro." r={avalanche} best={!tie && bestIsAvalanche && avalanche.feasible} />
            <StrategyCard title="Bola de neve" subtitle="Paga os mínimos e coloca o restante na dívida com MENOR saldo." r={snowball} best={!tie && !bestIsAvalanche && snowball.feasible} />
          </div>
          {tie ? <p className="mt-2 text-sm text-slate-600">Com estas dívidas e este valor mensal, as duas estratégias chegam ao mesmo resultado.</p> : null}
          {avalanche.feasible || snowball.feasible ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">Evolução do total devido</p>
              <BalanceLines series={[
                { key: "avalanche", label: "Avalanche", values: avalanche.totalBalances },
                { key: "snowball", label: "Bola de neve", values: snowball.totalBalances },
              ]} />
            </div>
          ) : null}
          {best.feasible && best.schedule.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-navy-600">Ver plano mês a mês ({best.strategy === "avalanche" ? "Avalanche" : "Bola de neve"}, primeiros 12 meses)</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="text-slate-500"><tr><th className="py-1">Mês</th>{active.map((d) => <th key={d.id} className="py-1">{d.name}</th>)}</tr></thead>
                  <tbody className="tabular">
                    {best.schedule.map((m) => (
                      <tr key={m.month} className="border-t border-slate-100">
                        <td className="py-1">{m.month}º</td>
                        {active.map((d) => <td key={d.id}>{m.payments[d.id] ? formatBRL(m.payments[d.id]) : "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          <div className="mt-4">
            <Assumptions items={[
              ...DEBT_ASSUMPTIONS,
              "Pagamento mínimo: a parcela informada ou, se não houver, 1% do saldo (mínimo R$ 10) mais os juros do mês.",
              `Valor mensal total considerado: ${formatBRL(budget)}.`,
            ]} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function DebtRow({ d }: { d: DebtSummary }) {
  const paidPct = percent(d.paid_since_cents, d.balance_cents) ?? 0;
  return (
    <Link href={`/app/dividas/${d.id}`} className="card block p-4 transition hover:border-navy-600/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{d.name}</p>
          <p className="text-xs text-slate-500">{DEBT_KIND_LABELS[d.kind]}{d.creditor ? ` · ${d.creditor}` : ""} · {formatRateBp(d.monthly_rate_bp)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Saldo restante</p>
          <p className="tabular font-bold">{formatBRL(d.remaining_cents)}</p>
        </div>
      </div>
      <div className="mt-3"><ProgressBar value={paidPct} label={`Quitado da dívida ${d.name}`} /></div>
      <p className="mt-1 text-xs text-slate-500">
        {formatBRL(d.paid_since_cents)} pagos desde {d.balance_date.split("-").reverse().join("/")}
        {d.installment_cents ? ` · parcela ${formatBRL(d.installment_cents)}` : ""}
      </p>
    </Link>
  );
}

export default async function DebtsPage({ searchParams }: PageProps<"/app/dividas">) {
  const sp = await searchParams;
  const [ent, debts] = await Promise.all([getEntitlements(), listDebts()]);
  const enabled = hasFeature(ent, "debts");
  return (
    <PremiumFeature
      feature="debts"
      title="Minhas dívidas"
      headline="Organize suas dívidas e alcance suas metas financeiras."
      description="Cadastre suas dívidas, acompanhe parcelas e saldo restante e compare estratégias para quitar mais rápido. Toda simulação mostra claramente as hipóteses usadas."
      icon={<HandCoins className="h-6 w-6" />}
      benefits={[
        "Cadastro de dívidas com juros, parcelas e vencimentos",
        "Registro de pagamentos e saldo restante",
        "Simulação de quitação antecipada",
        "Comparação de estratégias (maior juro primeiro x menor saldo primeiro)",
        "Plano de quitação e gráficos de evolução",
      ]}
      hasExistingData={debts.length > 0}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minhas dívidas</h1>
        <p className="mt-1 text-sm text-slate-500">Saldo, pagamentos e um plano para quitar.</p>
      </div>
      <DebtsContent budgetParam={typeof sp.orcamento === "string" ? sp.orcamento.slice(0, 20) : undefined} canCreate={enabled} />
    </PremiumFeature>
  );
}
