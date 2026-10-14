"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { categorySchema, fieldErrors, formToObject } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function saveCategory(_prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  if (id && !id.success) return { error: "Categoria inválida." };
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { supabase } = await authedClient();
  // O tipo (receita/despesa) não muda na edição, para não invalidar lançamentos existentes.
  const { error } = id
    ? await supabase.from("categories").update({ name: parsed.data.name, color: parsed.data.color, icon: parsed.data.icon }).eq("id", id.data)
    : await supabase.from("categories").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "Já existe uma categoria com esse nome." : friendlyDbError(error) };
  revalidatePath("/app", "layout");
  return { ok: true, message: id ? "Categoria atualizada." : "Categoria criada." };
}

export async function setCategoryArchived(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Categoria inválida." };
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("categories")
    .update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null })
    .eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}

export async function deleteCategory(form: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Categoria inválida." };
  const { supabase } = await authedClient();
  // Lançamentos da categoria passam a "Sem categoria" (regra do banco). Orçamentos dela são removidos.
  const { error } = await supabase.from("categories").delete().eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}
