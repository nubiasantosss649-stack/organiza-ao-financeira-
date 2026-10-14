import { describe, expect, it } from "vitest";
import { invoiceClosingDate, invoiceDueDate, invoiceStatus } from "@/lib/cards";
import {
  annualRatePct, compareEarlyPayoff, monthlyInterest, parseRateToBp, simulatePayoff, simulateStrategy,
} from "@/lib/debts";

describe("faturas do cartão", () => {
  it("compra antes do fechamento entra na fatura do mês; no fechamento ou depois, na seguinte", () => {
    // fecha dia 3, vence dia 10
    expect(invoiceDueDate(3, 10, "2026-10-02")).toBe("2026-10-10");
    expect(invoiceDueDate(3, 10, "2026-10-03")).toBe("2026-11-10");
    expect(invoiceDueDate(3, 10, "2026-10-25")).toBe("2026-11-10");
  });
  it("vencimento antes do fechamento cai no mês seguinte ao fechamento", () => {
    // fecha dia 25, vence dia 5
    expect(invoiceDueDate(25, 5, "2026-10-24")).toBe("2026-11-05");
    expect(invoiceDueDate(25, 5, "2026-10-26")).toBe("2026-12-05");
    expect(invoiceDueDate(25, 5, "2026-12-30")).toBe("2027-02-05");
  });
  it("dias inexistentes usam o último dia do mês", () => {
    expect(invoiceDueDate(31, 10, "2026-02-27")).toBe("2026-03-10"); // fecha 28/02
    expect(invoiceDueDate(31, 10, "2026-02-28")).toBe("2026-04-10");
    expect(invoiceDueDate(5, 31, "2026-01-10")).toBe("2026-02-28");
  });
  it("calcula a data de fechamento e o status", () => {
    expect(invoiceClosingDate(25, 5, "2026-11-05")).toBe("2026-10-25");
    expect(invoiceClosingDate(3, 10, "2026-11-10")).toBe("2026-11-03");
    expect(invoiceStatus(1000, 0, "2026-11-03", "2026-11-10", "2026-11-01")).toBe("open");
    expect(invoiceStatus(1000, 0, "2026-11-03", "2026-11-10", "2026-11-05")).toBe("closed");
    expect(invoiceStatus(1000, 500, "2026-11-03", "2026-11-10", "2026-11-05")).toBe("partial");
    expect(invoiceStatus(1000, 0, "2026-11-03", "2026-11-10", "2026-11-11")).toBe("overdue");
    expect(invoiceStatus(1000, 1000, "2026-11-03", "2026-11-10", "2026-12-01")).toBe("paid");
  });
});

describe("dívidas", () => {
  it("converte taxas e calcula juros ao centavo", () => {
    expect(parseRateToBp("2,99")).toBe(299);
    expect(parseRateToBp("10")).toBe(1000);
    expect(parseRateToBp("1.5%")).toBe(150);
    expect(parseRateToBp("abc")).toBeNull();
    expect(parseRateToBp("1,234")).toBeNull();
    expect(monthlyInterest(100000, 299)).toBe(2990);
    expect(monthlyInterest(333, 150)).toBe(5); // 4,995 → 5
    expect(annualRatePct(100)).toBe(12.7);
  });

  it("quitação sem juros é divisão simples", () => {
    const r = simulatePayoff(100000, 0, 25000);
    expect(r.months).toBe(4);
    expect(r.totalInterestCents).toBe(0);
    expect(r.totalPaidCents).toBe(100000);
  });

  it("quitação com juros soma exatamente pagamentos = saldo + juros", () => {
    const r = simulatePayoff(500000, 299, 50000);
    expect(r.neverPaysOff).toBe(false);
    expect(r.totalPaidCents).toBe(500000 + r.totalInterestCents);
    expect(r.balances.at(-1)).toBe(0);
    expect(r.months).toBe(13); // a parcela que quita em 12 meses seria ~R$ 501,17
  });

  it("detecta pagamento que não cobre os juros", () => {
    expect(simulatePayoff(100000, 1000, 10000).neverPaysOff).toBe(true);
  });

  it("pagamento extra e à vista reduzem prazo e juros", () => {
    const c = compareEarlyPayoff(500000, 299, 50000, 20000, 100000);
    expect(c.monthsSaved!).toBeGreaterThan(0);
    expect(c.interestSavedCents!).toBeGreaterThan(0);
    expect(c.withExtra.totalPaidCents).toBe(500000 + c.withExtra.totalInterestCents);
  });

  const debts = [
    { id: "a", name: "Cartão", balanceCents: 300000, rateBp: 1200, minPaymentCents: 15000 },
    { id: "b", name: "Empréstimo", balanceCents: 100000, rateBp: 200, minPaymentCents: 10000 },
  ];

  it("avalanche economiza mais juros que bola de neve; ambas quitam tudo", () => {
    const av = simulateStrategy(debts, 80000, "avalanche");
    const sb = simulateStrategy(debts, 80000, "snowball");
    expect(av.feasible && sb.feasible).toBe(true);
    expect(av.totalInterestCents).toBeLessThanOrEqual(sb.totalInterestCents);
    expect(av.payoffOrder[0].id).toBe("a");
    expect(sb.payoffOrder[0].id).toBe("b");
    expect(av.totalBalances.at(-1)).toBe(0);
    for (const m of av.schedule) {
      expect(Object.values(m.payments).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(80000);
    }
  });

  it("orçamento menor que os mínimos é inviável", () => {
    expect(simulateStrategy(debts, 20000, "avalanche").feasible).toBe(false);
  });

  it("orçamento que não cobre os juros é inviável", () => {
    const r = simulateStrategy([{ id: "x", name: "X", balanceCents: 1000000, rateBp: 1500, minPaymentCents: 10000 }], 100000, "avalanche");
    expect(r.feasible).toBe(false);
  });
});
