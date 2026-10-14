/**
 * Dinheiro é sempre representado em CENTAVOS inteiros (number seguro até 2^53).
 * Nunca usamos ponto flutuante para somar ou dividir valores.
 */

export const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos como "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  assertCents(cents);
  // Divisão exata para exibição: inteiro / 100 vira um decimal com no máximo 2 casas.
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** Formata sem o símbolo: "1.234,56" (útil para preencher campos de formulário). */
export function formatDecimalBR(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${reaisStr},${centavos.toString().padStart(2, "0")}`;
}

/**
 * Converte texto digitado pelo usuário em centavos, sem usar float.
 * Aceita: "1.234,56", "1234,56", "1234.56", "R$ 10", "10,5", "-25,00".
 * Retorna null se o texto não for um valor válido.
 */
export function parseBRL(input: string): number | null {
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^R\$/i, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let fracPart = "";

  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal; o outro é separador de milhar.
    const decIdx = Math.max(lastComma, lastDot);
    const thousandSep = decIdx === lastComma ? "." : ",";
    intPart = s.slice(0, decIdx);
    fracPart = s.slice(decIdx + 1);
    if (intPart.includes(s[decIdx])) return null;
    if (!isValidThousands(intPart, thousandSep)) return null;
    intPart = intPart.split(thousandSep).join("");
  } else if (lastComma >= 0) {
    if (s.indexOf(",") !== lastComma) return null; // vírgula só pode ser decimal
    intPart = s.slice(0, lastComma);
    fracPart = s.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const dots = s.split(".").length - 1;
    const afterLast = s.slice(lastDot + 1);
    if (dots === 1 && afterLast.length !== 3) {
      // "1234.56" ou "10.5" → ponto decimal
      intPart = s.slice(0, lastDot);
      fracPart = afterLast;
    } else {
      // "1.234" ou "1.234.567" → separador de milhar
      if (!isValidThousands(s, ".")) return null;
      intPart = s.split(".").join("");
    }
  } else {
    intPart = s;
  }

  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart) || (fracPart !== "" && !/^\d{1,2}$/.test(fracPart))) return null;
  if (intPart.length > 12) return null;

  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

function isValidThousands(s: string, sep: string): boolean {
  const groups = s.split(sep);
  if (groups.length === 1) return /^\d+$/.test(s);
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Valor monetário inválido (esperado centavos inteiros): ${value}`);
  }
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total);
  return total;
}

/**
 * Divide um total em N parcelas inteiras. A diferença de centavos vai para
 * as primeiras parcelas, garantindo que a soma seja exatamente o total.
 * Ex.: 100,00 em 3x → 33,34 + 33,33 + 33,33.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  assertCents(totalCents);
  if (!Number.isInteger(count) || count < 1) throw new Error("Quantidade de parcelas inválida");
  if (totalCents < count) throw new Error("Valor menor que o número de parcelas");
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Porcentagem de `part` sobre `total`, arredondada para 1 casa. null se total = 0. */
export function percent(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part * 1000) / total) / 10;
}

/** Variação percentual de `previous` para `current`. null se não houver base. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 1000) / Math.abs(previous)) / 10;
}

/** Aplica um percentual inteiro (ex.: 25 = 25%) arredondando para o centavo mais próximo. */
export function applyPercent(cents: number, pct: number): number {
  assertCents(cents);
  return Math.round((cents * pct) / 100);
}
