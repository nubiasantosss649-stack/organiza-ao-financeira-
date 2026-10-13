import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadReport } from "@/lib/report-data";
import { monthParam } from "@/lib/queries";
import { toCSV } from "@/lib/csv";
import { formatDecimalBR } from "@/lib/money";
import { formatMonthLong } from "@/lib/dates";
import type { Entitlements } from "@/lib/types";

/** Exportação de relatório (recurso Pro, verificado no servidor). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: ent } = await supabase.rpc("my_entitlements");
  if (!(ent as Entitlements | null)?.features.includes("report_export")) {
    return NextResponse.json({ error: "Recurso do plano Pro" }, { status: 403 });
  }

  const month = monthParam(request.nextUrl.searchParams.get("mes") ?? undefined);
  const r = await loadReport(month);
  const rows: unknown[][] = [
    ["Resumo mensal", "", "", ""],
    ...r.months12.map((m) => [formatMonthLong(m.month), formatDecimalBR(m.incomePaidCents), formatDecimalBR(m.expensePaidCents), formatDecimalBR(m.incomePaidCents - m.expensePaidCents)]),
    [],
    [`Categorias — ${formatMonthLong(month)}`, "Este mês (R$)", "Mês anterior (R$)", "Variação (R$)"],
    ...r.comparison.map((c) => [c.name, formatDecimalBR(c.currentCents), formatDecimalBR(c.previousCents), formatDecimalBR(c.deltaCents)]),
    [],
    ["Gastos recorrentes", "Valor típico (R$)", "Meses", ""],
    ...r.recurring.map((x) => [x.name, formatDecimalBR(x.typicalCents), x.months, ""]),
    [],
    ["Projeção (estimativa)", "Entradas (R$)", "Saídas (R$)", "Saldo ao fim do mês (R$)"],
    ...r.projection.map((p) => [formatMonthLong(p.month), formatDecimalBR(p.incomeCents), formatDecimalBR(p.expenseCents), formatDecimalBR(p.endBalanceCents)]),
  ];
  const csv = toCSV(["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"], rows);
  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="controle-facil-relatorio-${month.slice(0, 7)}.csv"`,
    },
  });
}
