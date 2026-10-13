"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { buildSeries } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { safeNext } from "@/lib/redirect";
import { fieldErrors, formToObject, resolveSource, transactionSchema, transactionUpdateSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

function refresh() {
  revalidatePath("/app", "layout");
}

export async function createTransaction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = transactionSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const { supabase } = await authedClient();
  const series = buildSeries({
    amountCents: v.amount,
    occurredOn: v.occurred_on,
    status: v.status,
    description: v.description,
    mode: v.repeat,
    count: v.repeat_count,
  });
  const groupId = series.length > 1 ? crypto.randomUUID() : null;

  const src = resolveSource(v);
  const rows = series.map((item) => ({
    kind: v.kind,
    ...src,
    category_id: v.category_id,
    notes: v.notes,
    amount_cents: item.amountCents,
    occurred_on: item.occurredOn,
    status: item.status,
    paid_on: item.status === "paid" ? item.occurredOn : null,
    description: item.description,
    installment_group_id: v.repeat === "installments" ? groupId : null,
    installment_number: item.installmentNumber,
    installment_total: item.installmentTotal,
    recurrence_id: v.repeat === "recurring" ? groupId : null,
  }));

  // Inserção única: ou todas as parcelas são gravadas, ou nenhuma.
  const { error } = await supabase.from("transactions").insert(rows);
  if (error) return { error: friendlyDbError(error) };

  refresh();
  redirect(safeNext(form.get("next") as string | null, "/app/lancamentos"));
}

export async function updateTransaction(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { error: "Lançamento inválido." };
  const parsed = transactionUpdateSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const { supabase } = await authedClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({
      kind: v.kind,
      amount_cents: v.amount,
      description: v.description,
      occurred_on: v.occurred_on,
      ...resolveSource(v),
      category_id: v.category_id,
      status: v.status,
      paid_on: v.status === "paid" ? v.occurred_on : null,
      notes: v.notes,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Lançamento não encontrado." };

  refresh();
  return { ok: true, message: "Lançamento atualizado." };
}

const deleteSchema = z.object({ id: z.uuid(), scope: z.enum(["one", "future"]).default("one") });

export async function deleteTransaction(form: FormData): Promise<void> {
  const parsed = deleteSchema.safeParse(formToObject(form));
  if (!parsed.success) return;
  const { id, scope } = parsed.data;
  const { supabase } = await authedClient();

  if (scope === "future") {
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, occurred_on, installment_group_id, recurrence_id")
      .eq("id", id)
      .maybeSingle();
    const groupCol = tx?.installment_group_id ? "installment_group_id" : tx?.recurrence_id ? "recurrence_id" : null;
    if (tx && groupCol) {
      // Remove este lançamento e os próximos ainda pendentes da mesma série.
      await supabase
        .from("transactions")
        .delete()
        .eq(groupCol, (tx as Record<string, string>)[groupCol])
        .gt("occurred_on", tx.occurred_on)
        .eq("status", "pending");
    }
  }
  await supabase.from("transactions").delete().eq("id", id);
  refresh();
  redirect("/app/lancamentos");
}

export async function toggleTransactionStatus(form: FormData): Promise<void> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await authedClient();
  const { data: tx } = await supabase.from("transactions").select("status").eq("id", id.data).maybeSingle();
  if (!tx) return;
  const toPaid = tx.status === "pending";
  await supabase
    .from("transactions")
    .update(toPaid ? { status: "paid", paid_on: todayISO() } : { status: "pending", paid_on: null })
    .eq("id", id.data);
  refresh();
}
