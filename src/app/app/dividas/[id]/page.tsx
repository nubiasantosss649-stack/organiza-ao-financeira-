import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, ProgressBar } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ActionForm } from "@/components/forms/action-form";
import { DebtForm, DebtPaymentForm } from "@/components/forms/debt-forms";
import { Assumptions } from "@/components/app/assumptions";
import { BalanceLines } from "@/components/charts/balance-lines";
import { deleteDebt, deleteDebtPayment, setDebtStatus } from "../actions";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDebt, minimumPayment } from "@/lib/debt-queries";
import { listAccounts } from "@/lib/queries";
import { DEBT_ASSUMPTIONS, DEBT_KIND_LABELS, annualRatePct, compareEarlyPayoff, formatRateBp } from "@/lib/debts";
import { formatDateBR, todayISO } from "@/lib/dates";
import { formatBRL, formatDecimalBR, parseBRL, percent } from "@/lib/money";

export const metadata: Metadata = { title: "Dívida" };

function months(n: number) {
  return Number.isFinite(n) ? `${n} ${n === 1 ? "mês" : "meses"}` : "não quita";
}

export default async function DebtPage({ params, searchParams }: PageProps<"/app/dividas/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const today = todayISO();
  const supabase = await createClient();
  const [d, { data: payments }, accounts, ent] = await Promise.all([
    getDebt(id),
    supabase.from("debt_payments").select("id, amount_cents, paid_on, note, transaction_id").eq("debt_id", id).order("paid_on", { ascending: false }).limit(200),
    listAccounts(),
    getEntitlements(),
  ]);
  if (!d) notFound();
  const enabled = hasFeature(ent, "debts");

  const monthly = (typeof sp.parcela === "string" ? parseBRL(sp.parcela) : null) ?? minimumPayment(d);
  const extra = (typeof sp.extra === "string" ? parseBRL(sp.extra) : null) ?? 0;
  const lump = (typeof sp.avista === "string" ? parseBRL(sp.avista) : null) ?? 0;
  const sim = compareEarlyPayoff(d.remaining_cents, d.monthly_rate_bp, Math.max(1, monthly), Math.max(0, extra), Math.max(0, lump));

  return (
    <div className="space-y-4">
      <Link href="/app/dividas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Minhas dívidas
      </Link>
      <PageHeader
        title={d.name}
        description={`${DEBT_KIND_LABELS[d.kind]}${d.creditor ? ` · ${d.creditor}` : ""}`}
        action={d.status !== "active" ? <Badge tone={d.status === "paid" ? "money" : "neutral"}>{d.status === "paid" ? "Quitada" : "Arquivada"}</Badge> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm text-slate-500">Saldo restante</p>
                <p className="tabular text-3xl font-bold">{formatBRL(d.remaining_cents)}</p>
              </div>
              <p className="text-right text-sm text-slate-500">
                Juros: <strong className="text-navy-900">{formatRateBp(d.monthly_rate_bp)}</strong>
                <span className="block text-xs">≈ {annualRatePct(d.monthly_rate_bp).toLocaleString("pt-BR")}% ao ano</span>
              </p>
            </div>
            <div className="mt-3"><ProgressBar value={percent(d.paid_since_cents, d.balance_cents) ?? 0} label="Quitado" /></div>
            <p className="mt-2 text-xs text-slate-500">
              Saldo informado: {formatBRL(d.balance_cents)} em {formatDateBR(d.balance_date)} · pagos desde então: {formatBRL(d.paid_since_cents)}.
              O saldo restante não inclui juros que corram depois dessa data; atualize o saldo quando receber o extrato do credor.
            </p>
            {d.remaining_cents === 0 && d.status === "active" ? (
              <ActionForm action={setDebtStatus} hidden={{ id: d.id, status: "paid" }} className="mt-3">
                <button className="rounded-xl bg-money-500 px-4 py-2 text-sm font-semibold text-white">🎉 Marcar como quitada</button>
              </ActionForm>
            ) : null}
          </Card>

          {d.remaining_cents > 0 ? (
            <Card>
              <CardHeader title="Simular quitação antecipada" description="Veja quanto tempo e quanto de juros você economiza pagando mais." />
              <form action={`/app/dividas/${d.id}`} className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label htmlFor="parcela" className="label">Pagamento mensal</label>
                  <input id="parcela" name="parcela" inputMode="decimal" defaultValue={formatDecimalBR(monthly)} className="input tabular" />
                </div>
                <div>
                  <label htmlFor="extra" className="label">Extra por mês</label>
                  <input id="extra" name="extra" inputMode="decimal" defaultValue={formatDecimalBR(extra)} className="input tabular" />
                </div>
                <div>
                  <label htmlFor="avista" className="label">Valor à vista agora</label>
                  <input id="avista" name="avista" inputMode="decimal" defaultValue={formatDecimalBR(lump)} className="input tabular" />
                </div>
                <div className="flex items-end"><button className="h-11 w-full rounded-xl bg-navy-900 text-sm font-semibold text-white">Simular</button></div>
              </form>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-semibold">Plano atual</p>
                  {sim.base.neverPaysOff ? (
                    <p className="mt-1 text-danger-700">O pagamento mensal não cobre os juros: a dívida não diminui.</p>
                  ) : (
                    <p className="mt-1 tabular">Quita em <strong>{months(sim.base.months)}</strong> · juros {formatBRL(sim.base.totalInterestCents)}</p>
                  )}
                </div>
                <div className="rounded-xl border border-money-100 bg-money-50/50 p-3 text-sm">
                  <p className="font-semibold">Com pagamento extra</p>
                  {sim.withExtra.neverPaysOff ? (
                    <p className="mt-1 text-danger-700">Ainda não cobre os juros.</p>
                  ) : (
                    <>
                      <p className="mt-1 tabular">Quita em <strong>{months(sim.withExtra.months)}</strong> · juros {formatBRL(sim.withExtra.totalInterestCents)}</p>
                      {sim.monthsSaved !== null && sim.interestSavedCents !== null && (sim.monthsSaved > 0 || sim.interestSavedCents > 0) ? (
                        <p className="mt-1 font-semibold text-money-700">
                          Economia: {formatBRL(sim.interestSavedCents)} em juros e {months(sim.monthsSaved)} a menos.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              {!sim.base.neverPaysOff || !sim.withExtra.neverPaysOff ? (
                <div className="mt-4">
                  <BalanceLines series={[
                    { key: "atual", label: "Plano atual", values: sim.base.balances },
                    { key: "extra", label: "Com pagamento extra", values: sim.withExtra.balances },
                  ]} />
                </div>
              ) : null}
              <div className="mt-3"><Assumptions items={[...DEBT_ASSUMPTIONS, "Quitação antecipada pode ter desconto de juros futuros garantido por lei (CDC, art. 52); confirme o valor exato com o credor."]} /></div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Pagamentos" description={`${payments?.length ?? 0} registrados`} />
            {payments?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <span className="w-20 shrink-0 text-xs text-slate-500">{formatDateBR(p.paid_on)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{p.note ?? (p.transaction_id ? "Lançado como despesa" : "Pagamento")}</span>
                    <span className="tabular font-semibold">{formatBRL(Number(p.amount_cents))}</span>
                    <ActionForm action={deleteDebtPayment} hidden={{ id: p.id, with_tx: p.transaction_id ? "1" : "0" }}>
                      <ConfirmButton variant="ghost" size="sm" aria-label="Excluir pagamento" message={p.transaction_id ? "Excluir este pagamento e a despesa lançada junto?" : "Excluir este pagamento?"}>×</ConfirmButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nenhum pagamento registrado ainda.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {d.status === "active" ? (
            <Card>
              <CardHeader title="Registrar pagamento" />
              <DebtPaymentForm debtId={d.id} today={today} suggested={formatDecimalBR(Math.min(d.installment_cents ?? d.remaining_cents, d.remaining_cents || 1))} accounts={accounts} />
            </Card>
          ) : null}
          <Card>
            <details>
              <summary className="cursor-pointer font-semibold">Editar / atualizar saldo</summary>
              <div className="mt-4">
                {enabled ? (
                  <DebtForm today={today} defaults={{
                    id: d.id, name: d.name, creditor: d.creditor ?? "", kind: d.kind,
                    balance: formatDecimalBR(d.balance_cents), balance_date: d.balance_date,
                    rate: (d.monthly_rate_bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
                    installment: d.installment_cents ? formatDecimalBR(d.installment_cents) : "",
                    installments_total: d.installments_total ? String(d.installments_total) : "",
                    due_day: d.due_day ? String(d.due_day) : "", notes: d.notes ?? "",
                  }} />
                ) : (
                  <p className="text-sm text-slate-600">A edição de dívidas faz parte do plano Pro. Você continua podendo registrar pagamentos.</p>
                )}
                <p className="mt-2 text-xs text-slate-500">Para atualizar com o extrato do credor, informe o novo saldo devedor e a data dele: só os pagamentos a partir dessa data serão descontados.</p>
              </div>
            </details>
          </Card>
          <Card>
            <CardHeader title="Situação" />
            <div className="flex flex-wrap gap-2">
              {d.status !== "active" ? (
                <ActionForm action={setDebtStatus} hidden={{ id: d.id, status: "active" }}>
                  <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Reativar</button>
                </ActionForm>
              ) : (
                <>
                  <ActionForm action={setDebtStatus} hidden={{ id: d.id, status: "paid" }}>
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Marcar como quitada</button>
                  </ActionForm>
                  <ActionForm action={setDebtStatus} hidden={{ id: d.id, status: "archived" }}>
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Arquivar</button>
                  </ActionForm>
                </>
              )}
              <ActionForm action={deleteDebt} hidden={{ id: d.id }}>
                <ConfirmButton variant="ghost" size="sm" className="text-danger-700" message="Excluir esta dívida e o histórico de pagamentos? Despesas lançadas nas contas são mantidas.">Excluir</ConfirmButton>
              </ActionForm>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
