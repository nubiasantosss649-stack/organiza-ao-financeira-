import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { TransactionForm } from "@/components/forms/transaction-form";
import { createTransaction } from "../actions";
import { listAccounts, listCards, listCategories } from "@/lib/queries";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { safeNext } from "@/lib/redirect";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({ searchParams }: PageProps<"/app/lancamentos/novo">) {
  const sp = await searchParams;
  const [accounts, categories, ent] = await Promise.all([listAccounts(), listCategories(), getEntitlements()]);
  const cards = hasFeature(ent, "credit_cards") ? await listCards() : [];
  const presetCard = typeof sp.cartao === "string" && cards.some((c) => c.id === sp.cartao) ? sp.cartao : undefined;
  const kind = sp.tipo === "income" || sp.tipo === "receita" ? "income" : "expense";
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/app/lancamentos");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/lancamentos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Lançamentos
      </Link>
      <PageHeader title="Novo lançamento" description="Registre uma receita ou despesa. O painel é atualizado na hora." />
      {accounts.length === 0 && cards.length === 0 ? (
        <Alert tone="warning" className="mb-4">
          Para registrar lançamentos, cadastre antes uma conta ou carteira (ex.: conta do banco ou dinheiro).{" "}
          <Link href="/app/contas" className="font-semibold underline">Cadastrar conta</Link>
        </Alert>
      ) : null}
      <Card>
        <TransactionForm
          action={async (prev, form) => {
            "use server";
            form.set("next", next);
            return createTransaction(prev, form);
          }}
          accounts={accounts}
          cards={cards}
          categories={categories}
          mode="create"
          submitLabel="Salvar lançamento"
          defaults={{
            kind, amount: "", description: "", occurred_on: todayISO(), account_id: accounts[0]?.id ?? "", card_id: presetCard,
            category_id: "", status: "paid", notes: "",
          }}
        />
      </Card>
    </div>
  );
}
