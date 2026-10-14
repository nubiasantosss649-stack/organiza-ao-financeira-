"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";
import { EXPENSE_COLOR, INCOME_COLOR, axisBRL } from "./monthly-chart";



/** Evolução do saldo devedor em até duas séries (paleta validada; legenda + rótulos no tooltip). */
export function BalanceLines({
  series,
}: {
  series: Array<{ key: string; label: string; values: number[] }>;
}) {
  const months = Math.max(...series.map((s) => s.values.length), 0);
  const data = Array.from({ length: months + 1 }, (_, m) => {
    const row: Record<string, number | null> = { mes: m };
    for (const s of series) row[s.key] = m === 0 ? null : s.values[m - 1] ?? (m - 1 >= s.values.length ? 0 : null);
    return row;
  }).slice(1);
  const colors = [EXPENSE_COLOR, INCOME_COLOR];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(v) => `${v}º`} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(v: number) => axisBRL(v / 100)} />
          <Tooltip
            labelFormatter={(v) => `Mês ${v}`}
            formatter={(value, name) => [formatBRL(Number(value)), series.find((s) => s.key === name)?.label ?? String(name)]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Legend formatter={(v) => <span className="text-sm text-slate-600">{series.find((s) => s.key === v)?.label}</span>} iconType="plainline" />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={colors[i]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
