import "server-only";
import { createClient } from "@/lib/supabase/server";
import { budgetSpending, categoryTotals, listAccounts, listActiveBudgets, listCategories, listGoals, monthlySummary, openCardInvoices } from "@/lib/queries";
import { addMonths, endOfMonth, startOfMonth, todayISO } from "@/lib/dates";
import { detectRecurring } from "@/lib/reports";
import { buildFinancialSnapshot } from "./context";

/** Monta o resumo agregado dos dados do usuário logado (RLS garante que são só dele). */
export async function gatherSnapshot() {
  const supabase = await createClient();
  const today = todayISO();
  const month = startOfMonth(today);
  const prev = addMonths(month, -1);

  const [accounts, months, current, previous, budgets, categories, goals, debtsRes, pendingRes, invoices, recentRes] = await Promise.all([
    listAccounts({ includeArchived: true }),
    monthlySummary(addMonths(month, -2), month),
    categoryTotals(month, endOfMonth(month)),
    categoryTotals(prev, endOfMonth(prev)),
    listActiveBudgets(),
    listCategories({ includeArchived: true }),
    listGoals("active"),
    supabase.from("debt_summaries").select("name, remaining_cents, monthly_rate_bp, installment_cents, status").eq("status", "active"),
    supabase.from("transactions").select("amount_cents, occurred_on").eq("kind", "expense").eq("status", "pending").lte("occurred_on", endOfMonth(month)).limit(1000),
    openCardInvoices(endOfMonth(month)),
    supabase.from("transactions").select("description, amount_cents, occurred_on, kind").eq("kind", "expense")
      .gte("occurred_on", addMonths(month, -5)).order("occurred_on", { ascending: false }).limit(3000),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const pending = [
    ...(pendingRes.data ?? []).map((p) => ({ amount: Number(p.amount_cents), date: p.occurred_on as string })),
    ...invoices.map((i) => ({ amount: i.remaining_cents, date: i.invoice_due_on })),
  ];

  return buildFinancialSnapshot({
    today,
    totalBalanceCents: accounts.reduce((a, x) => a + Number(x.balance_cents), 0),
    months: months.map((m) => ({ month: m.month, incomeCents: m.incomePaidCents, expenseCents: m.expensePaidCents })),
    categoriesCurrent: current.map((c) => ({ name: c.name, totalCents: c.total_cents })),
    categoriesPrevious: previous.map((c) => ({ name: c.name, totalCents: c.total_cents })),
    pendingBillsCents: pending.filter((p) => p.date >= today).reduce((a, p) => a + p.amount, 0),
    overdueBillsCents: pending.filter((p) => p.date < today).reduce((a, p) => a + p.amount, 0),
    budgets: budgets.filter((b) => b.is_active).map((b) => ({
      name: b.category_id ? catName.get(b.category_id) ?? "Categoria" : "Orçamento geral",
      limitCents: Number(b.amount_cents),
      spentCents: budgetSpending(b, current),
    })),
    goals: goals.map((g) => ({ name: g.name, targetCents: g.target_cents, savedCents: g.saved_cents, targetDate: g.target_date })),
    debts: (debtsRes.data ?? []).map((d) => ({
      name: d.name as string,
      remainingCents: Number(d.remaining_cents),
      monthlyRatePct: Number(d.monthly_rate_bp) / 100,
      installmentCents: d.installment_cents === null ? null : Number(d.installment_cents),
    })),
    recurring: detectRecurring(
      (recentRes.data ?? []).map((t) => ({ description: t.description, amountCents: Number(t.amount_cents), date: t.occurred_on, kind: t.kind })),
      today,
    ).map((r) => ({ name: r.name, typicalCents: r.typicalCents })),
  });
}
