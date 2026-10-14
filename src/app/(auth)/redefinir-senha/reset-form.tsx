"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import Link from "next/link";
import { updatePassword } from "../actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "@/components/forms/form-message";

export function ResetForm() {
  const { state, onSubmit, pending } = useFormAction(updatePassword);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <Link href="/app" className="block text-center font-semibold text-navy-600 hover:underline">Ir para o aplicativo</Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Nova senha" htmlFor="password" error={fieldError(state, "password")} hint="Mínimo de 8 caracteres, com letras e números.">
        <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirm_password" error={fieldError(state, "confirm_password")}>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required className="input" />
      </Field>
      <SubmitButton pending={pending} className="w-full" size="lg">Salvar nova senha</SubmitButton>
    </form>
  );
}
