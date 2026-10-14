import { addMonths, diffInDays, endOfMonth, monthsBetweenInclusive, parseISO, type ISODate } from "./dates";
import { assertCents, percent, percentChange, splitInstallments, sumCents } from "./money";

export type TxKind = "income" | "expense";
export type TxStatus = "paid" | "pending";

// ---------------------------------------------------------------------------
// Geração de lançamentos parcelados e recorrentes
// ---------------------------------------------------------------------------

export type RepeatMode = "single" | "installments" | "recurring";

export interface SeriesInput {
  amountCents: number; // em parcelado: valor TOTAL da compra; nos demais: valor de cada lançamento
  occurredOn: ISODate;
  status: TxStatus;
  description: string;
  mode: RepeatMode;
  count?: number; // parcelas (2–120) ou meses de recorrência (2–60)
}

export interface SeriesItem {
  amountCents: number;
  occurredOn: ISODate;
  status: TxStatus;
  description: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
}

export const MAX_INSTALLMENTS = 120;
export const MAX_RECURRENCES = 60;

export function buildSeries(input: SeriesInput): SeriesItem[] {
  assertCents(input.amountCents);
  if (input.amountCents <= 0) throw new Error("O valor deve ser maior que zero");
  const anchorDay = parseISO(input.occurredOn).d;

  if (input.mode === "single") {
    return [{
      amountCents: input.amountCents,
      occurredOn: input.occurredOn,
      status: input.status,
      description: input.description,
      installmentNumber: null,
      installmentTotal: null,
    }];
  }

  const count = input.count ?? 0;
  if (input.mode === "installments") {
    if (!Number.isInteger(count) || count < 2 || count > MAX_INSTALLMENTS) {
      throw new Error(`Parcelas devem estar entre 2 e ${MAX_INSTALLMENTS}`);
    }
    const parts = splitInstallments(input.amountCents, count);
    return parts.map((amount, i) => ({
      amountCents: amount,
      occurredOn: addMonths(input.occurredOn, i, anchorDay),
      // Apenas a 1ª parcela herda o status informado; as futuras ficam pendentes.
      status: i === 0 ? input.status : "pending",
      description: `${input.description} (${i + 1}/${count})`,
      installmentNumber: i + 1,
      installmentTotal: count,
    }));
  }

  if (!Number.isInteger(count) || count < 2 || count > MAX_RECURRENCES) {
    throw new Error(`Repetições devem estar entre 2 e ${MAX_RECURRENCES} meses`);
  }
  return Array.from({ length: count }, (_, i) => ({
    amountCents: input.amountCents,
    occurredOn: addMonths(input.occurredOn, i, anchorDay),
    status: i === 0 ? input.status : "pending",
    description: input.description,
    installmentNumber: null,
    installmentTotal: null,
  }));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface MonthTotals {
  month: ISODate;
  incomePaidCents: number;
  expensePaidCents: number;
  incomePendingCents: number;
  expensePendingCents: number;
}

export interface PendingExpense {
  amountCents: number;
  occurredOn: ISODate;
}

export interface DashboardInput {
  today: ISODate;
  /** Mês de referência (qualquer dia dentro dele). */
  month: ISODate;
  accountBalancesCents: number[];
  currentMonth: MonthTotals;
  previousMonth: MonthTotals;
  /** Despesas pendentes com vencimento até o fim do mês de referência (inclui vencidas de meses anteriores). */
  pendingExpenses: PendingExpense[];
}

export interface DashboardSummary {
  totalBalanceCents: number;
  incomeCents: number;
  expenseCents: number;
  monthResultCents: number;
  toPayCents: number;
  toPayCount: number;
  overdueCents: number;
  overdueCount: number;
  availableCents: number;
  savingsRatePct: number | null;
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  previousIncomeCents: number;
  previousExpenseCents: number;
}

/**
 * Hipóteses (exibidas na interface):
 *  - Saldo total: saldo inicial das contas + receitas recebidas − despesas pagas.
 *  - Receitas/Despesas do mês: somente o que já foi recebido/pago no mês.
 *  - A pagar: despesas pendentes que vencem de hoje até o fim do mês.
 *  - Vencidas: despesas pendentes com vencimento anterior a hoje.
 *  - Disponível: saldo total − (a pagar + vencidas).
 */
export function computeDashboard(input: DashboardInput): DashboardSummary {
  const monthEnd = endOfMonth(input.month);
  const totalBalanceCents = sumCents(input.accountBalancesCents);

  let toPayCents = 0;
  let toPayCount = 0;
  let overdueCents = 0;
  let overdueCount = 0;
  for (const p of input.pendingExpenses) {
    assertCents(p.amountCents);
    if (p.occurredOn < input.today) {
      overdueCents += p.amountCents;
      overdueCount++;
    } else if (p.occurredOn <= monthEnd) {
      toPayCents += p.amountCents;
      toPayCount++;
    }
  }

  const incomeCents = input.currentMonth.incomePaidCents;
  const expenseCents = input.currentMonth.expensePaidCents;
  const monthResultCents = incomeCents - expenseCents;

  return {
    totalBalanceCents,
    incomeCents,
    expenseCents,
    monthResultCents,
    toPayCents,
    toPayCount,
    overdueCents,
    overdueCount,
    availableCents: totalBalanceCents - toPayCents - overdueCents,
    savingsRatePct: incomeCents > 0 ? percent(monthResultCents, incomeCents) : null,
    incomeChangePct: percentChange(incomeCents, input.previousMonth.incomePaidCents),
    expenseChangePct: percentChange(expenseCents, input.previousMonth.expensePaidCents),
    previousIncomeCents: input.previousMonth.incomePaidCents,
    previousExpenseCents: input.previousMonth.expensePaidCents,
  };
}

// ---------------------------------------------------------------------------
// Orçamentos
// ---------------------------------------------------------------------------

export type BudgetState = "ok" | "warning" | "over";

export function budgetStatus(spentCents: number, limitCents: number) {
  assertCents(spentCents);
  assertCents(limitCents);
  const pct = limitCents > 0 ? percent(spentCents, limitCents) ?? 0 : 0;
  const state: BudgetState = spentCents > limitCents ? "over" : pct >= 80 ? "warning" : "ok";
  return {
    pct,
    state,
    remainingCents: limitCents - spentCents,
    overCents: Math.max(0, spentCents - limitCents),
  };
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export interface GoalPlan {
  remainingCents: number;
  progressPct: number;
  completed: boolean;
  /** Meses de calendário restantes contando o atual; null sem prazo. */
  monthsLeft: number | null;
  /** Quanto guardar por mês para atingir no prazo (arredondado para cima). */
  monthlyNeededCents: number | null;
  overdue: boolean;
}

export function goalPlan(targetCents: number, savedCents: number, targetDate: ISODate | null, today: ISODate): GoalPlan {
  assertCents(targetCents);
  assertCents(savedCents);
  const remainingCents = Math.max(0, targetCents - savedCents);
  const progressPct = Math.min(100, Math.max(0, percent(savedCents, targetCents) ?? 0));
  const completed = savedCents >= targetCents;

  if (!targetDate) {
    return { remainingCents, progressPct, completed, monthsLeft: null, monthlyNeededCents: null, overdue: false };
  }
  const overdue = !completed && diffInDays(today, targetDate) < 0;
  const monthsLeft = Math.max(0, monthsBetweenInclusive(today, targetDate));
  const monthlyNeededCents = completed
    ? 0
    : monthsLeft > 0
      ? Math.ceil(remainingCents / monthsLeft)
      : remainingCents;
  return { remainingCents, progressPct, completed, monthsLeft, monthlyNeededCents, overdue };
}

// ---------------------------------------------------------------------------
// Limites de plano (espelha a regra aplicada no banco)
// ---------------------------------------------------------------------------

export function canCreate(limit: number | null | undefined, used: number): boolean {
  if (limit === null || limit === undefined) return true;
  return used < limit;
}
