"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { safeNext } from "@/lib/redirect";
import { accountSchema, fieldErrors, formToObject } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function saveAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  if (id && !id.success) return { error: "Conta inválida." };

  const { supabase } = await authedClient();
  const values = {
    name: parsed.data.name,
    type: parsed.data.type,
    initial_balance_cents: parsed.data.initial_balance,
    color: parsed.data.color,
  };
  const { error } = id
    ? await supabase.from("accounts").update(values).eq("id", id.data)
    : await supabase.from("accounts").insert(values);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/app", "layout");
  if (raw.next) redirect(safeNext(raw.next));
  return { ok: true, message: id ? "Conta atualizada." : "Conta criada." };
}

export async function setAccountArchived(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Conta inválida." };
  const archive = form.get("archive") === "1";
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id.data);
  revalidatePath("/app", "layout");
  if (error) return { error: friendlyDbError(error) };
  return { ok: true };
}

export async function deleteAccount(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Conta inválida." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id.data);
  revalidatePath("/app", "layout");
  if (error) return { error: friendlyDbError(error) };
  return { ok: true };
}
