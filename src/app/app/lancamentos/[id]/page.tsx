import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TransactionForm } from "@/components/forms/transaction-form";
import { deleteTransaction, updateTransaction } from "../actions";
import { listAccounts, listCards, listCategories } from "@/lib/queries";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDecimalBR } from "@/lib/money";
import type { Transaction } from "@/lib/types";

export const metadata: Metadata = { title: "Editar lançamento" };

export default async function EditTransactionPage({ params }: PageProps<"/app/lancamentos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, accounts, categories, cards, ent] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).maybeSingle(),
    listAccounts({ includeArchived: true }),
    listCategories({ includeArchived: true }),
    listCards({ includeArchived: true }),
    getEntitlements(),
  ]);
  if (!data) notFound();
  const tx = data as Transaction;
  const inSeries = Boolean(tx.installment_group_id || tx.recurrence_id);
  const usableAccounts = accounts.filter((a) => !a.archived_at || a.id === tx.account_id);
  // Mantém o cartão atual mesmo após o fim do Pro; novos cartões só com o recurso ativo.
  const usableCards = cards.filter((c) => c.id === tx.card_id || (hasFeature(ent, "credit_cards") && !c.archived_at));
  const usableCategories = categories.filter((c) => !c.archived_at || c.id === tx.category_id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/app/lancamentos" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Lançamentos
      </Link>
      <PageHeader
        title="Editar lançamento"
        description={
          tx.installment_total
            ? `Parcela ${tx.installment_number} de ${tx.installment_total}. A alteração vale só para esta parcela.`
            : tx.recurrence_id
              ? "Lançamento recorrente. A alteração vale só para este mês."
              : tx.invoice_due_on
                ? `Compra no cartão — fatura com vencimento em ${tx.invoice_due_on.split("-").reverse().join("/")}.`
                : undefined
        }
      />
      <Card>
        <TransactionForm
          action={updateTransaction.bind(null, tx.id)}
          accounts={usableAccounts}
          cards={usableCards}
          categories={usableCategories}
          mode="edit"
          submitLabel="Salvar alterações"
          defaults={{
            kind: tx.kind,
            amount: formatDecimalBR(Number(tx.amount_cents)),
            description: tx.description,
            occurred_on: tx.occurred_on,
            account_id: tx.account_id ?? usableAccounts[0]?.id ?? "",
            card_id: tx.card_id ?? undefined,
            category_id: tx.category_id ?? "",
            status: tx.status,
            notes: tx.notes ?? "",
          }}
        />
      </Card>

      <Card>
        <CardHeader title="Excluir lançamento" description="Esta ação não pode ser desfeita." />
        <form action={deleteTransaction} className="space-y-3">
          <input type="hidden" name="id" value={tx.id} />
          {inSeries ? (
            <fieldset className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" value="one" defaultChecked className="accent-navy-600" /> Somente este lançamento
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" value="future" className="accent-navy-600" /> Este e os próximos pendentes da série
              </label>
            </fieldset>
          ) : null}
          <ConfirmButton variant="danger" size="sm" message="Excluir este lançamento? Esta ação não pode ser desfeita."><Trash2 className="h-4 w-4" aria-hidden /> Excluir</ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
