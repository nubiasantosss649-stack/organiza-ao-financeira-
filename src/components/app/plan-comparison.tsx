import { Check, Minus } from "lucide-react";
import { formatBRL } from "@/lib/money";
import type { Plan } from "@/lib/types";

function limitText(v: number | null, singular: string, plural: string) {
  if (v === null) return `${plural} ilimitad${plural.endsWith("as") ? "as" : "os"}`;
  return `Até ${v} ${v === 1 ? singular : plural}`;
}

export function aiText(plan: Plan) {
  if (plan.ai_analyses_limit === null) return "Análises de IA ilimitadas";
  if (plan.ai_analyses_limit === 0) return "Sem análises de IA";
  return plan.ai_limit_period === "month"
    ? `Até ${plan.ai_analyses_limit} análises de IA por mês`
    : `${plan.ai_analyses_limit} análises demonstrativas de IA`;
}

export function planHighlights(plan: Plan): string[] {
  return [
    limitText(plan.max_accounts, "conta ou carteira", "contas e carteiras"),
    limitText(plan.max_active_budgets, "orçamento ativo", "orçamentos"),
    limitText(plan.max_active_goals, "meta ativa", "metas"),
    aiText(plan),
  ];
}

const COMPARE_ROWS: Array<{ label: string; feature?: string; value?: (p: Plan) => string }> = [
  { label: "Registro manual de receitas e despesas", value: () => "Ilimitado" },
  { label: "Dashboard e gráficos", feature: "basic_charts" },
  { label: "Contas e carteiras", value: (p) => (p.max_accounts === null ? "Ilimitadas" : String(p.max_accounts)) },
  { label: "Orçamentos ativos", value: (p) => (p.max_active_budgets === null ? "Ilimitados" : String(p.max_active_budgets)) },
  { label: "Metas ativas", value: (p) => (p.max_active_goals === null ? "Ilimitadas" : String(p.max_active_goals)) },
  { label: "Análises com IA", value: (p) => aiText(p).replace("Até ", "").replace("análises de IA ", "") },
  { label: "Organizador de dívidas e simulador", feature: "debts" },
  { label: "Cartões de crédito e faturas", feature: "credit_cards" },
  { label: "Importação de extratos CSV/OFX", feature: "statement_import" },
  { label: "Relatórios avançados e projeções", feature: "advanced_reports" },
  { label: "Exportação dos seus dados", feature: "export_data" },
];

export function PlanComparisonTable({ plans }: { plans: Plan[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <caption className="sr-only">Comparativo de planos</caption>
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-3 pr-3 font-medium text-slate-500">Recurso</th>
            {plans.map((p) => (
              <th key={p.id} className="px-3 py-3 text-center font-semibold text-navy-900">
                {p.name.replace("Controle Fácil ", "")}
                <span className="block text-xs font-normal text-slate-500">
                  {p.price_cents === 0 ? "R$ 0,00" : `${formatBRL(p.price_cents)}/mês`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-slate-100">
              <td className="py-2.5 pr-3 text-slate-700">{row.label}</td>
              {plans.map((p) => (
                <td key={p.id} className="px-3 py-2.5 text-center">
                  {row.value ? (
                    <span className="font-medium">{row.value(p)}</span>
                  ) : p.features.includes(row.feature!) ? (
                    <Check className="mx-auto h-4 w-4 text-money-600" aria-label="Incluído" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Não incluído" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
