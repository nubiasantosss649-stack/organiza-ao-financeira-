import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { AccountForm } from "@/components/forms/account-form";
import { PlanLimitNotice } from "@/components/app/plan-limit-notice";
import { ActionForm } from "@/components/forms/action-form";
import { deleteAccount, setAccountArchived } from "./actions";
import { getEntitlements } from "@/lib/auth";
import { listAccounts } from "@/lib/queries";
import { canCreate } from "@/lib/finance";
import { formatDecimalBR, sumCents } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Contas e carteiras" };

export default async function AccountsPage() {
  const [accounts, ent] = await Promise.all([listAccounts({ includeArchived: true }), getEntitlements()]);
  const active = accounts.filter((a) => !a.archived_at);
  const archived = accounts.filter((a) => a.archived_at);
  const total = sumCents(active.map((a) => Number(a.balance_cents)));
  const allowed = canCreate(ent.limits.accounts, ent.usage.accounts);

  return (
    <div className="space-y-5">
      <PageHeader title="Contas e carteiras" description="Onde seu dinheiro está: bancos, carteiras digitais e dinheiro em espécie." />
      <PlanLimitNotice used={ent.usage.accounts} limit={ent.limits.accounts} noun="contas ativas" />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader title="Contas ativas" description={<>Saldo somado: <Money cents={total} className="font-semibold text-navy-900" /></>} />
            {active.length === 0 ? (
              <EmptyState icon={<Wallet className="h-6 w-6" />} title="Nenhuma conta cadastrada" description="Adicione sua primeira conta para começar a registrar lançamentos." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {active.map((a) => (
                  <li key={a.id} className="py-3">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3">
                        <span className="h-9 w-9 shrink-0 rounded-xl" style={{ background: a.color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.name}</span>
                          <span className="block text-xs text-slate-500">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                        </span>
                        <Money cents={Number(a.balance_cents)} className={`font-semibold ${Number(a.balance_cents) < 0 ? "text-danger-700" : ""}`} />
                        <span className="text-xs text-navy-600 group-open:hidden">Editar</span>
                      </summary>
                      <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4">
                        <AccountForm defaults={{ id: a.id, name: a.name, type: a.type, initial_balance: formatDecimalBR(Number(a.initial_balance_cents)), color: a.color }} />
                        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                          <ActionForm action={setAccountArchived} hidden={{ id: a.id, archive: "1" }}>
                            <ConfirmButton variant="secondary" size="sm" message="Arquivar esta conta? Os lançamentos continuam no histórico e você pode reativá-la depois.">Arquivar</ConfirmButton>
                          </ActionForm>
                          <ActionForm action={deleteAccount} hidden={{ id: a.id }}>
                            <ConfirmButton variant="ghost" size="sm" className="text-danger-700" message="Excluir esta conta? Só é possível excluir contas sem lançamentos.">Excluir</ConfirmButton>
                          </ActionForm>
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {archived.length ? (
            <Card>
              <CardHeader title="Arquivadas" description="Continuam no histórico e no saldo total do painel." />
              <ul className="divide-y divide-slate-100">
                {archived.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className="h-7 w-7 shrink-0 rounded-lg opacity-50" style={{ background: a.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.name} <Badge>Arquivada</Badge></span>
                    <Money cents={Number(a.balance_cents)} className="text-sm" />
                    <ActionForm action={setAccountArchived} hidden={{ id: a.id, archive: "0" }}>
                      <button className="text-sm font-medium text-navy-600 hover:underline">Reativar</button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="Nova conta" />
          {allowed ? (
            <AccountForm />
          ) : (
            <p className="text-sm text-slate-600">
              Você já usa as {ent.limits.accounts} contas do plano Grátis. Arquive uma conta que não usa mais ou conheça o Pro para ter contas ilimitadas.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
