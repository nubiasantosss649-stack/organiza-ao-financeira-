import { formatBRL, percent } from "@/lib/money";

export interface CategoryBarItem {
  key: string;
  name: string;
  color: string;
  totalCents: number;
}

/** Gastos por categoria: barras horizontais (magnitude) com rótulo e valor sempre visíveis. */
export function CategoryBars({ items, max = 6 }: { items: CategoryBarItem[]; max?: number }) {
  const total = items.reduce((a, b) => a + b.totalCents, 0);
  const sorted = [...items].sort((a, b) => b.totalCents - a.totalCents);
  const top = sorted.slice(0, max);
  const rest = sorted.slice(max);
  if (rest.length) {
    top.push({ key: "outras", name: `Outras (${rest.length})`, color: "#94A3B8", totalCents: rest.reduce((a, b) => a + b.totalCents, 0) });
  }
  const biggest = top[0]?.totalCents ?? 0;

  return (
    <ul className="space-y-3">
      {top.map((item) => {
        const share = percent(item.totalCents, total) ?? 0;
        const width = biggest ? Math.max(2, (item.totalCents / biggest) * 100) : 0;
        return (
          <li key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
                <span className="truncate font-medium text-navy-900">{item.name}</span>
              </span>
              <span className="tabular shrink-0 text-slate-600">
                {formatBRL(item.totalCents)} <span className="text-xs text-slate-400">· {share.toLocaleString("pt-BR")}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100" aria-hidden>
              <div className="h-2 rounded-full bg-navy-600" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
