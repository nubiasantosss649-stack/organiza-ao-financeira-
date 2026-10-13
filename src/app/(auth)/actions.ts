"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { safeNext } from "@/lib/redirect";
import { emailField, fieldErrors, formToObject, passwordSchema, signInSchema, signUpSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
import { z } from "zod";

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada (e o spam)." };
    }
    if (error.status === 429) return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    return { error: "E-mail ou senha incorretos." };
  }
  redirect(safeNext(form.get("next") as string | null));
}

export async function signUp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/app/boas-vindas`,
      data: { full_name: parsed.data.full_name },
    },
  });
  if (error) {
    if (error.status === 429) return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    if (error.code === "weak_password") return { fieldErrors: { password: ["Senha muito fraca. Escolha outra."] } };
    return { error: "Não foi possível criar sua conta agora. Tente novamente." };
  }
  // Mesmo se o e-mail já existir, mostramos a mesma tela (não revelamos cadastros).
  redirect(`/cadastro/verifique-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function requestPasswordReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailField }).safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/redefinir-senha`,
  });
  return {
    ok: true,
    message: "Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha.",
  };
}

export async function updatePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ password: passwordSchema, confirm_password: z.string() })
    .refine((v) => v.password === v.confirm_password, { path: ["confirm_password"], message: "As senhas não conferem." })
    .safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Link expirado. Solicite uma nova recuperação de senha." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: ["Escolha uma senha diferente da atual."] } };
    return { error: "Não foi possível alterar a senha. Tente novamente." };
  }
  // Encerra as outras sessões após trocar a senha.
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Senha alterada com sucesso." };
}

export async function resendConfirmation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailField }).safeParse(formToObject(form));
  if (!parsed.success) return { error: "E-mail inválido." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/app/boas-vindas` },
  });
  if (error?.status === 429) return { error: "Aguarde alguns minutos antes de pedir outro e-mail." };
  return { ok: true, message: "Se o cadastro estiver pendente, enviamos um novo e-mail de confirmação." };
}
