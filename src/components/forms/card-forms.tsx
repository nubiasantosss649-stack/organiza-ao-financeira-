"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { payInvoice, saveCard } from "@/app/app/cartoes/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "./form-message";
import { ColorPicker } from "./account-form";

export function CardForm({
  defaults,
}: {
  defaults?: { id: string; name: string; limit: string; closing_day: number; due_day: number; color: string };
}) {
  const { state, onSubmit, pending } = useFormAction(saveCard);
  const p = defaults?.id ?? "new";
  const err = (n: string) => fieldError(state, n);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do cartão" htmlFor={`card-name-${p}`} error={err("name")}>
          <input id={`card-name-${p}`} name="name" maxLength={40} defaultValue={defaults?.name} placeholder="Ex.: Nubank, Visa Itaú" className="input" />
        </Field>
        <Field label="Limite total (R$)" htmlFor={`card-limit-${p}`} error={err("limit")}>
          <input id={`card-limit-${p}`} name="limit" inputMode="decimal" defaultValue={defaults?.limit} placeholder="0,00" className="input tabular" />
        </Field>
        <Field label="Dia do fechamento" htmlFor={`card-closing-${p}`} error={err("closing_day")} hint="Compras a partir deste dia vão para a próxima fatura.">
          <input id={`card-closing-${p}`} name="closing_day" type="number" min={1} max={31} defaultValue={defaults?.closing_day} className="input w-28" />
        </Field>
        <Field label="Dia do vencimento" htmlFor={`card-due-${p}`} error={err("due_day")}>
          <input id={`card-due-${p}`} name="due_day" type="number" min={1} max={31} defaultValue={defaults?.due_day} className="input w-28" />
        </Field>
      </div>
      <ColorPicker defaultValue={defaults?.color ?? "#0B2545"} />
      <SubmitButton pending={pending}>{defaults ? "Salvar alterações" : "Adicionar cartão"}</SubmitButton>
    </form>
  );
}

export function PayInvoiceForm({
  cardId,
  dueOn,
  remaining,
  accounts,
  today,
}: {
  cardId: string;
  dueOn: string;
  remaining: string;
  accounts: Array<{ id: string; name: string }>;
  today: string;
}) {
  const { state, onSubmit, pending } = useFormAction(payInvoice);
  const err = (n: string) => fieldError(state, n);
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="card_id" value={cardId} />
      <input type="hidden" name="invoice_due_on" value={dueOn} />
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Valor (R$)" htmlFor="pay-amount" error={err("amount")}>
          <input id="pay-amount" name="amount" inputMode="decimal" defaultValue={remaining} className="input tabular" />
        </Field>
        <Field label="Pago com a conta" htmlFor="pay-account" error={err("account_id")}>
          <select id="pay-account" name="account_id" className="input">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Data do pagamento" htmlFor="pay-date" error={err("paid_on")}>
          <input id="pay-date" name="paid_on" type="date" defaultValue={today} className="input" />
        </Field>
      </div>
      <SubmitButton pending={pending} variant="money" size="sm">Registrar pagamento da fatura</SubmitButton>
      <p className="text-xs text-slate-500">
        O pagamento sai do saldo da conta, mas não é contado como nova despesa: os gastos já foram registrados em cada compra.
      </p>
    </form>
  );
}
