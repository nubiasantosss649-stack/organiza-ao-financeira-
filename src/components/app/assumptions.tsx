import { Info } from "lucide-react";

/** Lista de hipóteses exibida junto de toda simulação/projeção. */
export function Assumptions({ items, title = "Hipóteses desta simulação" }: { items: string[]; title?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700"><Info className="h-3.5 w-3.5" aria-hidden /> {title}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
