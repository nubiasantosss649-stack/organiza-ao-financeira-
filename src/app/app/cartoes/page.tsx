import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/card";
import { PremiumFeature } from "@/components/app/premium-gate";
import { CardForm } from "@/components/forms/card-forms";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { listCards, openCardInvoices } from "@/lib/queries";
import { addMonths, formatDateBR, todayISO } from "@/lib/dates";
import { formatBRL, percent } from "@/lib/money";

export const metadata: Metadata = { title: "Cartões de crédito" };

async function CardsContent({ canCreate }: { canCreate: boolean }) {
  const today = todayISO();
  const [cards, invoices] = await Promise.all([listCards({ includeArchived: true }), openCardInvoices(addMonths(today, 24))]);
  const active = cards.filter((c) => !c.archived_at);
  const archived = cards.filter((c) => c.archived_at);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        {active.length === 0 ? (
          <Card><EmptyState icon={<CreditCard className="h-6 w-6" />} title="Nenhum cartão cadastrado" description="Cadastre seu cartão com limite, fechamento e vencimento para acompanhar as faturas." /></Card>
        ) : (
          active.map((c) => {
            const available = c.limit_cents - c.used_cents;
            const usedPct = percent(c.used_cents, c.limit_cents) ?? 0;
            const next = invoices.find((i) => i.card_id === c.id);
            return (
              <Link key={c.id} href={`/app/cartoes/${c.id}`} className="card block p-4 transition hover:border-navy-600/40 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-14 items-center justify-center rounded-lg text-white" style={{ background: c.color }} aria-hidden>
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-xs text-slate-500">Fecha dia {c.closing_day} · vence dia {c.due_day}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Disponível</p>
                    <p className={`tabular font-bold ${available < 0 ? "text-danger-700" : "text-money-700"}`}>{formatBRL(available)}</p>
                  </div>
                </div>
                <div className="mt-3"><ProgressBar value={usedPct} tone={usedPct >= 90 ? "danger" : usedPct >= 70 ? "warning" : "navy"} label={`Limite usado do cartão ${c.name}`} /></div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span className="tabular">Usado {formatBRL(c.used_cents)} de {formatBRL(c.limit_cents)}</span>
                  {next ? <span className="tabular font-medium text-navy-900">Próxima fatura: {formatBRL(next.remaining_cents)} em {formatDateBR(next.invoice_due_on)}</span> : <span>Sem faturas em aberto</span>}
                </div>
              </Link>
            );
          })
        )}
        {archived.length ? (
          <Card>
            <CardHeader title="Arquivados" />
            <ul className="divide-y divide-slate-100 text-sm">
              {archived.map((c) => (
                <li key={c.id}><Link href={`/app/cartoes/${c.id}`} className="flex justify-between py-2"><span>{c.name}</span><span className="tabular text-slate-500">{formatBRL(c.used_cents)} em uso</span></Link></li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
      <div className="space-y-4 lg:col-span-2">
        {canCreate ? (
          <Card>
            <CardHeader title="Novo cartão" />
            <CardForm />
          </Card>
        ) : null}
        <Card className="bg-navy-50/60 text-sm text-slate-700">
          <p className="font-semibold text-navy-900">Como o Controle Fácil conta os gastos do cartão</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Cada compra é uma despesa na data em que foi feita, na categoria escolhida.</li>
            <li>Parcelas entram uma em cada fatura e reservam o limite desde a compra.</li>
            <li>Pagar a fatura tira o dinheiro da conta, mas não conta como nova despesa — assim nada é contado duas vezes.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default async function CardsPage() {
  const [ent, cards] = await Promise.all([getEntitlements(), listCards({ includeArchived: true })]);
  const enabled = hasFeature(ent, "credit_cards");
  return (
    <PremiumFeature
      feature="credit_cards"
      title="Cartões de crédito"
      headline="Tenha mais controle sobre o seu dinheiro."
      description="Controle limite, fechamento e vencimento das faturas, compras parceladas e pagamentos, sem contar o mesmo gasto duas vezes quando a fatura for paga."
      icon={<CreditCard className="h-6 w-6" />}
      benefits={[
        "Cadastro de cartões com limite, fechamento e vencimento",
        "Compras parceladas distribuídas nas faturas certas",
        "Limite disponível sempre atualizado",
        "Visualização e pagamento de faturas",
      ]}
      hasExistingData={cards.length > 0}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cartões de crédito</h1>
          <p className="mt-1 text-sm text-slate-500">Limites, faturas e compras parceladas.</p>
        </div>
      </div>
      <CardsContent canCreate={enabled} />
    </PremiumFeature>
  );
}
