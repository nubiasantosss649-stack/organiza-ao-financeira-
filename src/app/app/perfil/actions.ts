"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fieldErrors, formToObject, passwordSchema, profileSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { supabase, user } = await authedClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Dados atualizados." };
}

async function verifyPassword(email: string, password: string) {
  const { supabase } = await authedClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ current_password: z.string().min(1, "Informe a senha atual."), password: passwordSchema, confirm_password: z.string() })
    .refine((v) => v.password === v.confirm_password, { path: ["confirm_password"], message: "As senhas não conferem." })
    .safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { supabase, user } = await authedClient();
  if (!(await verifyPassword(user.email ?? "", parsed.data.current_password))) {
    return { fieldErrors: { current_password: ["Senha atual incorreta."] } };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: ["Escolha uma senha diferente da atual."] } };
    return { error: "Não foi possível alterar a senha." };
  }
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Senha alterada. As outras sessões foram encerradas." };
}

export async function signOutEverywhere(): Promise<void> {
  const { supabase } = await authedClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/entrar");
}

export async function signOutOthers(): Promise<ActionState> {
  const { supabase } = await authedClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return error ? { error: "Não foi possível encerrar as outras sessões." } : { ok: true, message: "As outras sessões foram encerradas." };
}

export async function completeOnboarding(): Promise<void> {
  const { supabase, user } = await authedClient();
  await supabase.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", user.id);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function deleteMyAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      password: z.string().min(1, "Informe sua senha."),
      confirmation: z.string().refine((v) => v.trim().toUpperCase() === "EXCLUIR", 'Digite EXCLUIR para confirmar.'),
    })
    .safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { supabase, user } = await authedClient();
  if (!(await verifyPassword(user.email ?? "", parsed.data.password))) {
    return { fieldErrors: { password: ["Senha incorreta."] } };
  }

  // Assinatura paga em andamento precisa ser cancelada antes (evita cobrança após a exclusão).
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id")
    .in("status", ["active", "past_due", "paused"])
    .neq("provider", "trial")
    .limit(1);
  if (subs?.length) {
    return { error: "Você tem uma assinatura ativa. Cancele a assinatura antes de excluir a conta." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Exclusão indisponível no momento. Fale com o suporte para concluir o pedido." };
  }
  // Remove o usuário do Auth; os dados financeiros são apagados em cascata pelo banco.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Não foi possível excluir a conta agora. Tente novamente ou fale com o suporte." };

  await supabase.auth.signOut({ scope: "local" });
  redirect("/?conta=excluida");
}
