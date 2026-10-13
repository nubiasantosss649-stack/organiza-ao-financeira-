"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";

// Paleta validada (CVD/contraste) para 2 séries sobre fundo claro.
export const INCOME_COLOR = "#12A26E";
export const EXPENSE_COLOR = "#2F64A8";

export interface MonthlyPoint {
  label: string;
  receitas: number;
  despesas: number;
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          {/* Eixo Y em reais (R$), formato compacto: "3 mil" = R$ 3.000 */}
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickFormatter={(v: number) => compact.format(v / 100)}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 39, 71, 0.05)" }}
            formatter={(value, name) => [formatBRL(Number(value)), name === "receitas" ? "Receitas" : "Despesas"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Legend
            formatter={(v) => <span className="text-sm text-slate-600">{v === "receitas" ? "Receitas" : "Despesas"}</span>}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="receitas" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="despesas" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
