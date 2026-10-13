import { describe, expect, it } from "vitest";
import { budgetStatus, buildSeries, canCreate, computeDashboard, goalPlan } from "@/lib/finance";
import { addMonths, endOfMonth, periodRange, shiftPeriod, startOfWeek, todayISO } from "@/lib/dates";

describe("datas", () => {
  it("soma meses respeitando fim de mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("mantém o dia âncora em séries (31 → 28 → 31)", () => {
    expect(addMonths("2026-01-31", 2, 31)).toBe("2026-03-31");
  });
  it("calcula períodos", () => {
    expect(periodRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("year", "2026-07-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(startOfWeek("2026-10-15")).toBe("2026-10-11"); // quinta → domingo
    expect(periodRange("week", "2026-10-15")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(shiftPeriod("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(endOfMonth("2026-12-05")).toBe("2026-12-31");
  });
  it("usa o fuso de São Paulo para 'hoje'", () => {
    // 02:00 UTC de 14/10 ainda é 13/10 em São Paulo (UTC−3)
    expect(todayISO(new Date("2026-10-14T02:00:00Z"))).toBe("2026-10-13");
  });
});

describe("buildSeries", () => {
  it("parcelado: divide o total, datas mensais, só a 1ª herda o status", () => {
    const s = buildSeries({
      amountCents: 100000, occurredOn: "2026-01-31", status: "paid",
      description: "Notebook", mode: "installments", count: 3,
    });
    expect(s.map((x) => x.amountCents)).toEqual([33334, 33333, 33333]);
    expect(s.map((x) => x.occurredOn)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(s.map((x) => x.status)).toEqual(["paid", "pending", "pending"]);
    expect(s[1].description).toBe("Notebook (2/3)");
    expect(s.reduce((a, b) => a + b.amountCents, 0)).toBe(100000);
  });
  it("recorrente: repete o mesmo valor por N meses", () => {
    const s = buildSeries({
      amountCents: 4990, occurredOn: "2026-10-05", status: "pending",
      description: "Academia", mode: "recurring", count: 12,
    });
    expect(s).toHaveLength(12);
    expect(new Set(s.map((x) => x.amountCents))).toEqual(new Set([4990]));
    expect(s[11].occurredOn).toBe("2027-09-05");
    expect(s.every((x) => x.installmentNumber === null)).toBe(true);
  });
  it("valida limites", () => {
    expect(() => buildSeries({ amountCents: 100, occurredOn: "2026-01-01", status: "paid", description: "x", mode: "installments", count: 1 })).toThrow();
    expect(() => buildSeries({ amountCents: 100, occurredOn: "2026-01-01", status: "paid", description: "x", mode: "recurring", count: 61 })).toThrow();
    expect(() => buildSeries({ amountCents: 0, occurredOn: "2026-01-01", status: "paid", description: "x", mode: "single" })).toThrow();
  });
});

describe("computeDashboard", () => {
  const base = {
    today: "2026-10-13",
    month: "2026-10-01",
    accountBalancesCents: [150000, -2000, 30010],
    currentMonth: { month: "2026-10-01", incomePaidCents: 500000, expensePaidCents: 320055, incomePendingCents: 0, expensePendingCents: 0 },
    previousMonth: { month: "2026-09-01", incomePaidCents: 500000, expensePaidCents: 400000, incomePendingCents: 0, expensePendingCents: 0 },
    pendingExpenses: [
      { amountCents: 12000, occurredOn: "2026-09-20" }, // vencida (mês anterior)
      { amountCents: 5000, occurredOn: "2026-10-12" },  // vencida
      { amountCents: 8000, occurredOn: "2026-10-13" },  // vence hoje → a pagar
      { amountCents: 9900, occurredOn: "2026-10-31" },  // a pagar
      { amountCents: 7777, occurredOn: "2026-11-01" },  // próximo mês: ignorada
    ],
  };

  it("calcula saldo, a pagar, vencidas e disponível em centavos", () => {
    const r = computeDashboard(base);
    expect(r.totalBalanceCents).toBe(178010);
    expect(r.overdueCents).toBe(17000);
    expect(r.overdueCount).toBe(2);
    expect(r.toPayCents).toBe(17900);
    expect(r.toPayCount).toBe(2);
    expect(r.availableCents).toBe(178010 - 17000 - 17900);
    expect(r.monthResultCents).toBe(179945);
  });

  it("compara com o mês anterior", () => {
    const r = computeDashboard(base);
    expect(r.incomeChangePct).toBe(0);
    expect(r.expenseChangePct).toBe(-20);
    expect(r.savingsRatePct).toBe(36);
  });

  it("sem receitas não calcula taxa de economia nem variação sem base", () => {
    const r = computeDashboard({
      ...base,
      currentMonth: { ...base.currentMonth, incomePaidCents: 0 },
      previousMonth: { ...base.previousMonth, incomePaidCents: 0, expensePaidCents: 0 },
    });
    expect(r.savingsRatePct).toBeNull();
    expect(r.incomeChangePct).toBeNull();
    expect(r.expenseChangePct).toBeNull();
  });
});

describe("orçamentos", () => {
  it("classifica uso", () => {
    expect(budgetStatus(5000, 10000)).toMatchObject({ pct: 50, state: "ok", remainingCents: 5000 });
    expect(budgetStatus(8000, 10000).state).toBe("warning");
    expect(budgetStatus(10001, 10000)).toMatchObject({ state: "over", overCents: 1 });
  });
});

describe("metas", () => {
  it("calcula quanto guardar por mês (arredonda para cima)", () => {
    const p = goalPlan(500000, 100000, "2027-03-31", "2026-10-13");
    expect(p.monthsLeft).toBe(6); // out, nov, dez, jan, fev, mar
    expect(p.monthlyNeededCents).toBe(66667); // 400000 / 6 = 66666,67 → 66667
    expect(p.progressPct).toBe(20);
    expect(p.overdue).toBe(false);
  });
  it("meta sem prazo e meta concluída", () => {
    expect(goalPlan(1000, 0, null, "2026-10-13").monthlyNeededCents).toBeNull();
    const done = goalPlan(1000, 1500, "2026-01-01", "2026-10-13");
    expect(done).toMatchObject({ completed: true, remainingCents: 0, progressPct: 100, overdue: false, monthlyNeededCents: 0 });
  });
  it("meta com prazo vencido", () => {
    const p = goalPlan(1000, 200, "2026-09-30", "2026-10-13");
    expect(p.overdue).toBe(true);
    expect(p.monthlyNeededCents).toBe(800);
  });
});

describe("limites de plano", () => {
  it("null significa ilimitado", () => {
    expect(canCreate(null, 999)).toBe(true);
    expect(canCreate(2, 1)).toBe(true);
    expect(canCreate(2, 2)).toBe(false);
  });
});
