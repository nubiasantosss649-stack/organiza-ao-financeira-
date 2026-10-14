/**
 * Datas de calendário no formato ISO "AAAA-MM-DD", sem fuso horário.
 * "Hoje" é calculado no fuso de São Paulo para evitar que lançamentos
 * feitos à noite caiam no dia seguinte (UTC).
 */

export const APP_TIME_ZONE = "America/Sao_Paulo";

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function todayISO(now: Date = new Date(), timeZone = APP_TIME_ZONE): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseISO(date: ISODate): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(date);
  if (!match || !isISODate(date)) throw new Error(`Data inválida: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Soma meses mantendo o dia; se o mês de destino for mais curto, usa o
 * último dia (31/01 + 1 mês = 28/02 ou 29/02).
 */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const { y, m, d } = parseISO(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return toISO(ny, nm, day);
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISO(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return toISO(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return toISO(y, m, daysInMonth(y, m));
}

/** Semana de domingo a sábado, como no calendário brasileiro. */
export function startOfWeek(date: ISODate): ISODate {
  const { y, m, d } = parseISO(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -weekday);
}

export function diffInDays(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Quantidade de meses de calendário de `from` até `to` (inclusive o mês atual). */
export function monthsBetweenInclusive(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}

export type PeriodKind = "day" | "week" | "month" | "year";

export function periodRange(kind: PeriodKind, ref: ISODate): { from: ISODate; to: ISODate } {
  switch (kind) {
    case "day":
      return { from: ref, to: ref };
    case "week": {
      const from = startOfWeek(ref);
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    case "year": {
      const { y } = parseISO(ref);
      return { from: toISO(y, 1, 1), to: toISO(y, 12, 31) };
    }
  }
}

export function shiftPeriod(kind: PeriodKind, ref: ISODate, step: number): ISODate {
  switch (kind) {
    case "day":
      return addDays(ref, step);
    case "week":
      return addDays(ref, step * 7);
    case "month":
      return addMonths(startOfMonth(ref), step);
    case "year":
      return addMonths(startOfMonth(ref), step * 12);
  }
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatDateBR(date: ISODate): string {
  const { y, m, d } = parseISO(date);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function formatMonthShort(date: ISODate): string {
  const { y, m } = parseISO(date);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}

export function formatMonthLong(date: ISODate): string {
  const { y, m } = parseISO(date);
  const name = MONTHS_LONG[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

export function formatPeriodLabel(kind: PeriodKind, ref: ISODate): string {
  const { from, to } = periodRange(kind, ref);
  switch (kind) {
    case "day":
      return formatDateBR(ref);
    case "week":
      return `${formatDateBR(from)} a ${formatDateBR(to)}`;
    case "month":
      return formatMonthLong(ref);
    case "year":
      return String(parseISO(ref).y);
  }
}

/** Instante atual em ms (componentes de servidor; isolado para manter a renderização previsível). */
export function nowMs(): number {
  return Date.now();
}
