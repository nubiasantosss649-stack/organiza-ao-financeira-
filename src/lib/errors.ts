/** Converte erros do banco em mensagens claras, sem expor detalhes internos. */
export function friendlyDbError(error: { code?: string; message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (msg.includes("PLAN_LIMIT:accounts")) {
    return "Você atingiu o limite de contas do plano Grátis. Arquive uma conta ou conheça o Pro para ter contas ilimitadas.";
  }
  if (msg.includes("PLAN_LIMIT:budgets")) {
    return "O plano Grátis permite 1 orçamento ativo. Desative o atual ou conheça o Pro para ter orçamentos ilimitados.";
  }
  if (msg.includes("PLAN_LIMIT:goals")) {
    return "O plano Grátis permite 1 meta ativa. Conclua ou arquive a atual, ou conheça o Pro para ter metas ilimitadas.";
  }
  if (msg.includes("FEATURE_REQUIRED:")) return "Este recurso faz parte do Controle Fácil Pro.";
  if (msg.includes("AI_CONSENT_REQUIRED")) return "Autorize o uso dos seus dados agregados pelo assistente antes de pedir uma análise.";
  if (msg.includes("AI_LIMIT_REACHED")) return "Você usou todas as análises de IA disponíveis no seu plano neste período.";
  if (msg.includes("transactions_one_source")) return "Escolha uma conta ou um cartão para o lançamento.";
  if (msg.includes("transactions_card_is_expense")) return "No cartão de crédito só é possível registrar despesas.";
  if (msg.includes("row-level security")) return "Você não tem permissão para esta ação no seu plano atual.";
  if (msg.includes("CATEGORY_KIND_MISMATCH")) return "A categoria escolhida não corresponde ao tipo do lançamento.";
  if (msg.includes("BUDGET_CATEGORY_NOT_EXPENSE")) return "Orçamentos só podem usar categorias de despesa.";
  if (error?.code === "23505") return "Já existe um registro com esse nome.";
  if (error?.code === "23503") return "Este item está em uso por outros registros e não pode ser excluído. Você pode arquivá-lo.";
  if (error?.code === "23514") return "Algum valor informado está fora do permitido.";
  if (error?.code === "42501") return "Você não tem permissão para esta ação.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

export function isPlanLimitError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes("PLAN_LIMIT:"));
}
