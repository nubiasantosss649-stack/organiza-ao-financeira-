import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";

/** Exibe um valor em reais. `kind` adiciona sinal e cor de receita/despesa. */
export function Money({
  cents,
  kind,
  className,
}: {
  cents: number;
  kind?: "income" | "expense";
  className?: string;
}) {
  const text = formatBRL(cents);
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        kind === "income" && "text-money-700",
        kind === "expense" && "text-navy-900",
        className,
      )}
    >
      {kind === "income" ? "+ " : kind === "expense" ? "− " : ""}
      {text}
    </span>
  );
}
