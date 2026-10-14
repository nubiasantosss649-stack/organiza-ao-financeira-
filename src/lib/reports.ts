import { addMonths, monthsBetweenInclusive, startOfMonth, type ISODate } from "./dates";
import { percentChange } from "./money";
import { normalizeDescription } from "./import";

export interface SimpleTx {
  description: string;
  amountCents: number;
  date: ISODate;
  kind: "income" | "expense";
}

export interface RecurringItem {
  name: string;
  typicalCents: number;
  months: number;
  lastDate: ISODate;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Identifica despesas recorrentes (assinaturas, mensalidades): mesma descrição
 * em pelo menos 3 meses diferentes dos últimos 6, com valores parecidos (±15% da mediana).
 */
export function detectRecurring(txs: SimpleTx[], today: ISODate, minMonths = 3): RecurringItem[] {
  const since = addMonths(startOfMonth(today), -5);
  const groups = new Map<string, SimpleTx[]>();
  for (const t of txs) {
    if (t.kind !== "expense" || t.date < since || t.date > today) continue;
    const key = normalizeDescription(t.description).replace(/\b\d+ ?\d*\b/g, "").trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: RecurringItem[] = [];
  for (const items of groups.values()) {
    const months = new Set(items.map((i) => i.date.slice(0, 7)));
    if (months.size < minMonths) continue;
    const typical = median(items.map((i) => i.amountCents));
    const similar = items.filter((i) => Math.abs(i.amountCents - typical) <= typical * 0.15);
    if (new Set(similar.map((i) => i.date.slice(0, 7))).size < minMonths) continue;
    const last = items.reduce((a, b) => (a.date > b.date ? a : b));
    out.push({ name: last.description, typicalCents: typical, months: months.size, lastDate: last.date });
  }
  return out.sort((a, b) => b.typicalCents - a.typicalCents);
}

export interface CategoryDelta {
  key: string;
  name: string;
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  changePct: number | null;
}

export function compareCategories(
  current: Array<{ key: string; name: string; totalCents: number }>,
  previous: Array<{ key: string; name: string; totalCents: number }>,
): CategoryDelta[] {
  const map = new Map<string, CategoryDelta>();
  for (const c of current) map.set(c.key, { key: c.key, name: c.name, currentCents: c.totalCents, previousCents: 0, deltaCents: 0, changePct: null });
  for (const p of previous) {
    const row = map.get(p.key) ?? { key: p.key, name: p.name, currentCents: 0, previousCents: 0, deltaCents: 0, changePct: null };
    row.previousCents = p.totalCents;
    map.set(p.key, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, deltaCents: r.currentCents - r.previousCents, changePct: percentChange(r.currentCents, r.previousCents) }))
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
}

export interface ProjectionInput {
  today: ISODate;
  currentBalanceCents: number;
  /** Médias mensais dos últimos meses completos (receitas recebidas / despesas). */
  avgIncomeCents: number;
  avgExpenseCents: number;
  /** Valores já agendados por mês (AAAA-MM-01): receitas e despesas pendentes, faturas em aberto. */
  scheduled: Record<ISODate, { incomeCents: number; expenseCents: number }>;
  months?: number;
}

export interface ProjectionRow {
  month: ISODate;
  incomeCents: number;
  expenseCents: number;
  endBalanceCents: number;
}

export const PROJECTION_ASSUMPTIONS = [
  "Receitas: o que já está agendado no mês ou, se for maior, a média recebida nos últimos 3 meses completos.",
  "Despesas: o que já está agendado (contas pendentes, parcelas e faturas) ou, se for maior, a média dos últimos 3 meses completos.",
  "Não considera rendimentos, reajustes, gastos inesperados nem novas dívidas.",
  "É uma estimativa para planejamento, não uma garantia de resultado.",
];

/** Projeção simples e explicável do saldo nos próximos meses. */
export function projectBalance(input: ProjectionInput): ProjectionRow[] {
  const n = input.months ?? 3;
  const rows: ProjectionRow[] = [];
  let balance = input.currentBalanceCents;
  const first = addMonths(startOfMonth(input.today), 1);
  for (let i = 0; i < n; i++) {
    const month = addMonths(first, i);
    const sch = input.scheduled[month] ?? { incomeCents: 0, expenseCents: 0 };
    const income = Math.max(sch.incomeCents, input.avgIncomeCents);
    const expense = Math.max(sch.expenseCents, input.avgExpenseCents);
    balance += income - expense;
    rows.push({ month, incomeCents: income, expenseCents: expense, endBalanceCents: balance });
  }
  return rows;
}

/** Média de uma lista de meses (inteiro, centavos). */
export function averageCents(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

export { monthsBetweenInclusive };
