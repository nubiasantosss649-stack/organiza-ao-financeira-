import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, ProgressBar } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ActionForm } from "@/components/forms/action-form";
import { DepositForm, GoalForm } from "@/components/forms/goal-forms";
import { deleteGoal, deleteGoalDeposit, setGoalStatus } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateBR, todayISO } from "@/lib/dates";
import { goalPlan } from "@/lib/finance";
import { formatBRL, formatDecimalBR } from "@/lib/money";
import { GOAL_KIND_LABELS, type GoalProgress } from "@/lib/types";

export const metadata: Metadata = { title: "Meta" };

export default async function GoalPage({ params }: PageProps<"/app/metas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: goalRow }, { data: deposits }] = await Promise.all([
    supabase.from("goal_progress").select("*").eq("id", id).maybeSingle(),
    supabase.from("goal_deposits").select("id, amount_cents, deposited_on, note").eq("goal_id", id)
      .order("deposited_on", { ascending: false }).order("created_at", { ascending: false }).limit(200),
  ]);
  if (!goalRow) notFound();
  const g = { ...goalRow, saved_cents: Number(goalRow.saved_cents), target_cents: Number(goalRow.target_cents) } as GoalProgress;
  const today = todayISO();
  const plan = goalPlan(g.target_cents, g.saved_cents, g.target_date, today);

  return (
    <div className="space-y-4">
      <Link href="/app/metas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Minhas metas
      </Link>
      <PageHeader
        title={g.name}
        description={GOAL_KIND_LABELS[g.kind]}
        action={g.status !== "active" ? <Badge tone={g.status === "completed" ? "money" : "neutral"}>{g.status === "completed" ? "Concluída" : "Arquivada"}</Badge> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm text-slate-500">Guardado</p>
                <p className="tabular text-3xl font-bold text-money-600">{formatBRL(g.saved_cents)}</p>
              </div>
              <p className="tabular text-sm text-slate-500">Meta: <strong className="text-navy-900">{formatBRL(g.target_cents)}</strong></p>
            </div>
            <div className="mt-3"><ProgressBar value={plan.progressPct} label="Progresso da meta" /></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Falta</dt><dd className="tabular font-semibold">{formatBRL(plan.remainingCents)}</dd></div>
              <div><dt className="text-xs text-slate-500">Prazo</dt><dd className="font-semibold">{g.target_date ? formatDateBR(g.target_date) : "Sem prazo"}</dd></div>
              <div>
                <dt className="text-xs text-slate-500">Guardar por mês</dt>
                <dd className="tabular font-semibold">{plan.monthlyNeededCents !== null ? formatBRL(plan.monthlyNeededCents) : "—"}</dd>
              </div>
            </dl>
            {plan.monthlyNeededCents && plan.monthsLeft ? (
              <p className="mt-3 text-xs text-slate-500">
                Cálculo: valor que falta dividido pelos {plan.monthsLeft} {plan.monthsLeft === 1 ? "mês restante" : "meses restantes"} até o prazo (incluindo o mês atual), arredondado para cima. Não considera rendimentos.
              </p>
            ) : null}
            {plan.overdue ? <p className="mt-2 text-sm font-medium text-danger-700">O prazo passou. Que tal definir uma nova data?</p> : null}
            {plan.completed && g.status === "active" ? (
              <ActionForm action={setGoalStatus} hidden={{ id: g.id, status: "completed" }} className="mt-4">
                <button className="rounded-xl bg-money-500 px-4 py-2 text-sm font-semibold text-white">🎉 Marcar meta como concluída</button>
              </ActionForm>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Histórico" description={`${deposits?.length ?? 0} registros`} />
            {deposits?.length ? (
              <ul className="divide-y divide-slate-100">
                {deposits.map((d) => {
                  const amount = Number(d.amount_cents);
                  return (
                    <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-20 shrink-0 text-xs text-slate-500">{formatDateBR(d.deposited_on)}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-600">{d.note ?? (amount > 0 ? "Depósito" : "Retirada")}</span>
                      <span className={`tabular font-semibold ${amount > 0 ? "text-money-700" : "text-danger-700"}`}>{amount > 0 ? "+" : "−"} {formatBRL(Math.abs(amount))}</span>
                      <ActionForm action={deleteGoalDeposit} hidden={{ id: d.id }}>
                        <ConfirmButton variant="ghost" size="sm" aria-label="Excluir registro" message="Excluir este registro?">×</ConfirmButton>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-slate-500">Nenhum depósito ainda. Registre o primeiro valor guardado!</p>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {g.status === "active" ? (
            <Card>
              <CardHeader title="Registrar valor" />
              <DepositForm goalId={g.id} today={today} />
            </Card>
          ) : null}
          <Card>
            <details>
              <summary className="cursor-pointer font-semibold">Editar meta</summary>
              <div className="mt-4">
                <GoalForm defaults={{ id: g.id, name: g.name, kind: g.kind, target: formatDecimalBR(g.target_cents), target_date: g.target_date ?? "" }} />
              </div>
            </details>
          </Card>
          <Card>
            <CardHeader title="Situação" />
            <div className="flex flex-wrap gap-2">
              {g.status !== "active" ? (
                <ActionForm action={setGoalStatus} hidden={{ id: g.id, status: "active" }}>
                  <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Reativar</button>
                </ActionForm>
              ) : (
                <>
                  <ActionForm action={setGoalStatus} hidden={{ id: g.id, status: "completed" }}>
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Marcar como concluída</button>
                  </ActionForm>
                  <ActionForm action={setGoalStatus} hidden={{ id: g.id, status: "archived" }}>
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Arquivar</button>
                  </ActionForm>
                </>
              )}
              <ActionForm action={deleteGoal} hidden={{ id: g.id }}>
                <ConfirmButton variant="ghost" size="sm" className="text-danger-700" message="Excluir esta meta e todo o histórico de depósitos?">Excluir meta</ConfirmButton>
              </ActionForm>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
