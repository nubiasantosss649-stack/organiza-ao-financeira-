export interface AIPreset {
  id: string;
  label: string;
  question: string;
}

/** Análises prontas (disponíveis no plano Grátis, dentro do limite de análises demonstrativas). */
export const AI_PRESETS: AIPreset[] = [
  { id: "para-onde-vai", label: "Para onde vai meu dinheiro?", question: "Explique para onde está indo meu dinheiro neste mês, destacando as categorias com maiores gastos." },
  { id: "economizar", label: "Onde posso economizar?", question: "Identifique as melhores oportunidades de economia nos meus gastos, com valores estimados por mês." },
  { id: "comparar-meses", label: "Comparar com o mês anterior", question: "Compare minhas despesas e receitas deste mês com o mês anterior e explique as principais diferenças." },
  { id: "orcamento", label: "Sugestão de orçamento", question: "Sugira um orçamento mensal por categoria com base no meu histórico de gastos e na minha renda." },
  { id: "dividas", label: "Plano para minhas dívidas", question: "Com base nas minhas dívidas e na sobra do mês, sugira uma ordem e um plano de pagamento." },
  { id: "metas", label: "Como alcançar minhas metas", question: "Analise minhas metas e diga quanto preciso guardar por mês e de onde esse dinheiro pode sair." },
];

export const MAX_QUESTION_LENGTH = 500;
