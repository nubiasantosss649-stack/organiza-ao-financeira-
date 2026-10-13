import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCSV } from "@/lib/csv";
import { formatDecimalBR } from "@/lib/money";
import { todayISO } from "@/lib/dates";

const PAGE = 1000;

/** Exportação dos dados do próprio usuário (LGPD, art. 18). Usa a sessão e o RLS. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "json";

  async function all(table: string, order = "created_at") {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table).select("*").order(order).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(`Falha ao exportar ${table}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  const [profile, accounts, categories, transactions, budgets, goals, goalDeposits, subscriptions] = await Promise.all([
    all("profiles"),
    all("accounts"),
    all("categories"),
    all("transactions", "occurred_on"),
    all("budgets"),
    all("goals"),
    all("goal_deposits"),
    all("subscriptions"),
  ]);
  const stamp = todayISO();
  const headers = { "Cache-Control": "private, no-store" };

  if (format === "csv") {
    const accName = new Map(accounts.map((a) => [a.id, a.name]));
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const csv = toCSV(
      ["Data", "Descrição", "Tipo", "Valor (R$)", "Situação", "Pago em", "Categoria", "Conta", "Parcela", "Observações"],
      transactions.map((t) => [
        t.occurred_on,
        t.description,
        t.kind === "income" ? "Receita" : "Despesa",
        formatDecimalBR(Number(t.amount_cents)),
        t.status === "paid" ? "Pago" : "Pendente",
        t.paid_on ?? "",
        t.category_id ? catName.get(t.category_id) ?? "" : "Sem categoria",
        accName.get(t.account_id) ?? "",
        t.installment_number ? `${t.installment_number}/${t.installment_total}` : "",
        t.notes ?? "",
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="controle-facil-lancamentos-${stamp}.csv"`,
      },
    });
  }

  const payload = {
    exported_at: new Date().toISOString(),
    notice: "Valores monetários em centavos (ex.: 1990 = R$ 19,90).",
    user: { id: auth.user.id, email: auth.user.email, created_at: auth.user.created_at },
    profile: profile[0] ?? null,
    accounts, categories, transactions, budgets, goals, goal_deposits: goalDeposits, subscriptions,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="controle-facil-dados-${stamp}.json"`,
    },
  });
}
