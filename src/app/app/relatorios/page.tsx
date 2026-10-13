import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PremiumFeature } from "@/components/app/premium-gate";
import { Assumptions } from "@/components/app/assumptions";
import { MonthlyChart } from "@/components/charts/monthly-chart";
import { CategoryBars } from "@/components/charts/category-bars";
import { loadReport } from "@/lib/report-data";
import { monthParam } from "@/lib/queries";
import { PROJECTION_ASSUMPTIONS } from "@/lib/reports";
import { addMonths, formatMonthLong, formatMonthShort } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export const metadata: Metadata = { title: "Relatórios" };

async function ReportContent({ month }: { month: string }) {
  const r = await loadReport(month);
  const recurringTotal = r.recurring.reduce((a, x) => a + x.typicalCents, 0);
  const totals = r.months12.reduce((a, m) => ({ i: a.i + m.incomePaidCents, e: a.e + m.expensePaidCents }), { i: 0, e: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Mês" className="flex items-center rounded-xl border border-slate-200 bg-white">
          <Link href={`/app/relatorios?mes=${addMonths(month, -1).slice(0, 7)}`} className="p-2.5" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-36 text-center text-sm font-semibold">{formatMonthLong(month)}</span>
          <Link href={`/app/relatorios?mes=${addMonths(month, 1).slice(0, 7)}`} className="p-2.5" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Link>
        </nav>
        <a href={`/api/relatorio?mes=${month.slice(0, 7)}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <Download className="h-4 w-4" aria-hidden /> Exportar relatório (CSV)
        </a>
      </div>

      <Card>
        <CardHeader title="Últimos 12 meses" description={`Receitas ${formatBRL(totals.i)} · despesas ${formatBRL(totals.e)} · resultado ${formatBRL(totals.i - totals.e)}`} />
        <MonthlyChart data={r.months12.map((m) => ({ label: formatMonthShort(m.month), receitas: m.incomePaidCents, despesas: m.expensePaidCents }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Comparação com o mês anterior" description="Por categoria, despesas pagas e pendentes" />
          {r.comparison.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="py-1.5">Categoria</th><th className="text-right">Este mês</th><th className="text-right">Anterior</th><th className="text-right">Variação</th></tr></thead>
                <tbody className="tabular">
                  {r.comparison.slice(0, 12).map((c) => (
                    <tr key={c.key} className="border-t border-slate-100">
                      <td className="py-1.5">{c.name}</td>
                      <td className="text-right">{formatBRL(c.currentCents)}</td>
                      <td className="text-right text-slate-500">{formatBRL(c.previousCents)}</td>
                      <td className={`text-right font-semibold ${c.deltaCents > 0 ? "text-danger-700" : c.deltaCents < 0 ? "text-money-700" : ""}`}>
                        {c.deltaCents > 0 ? "▲ " : c.deltaCents < 0 ? "▼ " : ""}{formatBRL(Math.abs(c.deltaCents))}
                        {c.changePct !== null ? <span className="block text-[11px] font-normal">{Math.abs(c.changePct).toLocaleString("pt-BR")}%</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-500">Sem despesas nesses meses.</p>}
        </Card>

        <Card>
          <CardHeader title="Gastos detalhados do mês" />
          {r.current.length ? (
            <CategoryBars max={12} items={r.current.map((c) => ({ key: c.category_id ?? "none", name: c.name, color: c.color, totalCents: c.total_cents }))} />
          ) : <p className="text-sm text-slate-500">Nenhuma despesa neste mês.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Assinaturas e gastos recorrentes" description="Cobranças parecidas em pelo menos 3 dos últimos 6 meses" />
          {r.recurring.length ? (
            <>
              <ul className="divide-y divide-slate-100 text-sm">
                {r.recurring.map((x) => (
                  <li key={x.name} className="flex justify-between gap-2 py-2">
                    <span className="truncate">{x.name}<span className="block text-xs text-slate-500">{x.months} meses · última em {x.lastDate.split("-").reverse().join("/")}</span></span>
                    <span className="tabular font-semibold">{formatBRL(x.typicalCents)}/mês</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm">Total estimado: <strong className="tabular">{formatBRL(recurringTotal)}/mês</strong> · <span className="tabular">{formatBRL(recurringTotal * 12)}/ano</span></p>
            </>
          ) : <p className="text-sm text-slate-500">Nenhuma cobrança recorrente identificada ainda.</p>}
        </Card>

        <Card>
          <CardHeader title="Projeção dos próximos 3 meses" description="Saldo estimado nas contas ao fim de cada mês" />
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1.5">Mês</th><th className="text-right">Entradas</th><th className="text-right">Saídas</th><th className="text-right">Saldo</th></tr></thead>
            <tbody className="tabular">
              {r.projection.map((p) => (
                <tr key={p.month} className="border-t border-slate-100">
                  <td className="py-1.5">{formatMonthShort(p.month)}</td>
                  <td className="text-right text-money-700">{formatBRL(p.incomeCents)}</td>
                  <td className="text-right">{formatBRL(p.expenseCents)}</td>
                  <td className={`text-right font-semibold ${p.endBalanceCents < 0 ? "text-danger-700" : ""}`}>{formatBRL(p.endBalanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3"><Assumptions items={PROJECTION_ASSUMPTIONS} title="Hipóteses da projeção" /></div>
        </Card>
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/app/relatorios">) {
  const sp = await searchParams;
  return (
    <PremiumFeature
      feature="advanced_reports"
      title="Relatórios avançados"
      headline="Descubra onde seu dinheiro está indo."
      description="Relatórios detalhados, comparações mensais, projeções e identificação de assinaturas recorrentes, com exportação."
      icon={<BarChart3 className="h-6 w-6" />}
      benefits={[
        "Gráficos detalhados por categoria",
        "Comparações entre meses",
        "Identificação de assinaturas recorrentes",
        "Projeções financeiras com hipóteses explícitas",
        "Exportação de relatórios",
      ]}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="mt-1 text-sm text-slate-500">Comparações, recorrências e projeções.</p>
      </div>
      <ReportContent month={monthParam(sp.mes)} />
    </PremiumFeature>
  );
}
