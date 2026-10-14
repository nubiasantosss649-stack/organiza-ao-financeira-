"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient, requireFeature } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { parseRateToBp } from "@/lib/debts";
import { fieldErrors, formToObject, isoDate, moneyField, uuid } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

const optionalMoney = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v : undefined))
  .pipe(moneyField().optional());

const rateField = z.string().transform((v, ctx) => {
  const bp = parseRateToBp(v || "0");
  if (bp === null) {
    ctx.addIssue({ code: "custom", message: "Taxa inválida. Ex.: 2,99" });
    return z.NEVER;
  }
  return bp;
});

const debtSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome.").max(60),
  creditor: z.string().trim().max(60).optional().transform((v) => v || null),
  kind: z.enum(["loan", "credit_card", "overdraft", "financing", "personal", "other"]),
  balance: moneyField(),
  balance_date: isoDate,
  rate: rateField,
  installment: optionalMoney,
  installments_total: z.string().optional().transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 600), "Use de 1 a 600 parcelas."),
  due_day: z.string().optional().transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 31), "Use um dia entre 1 e 31."),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

export async function saveDebt(_prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  if (id && !id.success) return { error: "Dívida inválida." };
  const parsed = debtSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  let ctx;
  try {
    ctx = await requireFeature("debts");
  } catch {
    return { error: "O organizador de dívidas faz parte do Controle Fácil Pro." };
  }
  const values = {
    name: v.name,
    creditor: v.creditor,
    kind: v.kind,
    balance_cents: v.balance,
    balance_date: v.balance_date,
    monthly_rate_bp: v.rate,
    installment_cents: v.installment ?? null,
    installments_total: v.installments_total,
    due_day: v.due_day,
    notes: v.notes,
  };
  if (id) {
    const { error } = await ctx.supabase.from("debts").update(values).eq("id", id.data);
    if (error) return { error: friendlyDbError(error) };
    revalidatePath("/app", "layout");
    return { ok: true, message: "Dívida atualizada." };
  }
  const { data, error } = await ctx.supabase.from("debts").insert(values).select("id").single();
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  redirect(`/app/dividas/${data.id}`);
}

const paymentSchema = z.object({
  debt_id: uuid,
  amount: moneyField(),
  paid_on: isoDate,
  note: z.string().trim().max(200).optional().transform((v) => v || null),
  // Opcional: lançar também como despesa paga numa conta (evita registrar em dobro manualmente).
  account_id: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
});

export async function addDebtPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = paymentSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { supabase } = await authedClient();

  const { data: debt } = await supabase.from("debts").select("name").eq("id", v.debt_id).maybeSingle();
  if (!debt) return { error: "Dívida não encontrada." };

  let transactionId: string | null = null;
  if (v.account_id) {
    const { data: cat } = await supabase.from("categories").select("id").eq("kind", "expense").ilike("name", "Outras despesas").maybeSingle();
    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        account_id: v.account_id,
        kind: "expense",
        amount_cents: v.amount,
        description: `Pagamento: ${debt.name}`.slice(0, 120),
        occurred_on: v.paid_on,
        status: "paid",
        category_id: cat?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { error: friendlyDbError(error) };
    transactionId = tx.id;
  }

  const { error } = await supabase.from("debt_payments").insert({
    debt_id: v.debt_id,
    amount_cents: v.amount,
    paid_on: v.paid_on,
    note: v.note,
    transaction_id: transactionId,
  });
  if (error) {
    if (transactionId) await supabase.from("transactions").delete().eq("id", transactionId);
    return { error: friendlyDbError(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: transactionId ? "Pagamento registrado e lançado como despesa." : "Pagamento registrado." };
}

export async function deleteDebtPayment(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Pagamento inválido." };
  const { supabase } = await authedClient();
  const { data: payment } = await supabase.from("debt_payments").select("transaction_id").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("debt_payments").delete().eq("id", id.data);
  if (!error && payment?.transaction_id && form.get("with_tx") === "1") {
    await supabase.from("transactions").delete().eq("id", payment.transaction_id);
  }
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function setDebtStatus(form: FormData): Promise<ActionState> {
  const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "paid", "archived"]) }).safeParse(formToObject(form));
  if (!parsed.success) return { error: "Dados inválidos." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("debts").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function deleteDebt(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Dívida inválida." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("debts").delete().eq("id", id.data);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  redirect("/app/dividas");
}
