import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, ProgressBar } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ActionForm } from "@/components/forms/action-form";
import { CardForm, PayInvoiceForm } from "@/components/forms/card-forms";
import { TransactionRow } from "@/components/app/transaction-row";
import { deleteCard, deleteInvoicePayment, setCardArchived } from "../actions";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listAccounts, listCategories } from "@/lib/queries";
import { INVOICE_STATUS_LABELS, invoiceClosingDate, invoiceStatus, type InvoiceStatus } from "@/lib/cards";
import { formatDateBR, formatMonthLong, isISODate, todayISO } from "@/lib/dates";
import { formatBRL, formatDecimalBR, percent } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Transaction } from "@/lib/types";

export const metadata: Metadata = { title: "Cartão" };

const STATUS_TONE: Record<InvoiceStatus, "neutral" | "money" | "danger" | "warning" | "navy"> = {
  open: "navy", closed: "warning", partial: "warning", paid: "money", overdue: "danger",
};

export default async function CardPage({ params, searchParams }: PageProps<"/app/cartoes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: card }, { data: invoiceRows }, accounts, categories, ent] = await Promise.all([
    supabase.from("card_summaries").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("card_invoices", { p_card: id }),
    listAccounts(),
    listCategories({ includeArchived: true }),
    getEntitlements(),
  ]);
  if (!card) notFound();
  const enabled = hasFeature(ent, "credit_cards");

  const invoices = ((invoiceRows ?? []) as Array<Record<string, string | number>>).map((r) => {
    const due = String(r.invoice_due_on);
    const total = Number(r.total_cents);
    const paid = Number(r.paid_cents);
    const closing = invoiceClosingDate(card.closing_day, card.due_day, due);
    return { due, total, paid, closing, remaining: Math.max(0, total - paid), status: invoiceStatus(total, paid, closing, due, today) };
  });

  const requested = typeof sp.fatura === "string" && isISODate(sp.fatura) ? sp.fatura : null;
  const current =
    invoices.find((i) => i.due === requested) ??
    invoices.find((i) => i.status !== "paid" && i.status !== "open") ??
    invoices.find((i) => i.status === "open") ??
    invoices.at(-1);

  const [{ data: purchases }, { data: payments }] = current
    ? await Promise.all([
        supabase.from("transactions").select("*").eq("card_id", id).eq("invoice_due_on", current.due).order("occurred_on", { ascending: false }),
        supabase.from("card_invoice_payments").select("id, amount_cents, paid_on, account_id").eq("card_id", id).eq("invoice_due_on", current.due).order("paid_on"),
      ])
    : [{ data: [] }, { data: [] }];

  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const limit = Number(card.limit_cents);
  const used = Number(card.used_cents);

  return (
    <div className="space-y-4">
      <Link href="/app/cartoes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Cartões
      </Link>
      <PageHeader
        title={card.name}
        description={`Fecha dia ${card.closing_day} · vence dia ${card.due_day}`}
        action={enabled && !card.archived_at ? (
          <ButtonLink href={`/app/lancamentos/novo?cartao=${card.id}`} variant="money" size="sm"><Plus className="h-4 w-4" aria-hidden /> Nova compra</ButtonLink>
        ) : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Limite disponível</p>
          <p className={`tabular text-3xl font-bold ${limit - used < 0 ? "text-danger-700" : "text-money-600"}`}>{formatBRL(limit - used)}</p>
          <div className="mt-3"><ProgressBar value={percent(used, limit) ?? 0} tone="navy" label="Limite usado" /></div>
          <p className="tabular mt-2 text-xs text-slate-500">Usado {formatBRL(used)} de {formatBRL(limit)} (inclui parcelas futuras)</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Faturas" />
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma compra registrada neste cartão.</p>
          ) : (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {invoices.map((i) => (
                <Link
                  key={i.due}
                  href={`/app/cartoes/${card.id}?fatura=${i.due}`}
                  aria-current={current?.due === i.due ? "true" : undefined}
                  className={cn("min-w-36 shrink-0 rounded-xl border p-3 text-sm", current?.due === i.due ? "border-navy-600 bg-navy-50" : "border-slate-200 hover:bg-slate-50")}
                >
                  <p className="font-semibold">{formatMonthLong(i.due)}</p>
                  <p className="tabular">{formatBRL(i.total)}</p>
                  <Badge tone={STATUS_TONE[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {current ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader
              title={`Fatura de ${formatMonthLong(current.due)}`}
              description={`Fecha em ${formatDateBR(current.closing)} · vence em ${formatDateBR(current.due)}`}
              action={<Badge tone={STATUS_TONE[current.status]}>{INVOICE_STATUS_LABELS[current.status]}</Badge>}
            />
            <dl className="mb-4 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-slate-500">Total</dt><dd className="tabular font-semibold">{formatBRL(current.total)}</dd></div>
              <div><dt className="text-xs text-slate-500">Pago</dt><dd className="tabular font-semibold text-money-700">{formatBRL(current.paid)}</dd></div>
              <div><dt className="text-xs text-slate-500">Falta pagar</dt><dd className="tabular font-semibold">{formatBRL(current.remaining)}</dd></div>
            </dl>
            <ul className="divide-y divide-slate-100">
              {((purchases ?? []) as Transaction[]).map((t) => (
                <TransactionRow key={t.id} tx={{ ...t, amount_cents: Number(t.amount_cents) }} category={t.category_id ? catById.get(t.category_id) : undefined} today={today} compact />
              ))}
            </ul>
          </Card>

          <div className="space-y-4 lg:col-span-2">
            {current.remaining > 0 ? (
              <Card>
                <CardHeader title="Pagar fatura" />
                {accounts.length ? (
                  <PayInvoiceForm cardId={card.id} dueOn={current.due} remaining={formatDecimalBR(current.remaining)} accounts={accounts} today={today} />
                ) : (
                  <p className="text-sm text-slate-600">Cadastre uma conta para registrar o pagamento.</p>
                )}
              </Card>
            ) : null}
            {payments?.length ? (
              <Card>
                <CardHeader title="Pagamentos desta fatura" />
                <ul className="divide-y divide-slate-100 text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <span className="flex-1">{formatDateBR(p.paid_on)} · {accById.get(p.account_id)?.name ?? "Conta"}</span>
                      <span className="tabular font-semibold">{formatBRL(Number(p.amount_cents))}</span>
                      <ActionForm action={deleteInvoicePayment} hidden={{ id: p.id }}>
                        <ConfirmButton variant="ghost" size="sm" aria-label="Excluir pagamento" message="Excluir este pagamento de fatura?">×</ConfirmButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card>
        <details>
          <summary className="cursor-pointer font-semibold">Editar cartão</summary>
          <div className="mt-4 space-y-4">
            {enabled ? (
              <CardForm defaults={{ id: card.id, name: card.name, limit: formatDecimalBR(limit), closing_day: card.closing_day, due_day: card.due_day, color: card.color }} />
            ) : (
              <p className="text-sm text-slate-600">A edição de cartões faz parte do plano Pro.</p>
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
              <ActionForm action={setCardArchived} hidden={{ id: card.id, archive: card.archived_at ? "0" : "1" }}>
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">{card.archived_at ? "Reativar" : "Arquivar"}</button>
              </ActionForm>
              <ActionForm action={deleteCard} hidden={{ id: card.id }}>
                <ConfirmButton variant="ghost" size="sm" className="text-danger-700" message="Excluir este cartão? Só é possível excluir cartões sem compras.">Excluir</ConfirmButton>
              </ActionForm>
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}
