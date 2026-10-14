"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { useEffect, useRef, useState } from "react";
import { addGoalDeposit, saveGoal } from "@/app/app/metas/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "./form-message";
import { GOAL_KIND_LABELS } from "@/lib/types";
import { cn } from "@/lib/cn";

export function GoalForm({
  defaults,
  suggestions,
}: {
  defaults?: { id: string; name: string; kind: string; target: string; target_date: string };
  suggestions?: Array<{ label: string; name: string; kind: string; target?: string }>;
}) {
  const { state, onSubmit, pending } = useFormAction(saveGoal);
  const nameRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<HTMLSelectElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const p = defaults?.id ?? "new";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <FormMessage state={state} />
      {suggestions?.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Sugestões">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-navy-600"
              onClick={() => {
                if (nameRef.current) nameRef.current.value = s.name;
                if (kindRef.current) kindRef.current.value = s.kind;
                if (targetRef.current && s.target) targetRef.current.value = s.target;
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <Field label="Nome da meta" htmlFor={`goal-name-${p}`} error={fieldError(state, "name")}>
        <input ref={nameRef} id={`goal-name-${p}`} name="name" maxLength={60} defaultValue={defaults?.name} placeholder="Ex.: Viagem de férias" className="input" />
      </Field>
      <Field label="Tipo" htmlFor={`goal-kind-${p}`}>
        <select ref={kindRef} id={`goal-kind-${p}`} name="kind" defaultValue={defaults?.kind ?? "savings"} className="input">
          {Object.entries(GOAL_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor desejado (R$)" htmlFor={`goal-target-${p}`} error={fieldError(state, "target")}>
          <input ref={targetRef} id={`goal-target-${p}`} name="target" inputMode="decimal" defaultValue={defaults?.target} placeholder="5.000,00" className="input tabular" />
        </Field>
        <Field label="Prazo (opcional)" htmlFor={`goal-date-${p}`} error={fieldError(state, "target_date")}>
          <input id={`goal-date-${p}`} name="target_date" type="date" defaultValue={defaults?.target_date} className="input" />
        </Field>
      </div>
      <SubmitButton pending={pending} variant={defaults ? "primary" : "money"}>{defaults ? "Salvar alterações" : "Criar meta"}</SubmitButton>
    </form>
  );
}

export function DepositForm({ goalId, today }: { goalId: string; today: string }) {
  const { state, onSubmit, pending } = useFormAction(addGoalDeposit);
  const [direction, setDirection] = useState<"deposit" | "withdraw">("deposit");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="goal_id" value={goalId} />
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(["deposit", "withdraw"] as const).map((d) => (
          <label key={d} className={cn("cursor-pointer rounded-lg py-2 text-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-600", direction === d ? "bg-white shadow text-navy-900" : "text-slate-600")}>
            <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />
            {d === "deposit" ? "Guardar" : "Retirar"}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" htmlFor="dep-amount" error={fieldError(state, "amount")}>
          <input id="dep-amount" name="amount" inputMode="decimal" placeholder="0,00" className="input tabular" />
        </Field>
        <Field label="Data" htmlFor="dep-date" error={fieldError(state, "deposited_on")}>
          <input id="dep-date" name="deposited_on" type="date" defaultValue={today} className="input" />
        </Field>
      </div>
      <Field label="Observação (opcional)" htmlFor="dep-note">
        <input id="dep-note" name="note" maxLength={200} className="input" />
      </Field>
      <SubmitButton pending={pending} variant={direction === "deposit" ? "money" : "secondary"}>
        {direction === "deposit" ? "Registrar depósito" : "Registrar retirada"}
      </SubmitButton>
      <p className="text-xs text-slate-500">
        O registro na meta serve para acompanhar o progresso; ele não movimenta o saldo das suas contas.
      </p>
    </form>
  );
}
