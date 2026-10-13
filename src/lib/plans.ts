import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";

/** Planos vêm do banco: preços e limites são ajustáveis sem alterar o código. */
export async function listPlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, description, price_cents, billing_interval, max_accounts, max_active_budgets, max_active_goals, ai_analyses_limit, ai_limit_period, features")
    .order("sort_order");
  if (error) throw new Error("Falha ao carregar planos.");
  return (data ?? []) as Plan[];
}

/** Indica se o checkout de assinatura está disponível (Etapa 3: integração com Mercado Pago). */
export function isCheckoutAvailable(): boolean {
  return process.env.BILLING_ENABLED === "true";
}

export const FEATURE_LABELS: Record<string, string> = {
  dashboard: "Dashboard financeiro",
  transactions: "Registro ilimitado de receitas e despesas",
  categories: "Categorias personalizadas",
  basic_charts: "Gráficos básicos",
  history: "Histórico financeiro completo",
  goals: "Metas de economia",
  budgets: "Orçamentos mensais",
  export_data: "Exportação dos seus dados",
  debts: "Organizador de dívidas",
  debt_simulator: "Simulador de quitação",
  credit_cards: "Cartões de crédito e parcelas",
  statement_import: "Importação de extratos (CSV e OFX)",
  auto_categorization: "Categorização automática",
  ai_assistant: "Assistente financeiro com IA",
  advanced_reports: "Relatórios financeiros avançados",
  detailed_charts: "Gráficos detalhados",
  monthly_comparison: "Comparações mensais",
  recurring_detection: "Identificação de assinaturas recorrentes",
  projections: "Projeções financeiras",
  bill_alerts: "Alertas de contas",
  report_export: "Exportação de relatórios",
};
