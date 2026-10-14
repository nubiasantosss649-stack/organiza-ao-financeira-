import { addMonths, daysInMonth, parseISO, startOfMonth, toISO, type ISODate } from "./dates";

/** Data de um dia do mês, usando o último dia quando o mês é mais curto. */
function dayInMonth(monthStart: ISODate, day: number): ISODate {
  const { y, m } = parseISO(monthStart);
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
}

/**
 * Vencimento da fatura em que cai uma compra (espelha private.card_invoice_due no banco).
 * Compras antes do dia de fechamento entram na fatura que fecha no próprio mês;
 * no dia do fechamento ou depois, na seguinte.
 */
export function invoiceDueDate(closingDay: number, dueDay: number, purchaseDate: ISODate): ISODate {
  const month = startOfMonth(purchaseDate);
  const closing = dayInMonth(month, closingDay);
  const closeMonth = purchaseDate < closing ? month : addMonths(month, 1);
  const dueMonth = dueDay > closingDay ? closeMonth : addMonths(closeMonth, 1);
  return dayInMonth(dueMonth, dueDay);
}

/** Data de fechamento da fatura que vence em `dueOn`. */
export function invoiceClosingDate(closingDay: number, dueDay: number, dueOn: ISODate): ISODate {
  const dueMonth = startOfMonth(dueOn);
  const closeMonth = dueDay > closingDay ? dueMonth : addMonths(dueMonth, -1);
  return dayInMonth(closeMonth, closingDay);
}

export type InvoiceStatus = "open" | "closed" | "paid" | "overdue" | "partial";

export function invoiceStatus(
  totalCents: number,
  paidCents: number,
  closingOn: ISODate,
  dueOn: ISODate,
  today: ISODate,
): InvoiceStatus {
  const remaining = totalCents - paidCents;
  if (remaining <= 0) return "paid";
  if (today < closingOn) return "open";
  if (today > dueOn) return "overdue";
  return paidCents > 0 ? "partial" : "closed";
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  partial: "Paga em parte",
  paid: "Paga",
  overdue: "Vencida",
};
