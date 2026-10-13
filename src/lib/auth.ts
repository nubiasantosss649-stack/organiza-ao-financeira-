import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Entitlements } from "@/lib/types";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  onboardingCompleted: boolean;
}

/**
 * Data Access Layer: lê o usuário autenticado validando o token com o Supabase.
 * Toda página e ação privada chama esta função (o proxy não é a única barreira).
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/entrar");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed_at")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile?.full_name ?? null,
    onboardingCompleted: Boolean(profile?.onboarding_completed_at),
  };
});

export const getEntitlements = cache(async (): Promise<Entitlements> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_entitlements");
  if (error || !data) throw new Error("Não foi possível carregar o plano do usuário.");
  return data as Entitlements;
});

export function hasFeature(ent: Entitlements, feature: string): boolean {
  return ent.features.includes(feature);
}

/** Para Server Actions: retorna o cliente e o usuário, ou lança erro se não autenticado. */
export async function authedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("NOT_AUTHENTICATED");
  return { supabase, user: data.user };
}

/** Para Server Actions de recursos Pro: valida no servidor (o banco valida de novo via RLS). */
export async function requireFeature(feature: string) {
  const ctx = await authedClient();
  const { data } = await ctx.supabase.rpc("my_entitlements");
  const features: string[] = (data as Entitlements | null)?.features ?? [];
  if (!features.includes(feature)) throw new Error(`FEATURE_REQUIRED:${feature}`);
  return ctx;
}
