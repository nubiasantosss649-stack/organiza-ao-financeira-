import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AccountBalance, Budget, Category, GoalProgress } from "@/lib/types";
import type { MonthTotals } from "@/lib/finance";
import { isISODate, todayISO, type ISODate } from "@/lib/dates";

/** Lê "AAAA-MM" de um parâmetro de URL e retorna o 1º dia do mês, ou o mês atual. */
export function monthParam(value: string | string[] | undefined): ISODate {
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && isISODate(`${value}-01`)) return `${value}-01`;
  return `${todayISO().slice(0, 7)}-01`;
}

export async function listAccounts(opts: { includeArchived?: boolean } = {}): Promise<AccountBalance[]> {
  const supabase = await createClient();
  let q = supabase
    .from("account_balances")
    .select("id, name, type, color, archived_at, initial_balance_cents, balance_cents")
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error("Falha ao carregar contas.");
  return (data ?? []) as AccountBalance[];
}

export async function listCategories(opts: { includeArchived?: boolean } = {}): Promise<Category[]> {
  const supabase = await createClient();
  let q = supabase.from("categories").select("id, name, kind, color, icon, is_default, archived_at").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error("Falha ao carregar categorias.");
  return (data ?? []) as Category[];
}

export async function monthlySummary(from: ISODate, to: ISODate): Promise<MonthTotals[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("monthly_summary", { p_from: from, p_to: to });
  if (error) throw new Error("Falha ao carregar resumo mensal.");
  return (data ?? []).map((r: Record<string, string | number>) => ({
    month: String(r.month),
    incomePaidCents: Number(r.income_paid_cents),
    expensePaidCents: Number(r.expense_paid_cents),
    incomePendingCents: Number(r.income_pending_cents),
    expensePendingCents: Number(r.expense_pending_cents),
  }));
}

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  color: string;
  icon: string;
  total_cents: number;
  paid_cents: number;
}

export async function categoryTotals(from: ISODate, to: ISODate, kind: "income" | "expense" = "expense"): Promise<CategoryTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("category_totals", { p_from: from, p_to: to, p_kind: kind });
  if (error) throw new Error("Falha ao carregar gastos por categoria.");
  return (data ?? []).map((r: Record<string, string | number | null>) => ({
    category_id: (r.category_id as string | null) ?? null,
    name: String(r.name),
    color: String(r.color),
    icon: String(r.icon),
    total_cents: Number(r.total_cents),
    paid_cents: Number(r.paid_cents),
  }));
}

export async function listActiveBudgets(): Promise<Budget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, category_id, amount_cents, is_active")
    .order("created_at");
  if (error) throw new Error("Falha ao carregar orçamentos.");
  return (data ?? []) as Budget[];
}

export async function listGoals(status?: "active" | "completed" | "archived"): Promise<GoalProgress[]> {
  const supabase = await createClient();
  let q = supabase.from("goal_progress").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error("Falha ao carregar metas.");
  return (data ?? []).map((g) => ({ ...g, saved_cents: Number(g.saved_cents), target_cents: Number(g.target_cents) })) as GoalProgress[];
}

/** Gasto do mês usado em cada orçamento (despesas pagas + pendentes do mês). */
export function budgetSpending(budget: Budget, totals: CategoryTotal[]): number {
  if (budget.category_id === null) return totals.reduce((acc, t) => acc + t.total_cents, 0);
  return totals.find((t) => t.category_id === budget.category_id)?.total_cents ?? 0;
}

export interface CardSummary {
  id: string;
  name: string;
  limit_cents: number;
  closing_day: number;
  due_day: number;
  color: string;
  archived_at: string | null;
  used_cents: number;
}

export async function listCards(opts: { includeArchived?: boolean } = {}): Promise<CardSummary[]> {
  const supabase = await createClient();
  let q = supabase.from("card_summaries").select("id, name, limit_cents, closing_day, due_day, color, archived_at, used_cents").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error("Falha ao carregar cartões.");
  return (data ?? []).map((c) => ({ ...c, limit_cents: Number(c.limit_cents), used_cents: Number(c.used_cents) })) as CardSummary[];
}

export interface OpenInvoice {
  card_id: string;
  card_name: string;
  invoice_due_on: ISODate;
  remaining_cents: number;
}

export async function openCardInvoices(until: ISODate): Promise<OpenInvoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_card_invoices", { p_until: until });
  if (error) throw new Error("Falha ao carregar faturas.");
  return (data ?? []).map((r: Record<string, string | number>) => ({
    card_id: String(r.card_id),
    card_name: String(r.card_name),
    invoice_due_on: String(r.invoice_due_on),
    remaining_cents: Number(r.remaining_cents),
  }));
}

/** Nome da origem de um lançamento: conta ou "Cartão X". */
export function sourceName(
  tx: { account_id: string | null; card_id: string | null },
  accounts: Map<string, { name: string }>,
  cards: Map<string, { name: string }>,
): string | undefined {
  if (tx.card_id) return `Cartão ${cards.get(tx.card_id)?.name ?? ""}`.trim();
  return tx.account_id ? accounts.get(tx.account_id)?.name : undefined;
}
