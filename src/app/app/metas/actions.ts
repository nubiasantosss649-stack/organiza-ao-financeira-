"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { fieldErrors, formToObject, goalDepositSchema, goalSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function saveGoal(_prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  if (id && !id.success) return { error: "Meta inválida." };
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const values = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    target_cents: parsed.data.target,
    target_date: parsed.data.target_date,
  };
  const { supabase } = await authedClient();
  if (id) {
    const { error } = await supabase.from("goals").update(values).eq("id", id.data);
    if (error) return { error: friendlyDbError(error) };
    revalidatePath("/app", "layout");
    return { ok: true, message: "Meta atualizada." };
  }
  const { data, error } = await supabase.from("goals").insert(values).select("id").single();
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  redirect(`/app/metas/${data.id}`);
}

export async function addGoalDeposit(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = goalDepositSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { supabase } = await authedClient();
  const { error } = await supabase.from("goal_deposits").insert({
    goal_id: v.goal_id,
    amount_cents: v.direction === "withdraw" ? -v.amount : v.amount,
    deposited_on: v.deposited_on,
    note: v.note,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  return { ok: true, message: v.direction === "withdraw" ? "Retirada registrada." : "Depósito registrado." };
}

export async function deleteGoalDeposit(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Registro inválido." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("goal_deposits").delete().eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function setGoalStatus(form: FormData): Promise<ActionState> {
  const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "completed", "archived"]) }).safeParse(formToObject(form));
  if (!parsed.success) return { error: "Dados inválidos." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("goals").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function deleteGoal(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Meta inválida." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("goals").delete().eq("id", id.data);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  redirect("/app/metas");
}
