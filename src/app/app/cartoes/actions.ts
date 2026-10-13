"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient, requireFeature } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { color, fieldErrors, formToObject, isoDate, moneyField, uuid } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

const day = z.coerce.number().int("Dia inválido.").min(1, "Use um dia entre 1 e 31.").max(31, "Use um dia entre 1 e 31.");

const cardSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cartão.").max(40, "Use no máximo 40 caracteres."),
  limit: moneyField(),
  closing_day: day,
  due_day: day,
  color,
});

export async function saveCard(_prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  if (id && !id.success) return { error: "Cartão inválido." };
  const parsed = cardSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let ctx;
  try {
    ctx = await requireFeature("credit_cards");
  } catch {
    return { error: "O controle de cartões faz parte do Controle Fácil Pro." };
  }
  const values = {
    name: parsed.data.name,
    limit_cents: parsed.data.limit,
    closing_day: parsed.data.closing_day,
    due_day: parsed.data.due_day,
    color: parsed.data.color,
  };
  if (id) {
    const { error } = await ctx.supabase.from("credit_cards").update(values).eq("id", id.data);
    if (error) return { error: friendlyDbError(error) };
    revalidatePath("/app", "layout");
    return { ok: true, message: "Cartão atualizado. As faturas foram recalculadas." };
  }
  const { data, error } = await ctx.supabase.from("credit_cards").insert(values).select("id").single();
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  redirect(`/app/cartoes/${data.id}`);
}

const paySchema = z.object({
  card_id: uuid,
  invoice_due_on: isoDate,
  account_id: uuid,
  amount: moneyField(),
  paid_on: isoDate,
});

/** Pagar fatura: reduz o saldo da conta; NÃO cria despesa (a despesa é cada compra). */
export async function payInvoice(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = paySchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { supabase } = await authedClient();
  const { error } = await supabase.from("card_invoice_payments").insert({
    card_id: v.card_id,
    invoice_due_on: v.invoice_due_on,
    account_id: v.account_id,
    amount_cents: v.amount,
    paid_on: v.paid_on,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Pagamento da fatura registrado." };
}

export async function deleteInvoicePayment(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Pagamento inválido." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("card_invoice_payments").delete().eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function setCardArchived(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Cartão inválido." };
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("credit_cards")
    .update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null })
    .eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function deleteCard(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Cartão inválido." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("credit_cards").delete().eq("id", id.data);
  if (error) {
    return { error: error.code === "23503" ? "Este cartão tem compras registradas. Exclua as compras ou arquive o cartão." : friendlyDbError(error) };
  }
  revalidatePath("/app", "layout");
  redirect("/app/cartoes");
}
