"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { useEffect, useRef } from "react";
import { saveAccount } from "@/app/app/contas/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "./form-message";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";

export const SWATCHES = ["#0B2545", "#2F64A8", "#12A26E", "#0EA5E9", "#8B5CF6", "#EC4899", "#F97316", "#EAB308", "#64748B"];

export function ColorPicker({ name = "color", defaultValue }: { name?: string; defaultValue: string }) {
  return (
    <fieldset>
      <legend className="label">Cor</legend>
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map((c) => (
          <label key={c} className="cursor-pointer">
            <input type="radio" name={name} value={c} defaultChecked={c.toLowerCase() === defaultValue.toLowerCase()} className="peer sr-only" />
            <span className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-navy-900 peer-focus-visible:ring-2 peer-focus-visible:ring-navy-600" style={{ background: c }} />
            <span className="sr-only">{c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AccountForm({
  defaults,
  redirectTo,
}: {
  defaults?: { id: string; name: string; type: string; initial_balance: string; color: string };
  /** Caminho interno para onde ir após criar (ex.: próximo passo do onboarding). */
  redirectTo?: string;
}) {
  const { state, onSubmit, pending } = useFormAction(saveAccount);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !defaults) formRef.current?.reset();
  }, [state, defaults]);
  const err = (n: string) => fieldError(state, n);
  const p = defaults?.id ?? "new";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {redirectTo ? <input type="hidden" name="next" value={redirectTo} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={`name-${p}`} error={err("name")}>
          <input id={`name-${p}`} name="name" required maxLength={60} defaultValue={defaults?.name} placeholder="Ex.: Nubank, Carteira, Poupança" className="input" />
        </Field>
        <Field label="Tipo" htmlFor={`type-${p}`} error={err("type")}>
          <select id={`type-${p}`} name="type" defaultValue={defaults?.type ?? "checking"} className="input">
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field
        label="Saldo inicial (R$)"
        htmlFor={`initial_balance-${p}`}
        error={err("initial_balance")}
        hint="Quanto havia na conta antes dos lançamentos que você vai registrar. Pode ser negativo."
      >
        <input id={`initial_balance-${p}`} name="initial_balance" inputMode="decimal" defaultValue={defaults?.initial_balance ?? "0,00"} className="input tabular sm:w-56" />
      </Field>
      <ColorPicker defaultValue={defaults?.color ?? SWATCHES[0]} />
      <SubmitButton pending={pending}>{defaults ? "Salvar alterações" : "Adicionar conta"}</SubmitButton>
    </form>
  );
}
