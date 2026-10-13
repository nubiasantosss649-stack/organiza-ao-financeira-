"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { useEffect, useRef } from "react";
import { createBudget, updateBudgetAmount } from "@/app/app/orcamentos/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "./form-message";

export function BudgetForm({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const { state, onSubmit, pending } = useFormAction(createBudget);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Aplicar a" htmlFor="budget-category" error={fieldError(state, "category_id")}
        hint="O orçamento geral soma todas as despesas do mês.">
        <select id="budget-category" name="category_id" className="input" defaultValue="">
          <option value="">Orçamento geral (todas as despesas)</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Limite mensal (R$)" htmlFor="budget-amount" error={fieldError(state, "amount")}>
        <input id="budget-amount" name="amount" inputMode="decimal" placeholder="0,00" className="input tabular" />
      </Field>
      <SubmitButton pending={pending}>Criar orçamento</SubmitButton>
    </form>
  );
}

export function BudgetAmountForm({ id, amount }: { id: string; amount: string }) {
  const { state, onSubmit, pending } = useFormAction(updateBudgetAmount);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field label="Novo limite (R$)" htmlFor={`amount-${id}`} error={fieldError(state, "amount") ?? state.error}>
        <input id={`amount-${id}`} name="amount" inputMode="decimal" defaultValue={amount} className="input tabular w-40" />
      </Field>
      <SubmitButton pending={pending} size="sm" variant="secondary">Salvar</SubmitButton>
      {state.ok ? <span className="pb-2 text-sm text-money-700">{state.message}</span> : null}
    </form>
  );
}
