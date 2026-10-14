"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { budgetSchema, fieldErrors, formToObject, moneyField } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function createBudget(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = budgetSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("budgets").insert({ category_id: parsed.data.category_id, amount_cents: parsed.data.amount });
  if (error) {
    return { error: error.code === "23505" ? "Já existe um orçamento ativo para essa categoria." : friendlyDbError(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Orçamento criado." };
}

export async function updateBudgetAmount(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ id: z.uuid(), amount: moneyField() }).safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("budgets").update({ amount_cents: parsed.data.amount }).eq("id", parsed.data.id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Valor atualizado." };
}

export async function setBudgetActive(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Orçamento inválido." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("budgets").update({ is_active: form.get("active") === "1" }).eq("id", id.data);
  revalidatePath("/app", "layout");
  if (error) {
    return { error: error.code === "23505" ? "Já existe um orçamento ativo para essa categoria." : friendlyDbError(error) };
  }
  return { ok: true };
}

export async function deleteBudget(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Orçamento inválido." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("budgets").delete().eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}
