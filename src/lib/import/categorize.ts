import { normalizeDescription } from "./index";

/**
 * Categorização automática — sempre uma SUGESTÃO, que o usuário pode corrigir.
 * 1º) histórico do próprio usuário (mesma descrição já categorizada antes);
 * 2º) regras por palavras-chave comuns no Brasil, ligadas aos nomes das categorias padrão.
 */
const RULES: Array<{ category: string; kind: "income" | "expense"; words: string[] }> = [
  { category: "Restaurantes", kind: "expense", words: ["ifood", "rappi", "restaurante", "lanchonete", "pizzaria", "burger", "mcdonald", "bk ", "subway", "padaria", "cafe", "bar "] },
  { category: "Mercado", kind: "expense", words: ["supermercado", "mercado", "atacadao", "assai", "carrefour", "pao de acucar", "extra ", "hortifruti", "sacolao", "dia brasil"] },
  { category: "Transporte", kind: "expense", words: ["uber", "99app", "99 pop", "taxi", "posto", "combustivel", "shell", "ipiranga", "petrobras", "estacionamento", "sem parar", "metro", "bilhete unico", "pedagio"] },
  { category: "Contas da casa", kind: "expense", words: ["enel", "cemig", "copel", "light", "energia", "sabesp", "agua", "comgas", "gas ", "vivo", "claro", "tim ", "oi ", "internet", "net servicos"] },
  { category: "Moradia", kind: "expense", words: ["aluguel", "condominio", "iptu", "imobiliaria"] },
  { category: "Saúde", kind: "expense", words: ["farmacia", "drogaria", "drogasil", "raia", "pague menos", "hospital", "clinica", "laboratorio", "unimed", "amil", "odonto", "dentista"] },
  { category: "Assinaturas", kind: "expense", words: ["netflix", "spotify", "amazon prime", "prime video", "disney", "hbo", "max.com", "globoplay", "youtube premium", "deezer", "apple.com", "google one", "icloud"] },
  { category: "Educação", kind: "expense", words: ["escola", "faculdade", "universidade", "curso", "udemy", "alura", "livraria", "mensalidade"] },
  { category: "Compras", kind: "expense", words: ["amazon", "mercado livre", "mercadolivre", "magalu", "magazine", "shopee", "americanas", "casas bahia", "renner", "riachuelo", "c&a", "shein", "aliexpress"] },
  { category: "Lazer", kind: "expense", words: ["cinema", "ingresso", "sympla", "steam", "playstation", "xbox", "teatro", "show"] },
  { category: "Pets", kind: "expense", words: ["petz", "cobasi", "pet shop", "petshop", "veterinario"] },
  { category: "Cuidados pessoais", kind: "expense", words: ["salao", "barbearia", "cabeleireiro", "estetica", "manicure", "academia", "smartfit", "smart fit"] },
  { category: "Impostos e taxas", kind: "expense", words: ["iof", "tarifa", "anuidade", "juros", "imposto", "darf", "ipva", "detran", "multa"] },
  { category: "Salário", kind: "income", words: ["salario", "pagamento de salario", "folha", "proventos", "vencimentos"] },
  { category: "Rendimentos", kind: "income", words: ["rendimento", "rend pago", "dividendo", "juros sobre capital", "resgate"] },
  { category: "Reembolsos", kind: "income", words: ["estorno", "reembolso", "devolucao", "cashback"] },
];

export interface CategoryRef {
  id: string;
  name: string;
  kind: "income" | "expense";
}

export interface HistoryItem {
  description: string;
  categoryId: string;
  kind: "income" | "expense";
}

export function buildHistoryIndex(history: HistoryItem[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const h of history) {
    const key = `${h.kind}|${normalizeDescription(h.description)}`;
    if (!key.endsWith("|")) {
      const m = counts.get(key) ?? new Map<string, number>();
      m.set(h.categoryId, (m.get(h.categoryId) ?? 0) + 1);
      counts.set(key, m);
    }
  }
  const index = new Map<string, string>();
  for (const [key, m] of counts) index.set(key, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return index;
}

export function suggestCategory(
  description: string,
  kind: "income" | "expense",
  categories: CategoryRef[],
  historyIndex: Map<string, string>,
): { categoryId: string | null; source: "history" | "rule" | null } {
  const norm = normalizeDescription(description);
  const fromHistory = historyIndex.get(`${kind}|${norm}`);
  if (fromHistory && categories.some((c) => c.id === fromHistory)) return { categoryId: fromHistory, source: "history" };

  const padded = ` ${norm} `;
  for (const rule of RULES) {
    if (rule.kind !== kind) continue;
    // Casa palavras inteiras (evita "bar" em "barbearia" ou "oi" em "noite").
    if (rule.words.some((w) => padded.includes(` ${normalizeDescription(w)} `))) {
      const cat = categories.find((c) => c.kind === kind && c.name.toLowerCase() === rule.category.toLowerCase());
      if (cat) return { categoryId: cat.id, source: "rule" };
    }
  }
  return { categoryId: null, source: null };
}
