"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { useEffect, useRef } from "react";
import { saveCategory } from "@/app/app/categorias/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { CATEGORY_ICONS } from "@/components/app/category-icon";
import { FormMessage, fieldError } from "./form-message";
import { ColorPicker } from "./account-form";

export function CategoryForm({
  defaults,
}: {
  defaults?: { id: string; name: string; kind: "income" | "expense"; color: string; icon: string };
}) {
  const { state, onSubmit, pending } = useFormAction(saveCategory);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !defaults) ref.current?.reset();
  }, [state, defaults]);
  const p = defaults?.id ?? "new";

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4" noValidate>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {defaults ? <input type="hidden" name="kind" value={defaults.kind} /> : null}
      <FormMessage state={state} />
      <Field label="Nome" htmlFor={`cat-name-${p}`} error={fieldError(state, "name")}>
        <input id={`cat-name-${p}`} name="name" required maxLength={40} defaultValue={defaults?.name} className="input" placeholder="Ex.: Academia, Farmácia" />
      </Field>
      {!defaults ? (
        <Field label="Tipo" htmlFor="cat-kind" error={fieldError(state, "kind")}>
          <select id="cat-kind" name="kind" defaultValue="expense" className="input">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </Field>
      ) : null}
      <fieldset>
        <legend className="label">Ícone</legend>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => (
            <label key={name} className="cursor-pointer">
              <input type="radio" name="icon" value={name} defaultChecked={(defaults?.icon ?? "tag") === name} className="peer sr-only" />
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 peer-checked:border-navy-900 peer-checked:bg-navy-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-navy-600">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="sr-only">{name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <ColorPicker defaultValue={defaults?.color ?? "#2F64A8"} />
      <SubmitButton pending={pending}>{defaults ? "Salvar" : "Criar categoria"}</SubmitButton>
    </form>
  );
}
