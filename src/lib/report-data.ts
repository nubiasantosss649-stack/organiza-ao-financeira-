import "server-only";
import { createClient } from "@/lib/supabase/server";
import { categoryTotals, listAccounts, monthlySummary, openCardInvoices } from "@/lib/queries";
import { addMonths, endOfMonth, startOfMonth, todayISO, type ISODate } from "@/lib/dates";
import { averageCents, compareCategories, detectRecurring, projectBalance } from "@/lib/reports";

/** Dados dos relatórios avançados de um mês (somente do usuário logado, via RLS). */
export async function loadReport(month: ISODate) {
  const supabase = await createClient();
  const today = todayISO();
  const prev = addMonths(month, -1);
  const thisMonth = startOfMonth(today);
  const horizon = endOfMonth(addMonths(thisMonth, 3));

  const [months12, current, previous, accounts, recentRes, scheduledRes, invoices] = await Promise.all([
    monthlySummary(addMonths(month, -11), month),
    categoryTotals(month, endOfMonth(month)),
    categoryTotals(prev, endOfMonth(prev)),
    listAccounts({ includeArchived: true }),
    supabase.from("transactions").select("description, amount_cents, occurred_on, kind").eq("kind", "expense")
      .gte("occurred_on", addMonths(thisMonth, -5)).lte("occurred_on", today).order("occurred_on", { ascending: false }).limit(3000),
    supabase.from("transactions").select("amount_cents, occurred_on, kind").eq("status", "pending").is("card_id", null)
      .gte("occurred_on", addMonths(thisMonth, 1)).lte("occurred_on", horizon).limit(3000),
    openCardInvoices(horizon),
  ]);

  const recurring = detectRecurring(
    (recentRes.data ?? []).map((t) => ({ description: t.description, amountCents: Number(t.amount_cents), date: t.occurred_on, kind: t.kind })),
    today,
  );

  // Médias dos 3 últimos meses COMPLETOS (antes do mês atual).
  const lastFull = await monthlySummary(addMonths(thisMonth, -3), addMonths(thisMonth, -1));
  const scheduled: Record<string, { incomeCents: number; expenseCents: number }> = {};
  const add = (date: string, kind: "income" | "expense", cents: number) => {
    const key = startOfMonth(date);
    scheduled[key] ??= { incomeCents: 0, expenseCents: 0 };
    if (kind === "income") scheduled[key].incomeCents += cents;
    else scheduled[key].expenseCents += cents;
  };
  (scheduledRes.data ?? []).forEach((t) => add(t.occurred_on, t.kind, Number(t.amount_cents)));
  invoices.filter((i) => i.invoice_due_on > endOfMonth(thisMonth)).forEach((i) => add(i.invoice_due_on, "expense", i.remaining_cents));

  const projection = projectBalance({
    today,
    currentBalanceCents: accounts.reduce((a, x) => a + Number(x.balance_cents), 0),
    avgIncomeCents: averageCents(lastFull.map((m) => m.incomePaidCents)),
    avgExpenseCents: averageCents(lastFull.map((m) => m.expensePaidCents)),
    scheduled,
  });

  const key = (c: { category_id: string | null }) => c.category_id ?? "none";
  return {
    months12,
    current,
    comparison: compareCategories(
      current.map((c) => ({ key: key(c), name: c.name, totalCents: c.total_cents })),
      previous.map((c) => ({ key: key(c), name: c.name, totalCents: c.total_cents })),
    ),
    recurring,
    projection,
    upcoming: invoices,
  };
}
