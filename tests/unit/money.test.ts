import { describe, expect, it } from "vitest";
import {
  applyPercent,
  formatBRL,
  formatDecimalBR,
  parseBRL,
  percent,
  percentChange,
  splitInstallments,
  sumCents,
} from "@/lib/money";

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 10", 1000],
    ["R$10,5", 1050],
    ["0,01", 1],
    [",99", 99],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["1,234.56", 123456],
    ["-25,00", -2500],
    ["  42  ", 4200],
  ])("%s → %d centavos", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "12,345", "1.23.4", "1.2345,00", "R$", "--1", "9999999999999"])(
    "rejeita %s",
    (input) => {
      expect(parseBRL(input)).toBeNull();
    },
  );

  it("não sofre erros de ponto flutuante", () => {
    // 0,1 + 0,2 em float = 0,30000000000000004
    expect(sumCents([parseBRL("0,10")!, parseBRL("0,20")!])).toBe(30);
    expect(parseBRL("19,90")).toBe(1990);
    expect(parseBRL("1,15")).toBe(115); // 1.15*100 = 114.99999999999999 em float
  });
});

describe("formatação", () => {
  it("formata em reais", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(-990)).toBe("-R$ 9,90");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });
  it("formata decimal para formulários", () => {
    expect(formatDecimalBR(123456789)).toBe("1.234.567,89");
    expect(formatDecimalBR(5)).toBe("0,05");
    expect(formatDecimalBR(-100)).toBe("-1,00");
  });
  it("recusa valores não inteiros", () => {
    expect(() => formatBRL(1.5)).toThrow();
    expect(() => sumCents([1, 0.1])).toThrow();
  });
});

describe("splitInstallments", () => {
  it("distribui centavos restantes nas primeiras parcelas e soma exatamente o total", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10001, 2)).toEqual([5001, 5000]);
    expect(splitInstallments(99999, 12).reduce((a, b) => a + b, 0)).toBe(99999);
  });
  it("valida entradas", () => {
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(2, 3)).toThrow();
  });
});

describe("percentuais", () => {
  it("calcula porcentagem e variação com 1 casa", () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBeNull();
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(50, 0)).toBeNull();
  });
  it("aplica percentual arredondando ao centavo (exemplo do assistente)", () => {
    expect(applyPercent(48000, 25)).toBe(12000);
    expect(applyPercent(333, 25)).toBe(83);
  });
});
