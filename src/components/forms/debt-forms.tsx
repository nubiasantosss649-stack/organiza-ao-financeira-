"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { addDebtPayment, saveDebt } from "@/app/app/dividas/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "./form-message";
import { DEBT_KIND_LABELS } from "@/lib/debts";


export interface DebtDefaults {
  id: string;
  name: string;
  creditor: string;
  kind: string;
  balance: string;
  balance_date: string;
  rate: string;
  installment: string;
  installments_total: string;
  due_day: string;
  notes: string;
}

export function DebtForm({ defaults, today }: { defaults?: DebtDefaults; today: string }) {
  const { state, onSubmit, pending } = useFormAction(saveDebt);
  const p = defaults?.id ?? "new";
  const err = (n: string) => fieldError(state, n);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={`d-name-${p}`} error={err("name")}>
          <input id={`d-name-${p}`} name="name" maxLength={60} defaultValue={defaults?.name} placeholder="Ex.: Empréstimo pessoal" className="input" />
        </Field>
        <Field label="Credor (opcional)" htmlFor={`d-creditor-${p}`}>
          <input id={`d-creditor-${p}`} name="creditor" maxLength={60} defaultValue={defaults?.creditor} placeholder="Ex.: Banco X" className="input" />
        </Field>
        <Field label="Tipo" htmlFor={`d-kind-${p}`}>
          <select id={`d-kind-${p}`} name="kind" defaultValue={defaults?.kind ?? "loan"} className="input">
            {Object.entries(DEBT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Juros ao mês (%)" htmlFor={`d-rate-${p}`} error={err("rate")} hint="Veja no contrato ou no app do banco. Ex.: 2,99. Use 0 se não houver juros.">
          <input id={`d-rate-${p}`} name="rate" inputMode="decimal" defaultValue={defaults?.rate ?? "0"} className="input tabular" />
        </Field>
        <Field label="Saldo devedor hoje (R$)" htmlFor={`d-balance-${p}`} error={err("balance")}>
          <input id={`d-balance-${p}`} name="balance" inputMode="decimal" defaultValue={defaults?.balance} placeholder="0,00" className="input tabular" />
        </Field>
        <Field label="Data desse saldo" htmlFor={`d-bdate-${p}`} error={err("balance_date")}>
          <input id={`d-bdate-${p}`} name="balance_date" type="date" defaultValue={defaults?.balance_date ?? today} className="input" />
        </Field>
        <Field label="Parcela mensal (R$, opcional)" htmlFor={`d-inst-${p}`} error={err("installment")}>
          <input id={`d-inst-${p}`} name="installment" inputMode="decimal" defaultValue={defaults?.installment} className="input tabular" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nº de parcelas" htmlFor={`d-total-${p}`} error={err("installments_total")}>
            <input id={`d-total-${p}`} name="installments_total" type="number" min={1} max={600} defaultValue={defaults?.installments_total} className="input" />
          </Field>
          <Field label="Vencimento (dia)" htmlFor={`d-due-${p}`} error={err("due_day")}>
            <input id={`d-due-${p}`} name="due_day" type="number" min={1} max={31} defaultValue={defaults?.due_day} className="input" />
          </Field>
        </div>
      </div>
      <Field label="Observações" htmlFor={`d-notes-${p}`}>
        <textarea id={`d-notes-${p}`} name="notes" rows={2} maxLength={500} defaultValue={defaults?.notes} className="input" />
      </Field>
      <SubmitButton pending={pending}>{defaults ? "Salvar alterações" : "Cadastrar dívida"}</SubmitButton>
    </form>
  );
}

export function DebtPaymentForm({
  debtId, today, suggested, accounts,
}: { debtId: string; today: string; suggested: string; accounts: Array<{ id: string; name: string }> }) {
  const { state, onSubmit, pending } = useFormAction(addDebtPayment);
  const err = (n: string) => fieldError(state, n);
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="debt_id" value={debtId} />
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor pago (R$)" htmlFor="dp-amount" error={err("amount")}>
          <input id="dp-amount" name="amount" inputMode="decimal" defaultValue={suggested} className="input tabular" />
        </Field>
        <Field label="Data" htmlFor="dp-date" error={err("paid_on")}>
          <input id="dp-date" name="paid_on" type="date" defaultValue={today} className="input" />
        </Field>
      </div>
      <Field label="Lançar também como despesa paga na conta" htmlFor="dp-account" hint="Escolha uma conta para o pagamento aparecer nos seus gastos e no saldo. Deixe em branco se você já lançou essa despesa.">
        <select id="dp-account" name="account_id" className="input" defaultValue="">
          <option value="">Não lançar (já registrei a despesa)</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Observação" htmlFor="dp-note">
        <input id="dp-note" name="note" maxLength={200} className="input" />
      </Field>
      <SubmitButton pending={pending} variant="money" size="sm">Registrar pagamento</SubmitButton>
    </form>
  );
}
