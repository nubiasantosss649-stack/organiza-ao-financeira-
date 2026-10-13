"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { fieldErrors, formToObject, moneyField } from "@/lib/validation";
import { FEATURE_LABELS } from "@/lib/plans";
import type { ActionState } from "@/lib/types";

const limit = z.string().trim().transform((v, ctx) => {
  if (v === "") return null; // vazio = ilimitado
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    ctx.addIssue({ code: "custom", message: "Use um número inteiro (vazio = ilimitado)." });
    return z.NEVER;
  }
  return n;
});

const planSchema = z.object({
  plan: z.enum(["free", "pro"]),
  price: moneyField({ allowZero: true }),
  max_accounts: limit,
  max_active_budgets: limit,
  max_active_goals: limit,
  ai_limit: limit,
  ai_period: z.enum(["lifetime", "month"]),
});

export async function savePlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = planSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const features = form.getAll("features").map(String).filter((f) => f in FEATURE_LABELS);
  const { error } = await supabase.rpc("admin_update_plan", {
    p_plan: v.plan, p_price_cents: v.price, p_max_accounts: v.max_accounts, p_max_active_budgets: v.max_active_budgets,
    p_max_active_goals: v.max_active_goals, p_ai_limit: v.ai_limit, p_ai_period: v.ai_period, p_features: features,
  });
  if (error) return { error: "Não foi possível salvar o plano." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Plano atualizado. Novos limites valem imediatamente; assinaturas existentes mantêm o preço contratado." };
}

export async function saveTrial(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = z.object({ days: z.coerce.number().int().min(1).max(30) }).safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: { days: ["Use de 1 a 30 dias."] } };
  const { error } = await supabase.rpc("admin_set_trial", { p_enabled: form.get("enabled") === "on", p_days: parsed.data.days });
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Configuração do teste salva." };
}

const promoSchema = z.object({
  id: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
  name: z.string().trim().min(1, "Informe o nome.").max(80),
  description: z.string().trim().max(300).optional().transform((v) => v || null),
  price: moneyField(),
  starts_at: z.string().min(1, "Informe o início."),
  ends_at: z.string().min(1, "Informe o fim."),
});

export async function savePromotion(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = promoSchema.safeParse(formToObject(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  // datetime-local é interpretado no fuso de São Paulo
  const toTs = (s: string) => new Date(`${s}:00-03:00`);
  const start = toTs(v.starts_at);
  const end = toTs(v.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { fieldErrors: { ends_at: ["O fim precisa ser depois do início."] } };
  }
  const { error } = await supabase.rpc("admin_save_promotion", {
    p_id: v.id, p_name: v.name, p_description: v.description, p_price_cents: v.price,
    p_starts_at: start.toISOString(), p_ends_at: end.toISOString(), p_active: form.get("active") === "on",
  });
  if (error) return { error: "Não foi possível salvar a promoção." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Promoção salva." };
}
