import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import type { FinancialSnapshot } from "./context";

/** Modelo configurável por ambiente; padrão: Claude Opus 5.5. */
export function aiModel(): string {
  return process.env.AI_MODEL || "claude-opus-5-5";
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Preço por milhão de tokens (US$), para estimar custo no painel administrativo. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** Custo estimado em milionésimos de dólar (tokens × US$/milhão = micro-US$). */
export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["claude-opus-5-5"];
  return Math.round(inputTokens * p.input + outputTokens * p.output);
}

export type AIResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number; costMicroUsd: number }
  | { ok: false; error: "refusal" | "rate_limit" | "unavailable" | "bad_request" };

type MessagesClient = Pick<Anthropic["beta"]["messages"], "create">;

export async function runFinancialAnalysis(
  snapshot: FinancialSnapshot,
  question: string,
  client: MessagesClient = new Anthropic({ maxRetries: 2, timeout: 60_000 }).beta.messages,
): Promise<AIResult> {
  const model = aiModel();
  try {
    const response = await client.create({
      model,
      max_tokens: 4000,
      // Esforço médio: respostas curtas de análise; o pensamento adaptativo é o padrão do modelo.
      output_config: { effort: "medium" },
      // Se o modelo recusar por segurança, a própria API tenta um modelo alternativo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(JSON.stringify(snapshot, null, 1), question) }],
    });

    if (response.stop_reason === "refusal") return { ok: false, error: "refusal" };
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) return { ok: false, error: "unavailable" };

    const inputTokens = (response.usage.input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens ?? 0;
    return {
      ok: true,
      text,
      model: response.model,
      inputTokens,
      outputTokens,
      costMicroUsd: estimateCostMicroUsd(response.model, inputTokens, outputTokens),
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "rate_limit" };
    if (error instanceof Anthropic.BadRequestError) {
      console.error("IA: requisição inválida", error.status);
      return { ok: false, error: "bad_request" };
    }
    if (error instanceof Anthropic.APIError) {
      console.error("IA: erro do provedor", error.status);
      return { ok: false, error: "unavailable" };
    }
    console.error("IA: falha de conexão");
    return { ok: false, error: "unavailable" };
  }
}
