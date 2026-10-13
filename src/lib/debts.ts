/**
 * Simulações de dívidas — todos os valores em centavos inteiros.
 *
 * HIPÓTESES (exibidas ao usuário em todas as simulações):
 *  1. Juros compostos mensais à taxa informada, constante durante todo o período.
 *  2. Juros calculados sobre o saldo do início de cada mês e arredondados ao centavo.
 *  3. Pagamento feito uma vez por mês, depois da incidência de juros.
 *  4. Não considera multas, mora, IOF, seguros, tarifas ou novas compras/dívidas.
 *  5. O saldo devedor de partida é o informado pelo usuário (pode diferir do valor
 *     de quitação calculado pelo credor).
 */

export const DEBT_ASSUMPTIONS = [
  "Juros compostos mensais à taxa informada, constante durante todo o período.",
  "Juros calculados sobre o saldo do início de cada mês e arredondados ao centavo.",
  "Um pagamento por mês, feito depois da incidência dos juros.",
  "Não considera multas, juros de mora, IOF, seguros, tarifas nem novas dívidas.",
  "Parte do saldo devedor informado por você, que pode diferir do valor de quitação do credor.",
];

export const DEBT_KIND_LABELS: Record<string, string> = {
  loan: "Empréstimo",
  credit_card: "Cartão de crédito (rotativo/parcelamento)",
  overdraft: "Cheque especial",
  financing: "Financiamento",
  personal: "Dívida com pessoa",
  other: "Outra",
};

export const MAX_SIM_MONTHS = 600; // 50 anos

/** Juros do mês: saldo × taxa (pontos-base / 10.000), arredondado ao centavo (meio para cima). */
export function monthlyInterest(balanceCents: number, rateBp: number): number {
  return Math.round((balanceCents * rateBp) / 10_000);
}

/** Converte "2,99" (% ao mês) em pontos-base (299). Aceita até 2 casas decimais. */
export function parseRateToBp(input: string): number | null {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  const bp = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return bp <= 100_000 ? bp : null;
}

export function formatRateBp(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.m.`;
}

/** Taxa anual equivalente aproximada, em % (só para exibição). */
export function annualRatePct(bp: number): number {
  return Math.round((Math.pow(1 + bp / 10_000, 12) - 1) * 1000) / 10;
}

export interface PayoffResult {
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
  /** Saldo ao fim de cada mês (índice 0 = após o 1º pagamento). */
  balances: number[];
  /** true se o pagamento não cobre os juros (a dívida nunca acaba). */
  neverPaysOff: boolean;
}

/** Quitação de uma dívida com pagamento mensal fixo, e um valor extra opcional no 1º mês. */
export function simulatePayoff(
  balanceCents: number,
  rateBp: number,
  monthlyPaymentCents: number,
  lumpSumCents = 0,
): PayoffResult {
  let balance = Math.max(0, balanceCents - lumpSumCents);
  let totalInterest = 0;
  let totalPaid = Math.min(lumpSumCents, balanceCents);
  const balances: number[] = [];
  if (balance === 0) return { months: 0, totalInterestCents: 0, totalPaidCents: totalPaid, balances, neverPaysOff: false };
  if (monthlyPaymentCents <= monthlyInterest(balance, rateBp)) {
    return { months: Infinity, totalInterestCents: Infinity, totalPaidCents: Infinity, balances, neverPaysOff: true };
  }
  for (let m = 0; m < MAX_SIM_MONTHS && balance > 0; m++) {
    const interest = monthlyInterest(balance, rateBp);
    totalInterest += interest;
    balance += interest;
    const pay = Math.min(monthlyPaymentCents, balance);
    balance -= pay;
    totalPaid += pay;
    balances.push(balance);
  }
  if (balance > 0) {
    return { months: Infinity, totalInterestCents: Infinity, totalPaidCents: Infinity, balances, neverPaysOff: true };
  }
  return { months: balances.length, totalInterestCents: totalInterest, totalPaidCents: totalPaid, balances, neverPaysOff: false };
}

export interface EarlyPayoffComparison {
  base: PayoffResult;
  withExtra: PayoffResult;
  monthsSaved: number | null;
  interestSavedCents: number | null;
}

/** Compara o plano atual com pagamento extra mensal e/ou valor à vista. */
export function compareEarlyPayoff(
  balanceCents: number,
  rateBp: number,
  monthlyPaymentCents: number,
  extraMonthlyCents: number,
  lumpSumCents: number,
): EarlyPayoffComparison {
  const base = simulatePayoff(balanceCents, rateBp, monthlyPaymentCents);
  const withExtra = simulatePayoff(balanceCents, rateBp, monthlyPaymentCents + extraMonthlyCents, lumpSumCents);
  const comparable = !base.neverPaysOff && !withExtra.neverPaysOff;
  return {
    base,
    withExtra,
    monthsSaved: comparable ? base.months - withExtra.months : null,
    interestSavedCents: comparable ? base.totalInterestCents - withExtra.totalInterestCents : null,
  };
}

export interface StrategyDebt {
  id: string;
  name: string;
  balanceCents: number;
  rateBp: number;
  minPaymentCents: number;
}

export type Strategy = "avalanche" | "snowball";

export interface StrategyResult {
  strategy: Strategy;
  feasible: boolean;
  months: number;
  totalInterestCents: number;
  /** Ordem em que as dívidas são quitadas. */
  payoffOrder: Array<{ id: string; name: string; month: number }>;
  /** Saldo total ao fim de cada mês. */
  totalBalances: number[];
  /** Primeiros meses do plano: quanto pagar em cada dívida. */
  schedule: Array<{ month: number; payments: Record<string, number> }>;
}

/**
 * Estratégias para várias dívidas com um orçamento mensal total:
 *  - avalanche: paga o mínimo de todas e o restante na de MAIOR juro (economiza mais juros);
 *  - bola de neve (snowball): o restante vai para a de MENOR saldo (vitórias rápidas).
 */
export function simulateStrategy(debts: StrategyDebt[], monthlyBudgetCents: number, strategy: Strategy, scheduleMonths = 12): StrategyResult {
  const state = debts.filter((d) => d.balanceCents > 0).map((d) => ({ ...d, balance: d.balanceCents }));
  const minTotal = state.reduce((a, d) => a + Math.min(d.minPaymentCents, d.balance), 0);
  const empty: StrategyResult = { strategy, feasible: false, months: 0, totalInterestCents: 0, payoffOrder: [], totalBalances: [], schedule: [] };
  if (state.length === 0) return { ...empty, feasible: true };
  if (monthlyBudgetCents < minTotal) return empty;

  const order = (a: (typeof state)[number], b: (typeof state)[number]) =>
    strategy === "avalanche" ? b.rateBp - a.rateBp || a.balance - b.balance : a.balance - b.balance || b.rateBp - a.rateBp;

  let totalInterest = 0;
  const payoffOrder: StrategyResult["payoffOrder"] = [];
  const totalBalances: number[] = [];
  const schedule: StrategyResult["schedule"] = [];

  for (let month = 1; month <= MAX_SIM_MONTHS; month++) {
    const active = state.filter((d) => d.balance > 0);
    if (active.length === 0) break;
    for (const d of active) {
      const i = monthlyInterest(d.balance, d.rateBp);
      d.balance += i;
      totalInterest += i;
    }
    let available = monthlyBudgetCents;
    const payments: Record<string, number> = {};
    for (const d of active) {
      const pay = Math.min(d.minPaymentCents, d.balance, available);
      d.balance -= pay;
      available -= pay;
      payments[d.id] = pay;
    }
    for (const d of [...active].sort(order)) {
      if (available <= 0) break;
      const pay = Math.min(d.balance, available);
      d.balance -= pay;
      available -= pay;
      payments[d.id] = (payments[d.id] ?? 0) + pay;
    }
    for (const d of active) if (d.balance === 0) payoffOrder.push({ id: d.id, name: d.name, month });
    totalBalances.push(state.reduce((a, d) => a + d.balance, 0));
    if (month <= scheduleMonths) schedule.push({ month, payments });

    // Saldo crescendo sem parar → orçamento não cobre os juros.
    if (month > 1 && totalBalances[month - 1] >= totalBalances[month - 2] && totalBalances[month - 1] > 0 && month > 24) {
      return { ...empty, totalBalances };
    }
  }
  const done = state.every((d) => d.balance === 0);
  return {
    strategy,
    feasible: done,
    months: done ? totalBalances.length : 0,
    totalInterestCents: totalInterest,
    payoffOrder,
    totalBalances,
    schedule,
  };
}
