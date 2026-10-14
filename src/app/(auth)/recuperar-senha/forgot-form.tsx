"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { requestPasswordReset } from "../actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "@/components/forms/form-message";

export function ForgotForm() {
  const { state, onSubmit, pending } = useFormAction(requestPasswordReset);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="E-mail da sua conta" htmlFor="email" error={fieldError(state, "email")}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </Field>
      <SubmitButton pending={pending} className="w-full" size="lg" pendingText="Enviando…">Enviar link de recuperação</SubmitButton>
    </form>
  );
}
