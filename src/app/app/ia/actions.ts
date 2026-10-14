"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/errors";
import { AI_PRESETS, MAX_QUESTION_LENGTH } from "@/lib/ai/presets";
import { isAIConfigured, runFinancialAnalysis } from "@/lib/ai/claude";
import { gatherSnapshot } from "@/lib/ai/gather";
import { snapshotIsEmpty } from "@/lib/ai/context";

export type AIResponse =
  | { ok: true; text: string; used: number; limit: number | null; period: "lifetime" | "month" }
  | { ok: false; error: string; code?: string };

const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), presetId: z.string().max(40) }),
  z.object({ kind: z.literal("chat"), question: z.string().trim().min(3, "Escreva sua pergunta.").max(MAX_QUESTION_LENGTH) }),
]);

async function finish(usageId: number, success: boolean, model: string | null, inTok: number, outTok: number, cost: number) {
  try {
    const admin = createAdminClient();
    await admin.rpc("ai_finish", {
      p_usage_id: usageId, p_success: success, p_model: model, p_input_tokens: inTok, p_output_tokens: outTok, p_cost_micro_usd: cost,
    });
  } catch {
    // Sem a chave de serviço, a reserva expira sozinha em 10 minutos.
    console.error("IA: não foi possível concluir o registro de uso");
  }
}

export async function askAssistant(raw: z.input<typeof input>): Promise<AIResponse> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pedido inválido." };
  const req = parsed.data;
  const question = req.kind === "preset" ? AI_PRESETS.find((p) => p.id === req.presetId)?.question : req.question;
  if (!question) return { ok: false, error: "Análise não encontrada." };

  if (!isAIConfigured()) {
    return { ok: false, code: "unavailable", error: "O assistente está temporariamente indisponível. Nenhuma análise foi descontada." };
  }

  const { supabase } = await authedClient();
  const { data: reservation, error: reserveError } = await supabase.rpc("ai_reserve", { p_kind: req.kind });
  if (reserveError) {
    const msg = reserveError.message ?? "";
    return { ok: false, code: msg.includes("AI_LIMIT") ? "limit" : msg.includes("CONSENT") ? "consent" : msg.includes("FEATURE") ? "feature" : "error", error: friendlyDbError(reserveError) };
  }
  const r = reservation as { usage_id: number; used: number; limit: number | null; period: "lifetime" | "month" };

  const snapshot = await gatherSnapshot();
  if (snapshotIsEmpty(snapshot)) {
    await finish(r.usage_id, false, null, 0, 0, 0);
    return { ok: false, code: "empty", error: "Ainda não há dados suficientes. Registre algumas receitas e despesas e tente de novo — nenhuma análise foi descontada." };
  }

  const result = await runFinancialAnalysis(snapshot, question);
  if (!result.ok) {
    await finish(r.usage_id, false, null, 0, 0, 0);
    const messages = {
      refusal: "Não foi possível responder a essa pergunta. Tente reformular.",
      rate_limit: "Muitas pessoas usando o assistente agora. Tente novamente em instantes.",
      unavailable: "O assistente está temporariamente indisponível.",
      bad_request: "Não foi possível processar o pedido.",
    } as const;
    return { ok: false, code: result.error, error: `${messages[result.error]} Nenhuma análise foi descontada.` };
  }

  await finish(r.usage_id, true, result.model, result.inputTokens, result.outputTokens, result.costMicroUsd);
  revalidatePath("/app/ia");
  return { ok: true, text: result.text, used: r.used, limit: r.limit, period: r.period };
}

export async function setAIConsent(form: FormData): Promise<void> {
  const { supabase, user } = await authedClient();
  const grant = form.get("consent") === "1";
  await supabase.from("profiles").update({ ai_consent_at: grant ? new Date().toISOString() : null }).eq("id", user.id);
  revalidatePath("/app/ia");
}
