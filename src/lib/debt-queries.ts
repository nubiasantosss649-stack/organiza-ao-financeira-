import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ISODate } from "@/lib/dates";

export interface DebtSummary {
  id: string;
  name: string;
  creditor: string | null;
  kind: string;
  balance_cents: number;
  balance_date: ISODate;
  monthly_rate_bp: number;
  installment_cents: number | null;
  installments_total: number | null;
  due_day: number | null;
  status: "active" | "paid" | "archived";
  notes: string | null;
  paid_since_cents: number;
  remaining_cents: number;
  payments_count: number;
}

export async function listDebts(): Promise<DebtSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("debt_summaries").select("*").order("created_at");
  if (error) throw new Error("Falha ao carregar dívidas.");
  return (data ?? []).map(normalize);
}

export async function getDebt(id: string): Promise<DebtSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("debt_summaries").select("*").eq("id", id).maybeSingle();
  return data ? normalize(data) : null;
}

function normalize(d: Record<string, unknown>): DebtSummary {
  return {
    ...(d as unknown as DebtSummary),
    balance_cents: Number(d.balance_cents),
    installment_cents: d.installment_cents === null ? null : Number(d.installment_cents),
    paid_since_cents: Number(d.paid_since_cents),
    remaining_cents: Number(d.remaining_cents),
  };
}

/** Pagamento mínimo usado nas estratégias: a parcela informada, ou 1% do saldo (mín. R$ 10) + juros do mês. */
export function minimumPayment(d: DebtSummary): number {
  if (d.installment_cents) return d.installment_cents;
  const interest = Math.round((d.remaining_cents * d.monthly_rate_bp) / 10_000);
  return Math.min(d.remaining_cents, Math.max(1000, Math.round(d.remaining_cents / 100)) + interest);
}
