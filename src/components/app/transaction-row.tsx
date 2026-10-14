import Link from "next/link";
import type { ReactNode } from "react";
import { CategoryIcon } from "./category-icon";
import { Badge } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { formatDateBR } from "@/lib/dates";
import type { Category, Transaction } from "@/lib/types";

export function TransactionRow({
  tx, category, accountName, today, compact = false, actions,
}: {
  tx: Transaction;
  category?: Category;
  accountName?: string;
  today: string;
  compact?: boolean;
  actions?: ReactNode;
}) {
  const overdue = tx.status === "pending" && tx.occurred_on < today;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Link href={`/app/lancamentos/${tx.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:bg-slate-50">
        <CategoryIcon name={category?.icon} color={category?.color} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-navy-900">{tx.description}</p>
          <p className="truncate text-xs text-slate-500">
            {category?.name ?? "Sem categoria"}
            {accountName ? ` · ${accountName}` : ""}
            {compact ? ` · ${formatDateBR(tx.occurred_on)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Money cents={tx.amount_cents} kind={tx.kind} className="text-sm font-semibold" />
          {tx.status === "pending" ? (
            overdue ? <Badge tone="danger">Vencida</Badge> : <Badge tone="warning">{tx.kind === "income" ? "A receber" : "A pagar"}</Badge>
          ) : null}
        </div>
      </Link>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </li>
  );
}
