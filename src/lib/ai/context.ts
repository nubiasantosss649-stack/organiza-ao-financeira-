import { formatBRL } from "@/lib/money";
import { formatMonthLong } from "@/lib/dates";
import type { ISODate } from "@/lib/dates";

/**
 * Dados enviados ao provedor de IA: SOMENTE agregados do próprio usuário
 * (totais por mês e categoria, orçamentos, metas, dívidas e nomes de despesas
 * recorrentes). Nunca envia nome, e-mail, ids, contas bancárias ou lançamentos individuais.
 */
export interface FinancialSnapshotInput {
  today: ISODate;
  totalBalanceCents: number;
  months: Array<{ month: ISODate; incomeCents: number; expenseCents: number }>;
  categoriesCurrent: Array<{ name: string; totalCents: number }>;
  categoriesPrevious: Array<{ name: string; totalCents: number }>;
  pendingBillsCents: number;
  overdueBillsCents: number;
  budgets: Array<{ name: string; limitCents: number; spentCents: number }>;
  goals: Array<{ name: string; targetCents: number; savedCents: number; targetDate: ISODate | null }>;
  debts: Array<{ name: string; remainingCents: number; monthlyRatePct: number; installmentCents: number | null }>;
  recurring: Array<{ name: string; typicalCents: number }>;
}

const money = (c: number) => formatBRL(c);
const clean = (s: string, max = 40) => s.replace(/[\r\n\t<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function buildFinancialSnapshot(input: FinancialSnapshotInput) {
  return {
    data_de_referencia: input.today,
    saldo_total_nas_contas: money(input.totalBalanceCents),
    contas_pendentes_do_mes: money(input.pendingBillsCents),
    contas_vencidas: money(input.overdueBillsCents),
    meses: input.months.map((m) => ({
      mes: formatMonthLong(m.month),
      receitas_recebidas: money(m.incomeCents),
      despesas: money(m.expenseCents),
      resultado: money(m.incomeCents - m.expenseCents),
    })),
    gastos_por_categoria_mes_atual: input.categoriesCurrent.slice(0, 15).map((c) => ({ categoria: clean(c.name), total: money(c.totalCents) })),
    gastos_por_categoria_mes_anterior: input.categoriesPrevious.slice(0, 15).map((c) => ({ categoria: clean(c.name), total: money(c.totalCents) })),
    orcamentos: input.budgets.map((b) => ({ nome: clean(b.name), limite: money(b.limitCents), gasto_no_mes: money(b.spentCents) })),
    metas: input.goals.map((g) => ({
      nome: clean(g.name),
      valor_desejado: money(g.targetCents),
      guardado: money(g.savedCents),
      prazo: g.targetDate ?? "sem prazo",
    })),
    dividas: input.debts.map((d) => ({
      nome: clean(d.name),
      saldo_restante: money(d.remainingCents),
      juros_mensais: `${d.monthlyRatePct.toLocaleString("pt-BR")}%`,
      parcela: d.installmentCents ? money(d.installmentCents) : "não informada",
    })),
    despesas_recorrentes_identificadas: input.recurring.slice(0, 10).map((r) => ({ descricao: clean(r.name), valor_tipico: money(r.typicalCents) })),
  };
}

export type FinancialSnapshot = ReturnType<typeof buildFinancialSnapshot>;

export function snapshotIsEmpty(s: FinancialSnapshot): boolean {
  return s.meses.every((m) => m.receitas_recebidas === "R$ 0,00" && m.despesas === "R$ 0,00") && s.dividas.length === 0 && s.metas.length === 0;
}
