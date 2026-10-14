import Link from "next/link";
import { Lock } from "lucide-react";

/** Aviso não invasivo de limite do plano Grátis. */
export function PlanLimitNotice({ used, limit, noun }: { used: number; limit: number | null; noun: string }) {
  if (limit === null) return null;
  const reached = used >= limit;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${reached ? "border-money-100 bg-money-50" : "border-slate-200 bg-white"}`}>
      <span className="text-slate-700">
        {reached ? <Lock className="mr-1.5 inline h-3.5 w-3.5 text-money-700" aria-hidden /> : null}
        Plano Grátis: <strong className="tabular">{used} de {limit}</strong> {noun}.
        {reached ? " Seus dados continuam disponíveis normalmente." : ""}
      </span>
      {reached ? <Link href="/app/planos" className="font-semibold text-money-700 hover:underline">Ver o Pro</Link> : null}
    </div>
  );
}
