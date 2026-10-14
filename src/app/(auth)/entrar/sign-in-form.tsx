"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import Link from "next/link";
import { signIn } from "../actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "@/components/forms/form-message";

export function SignInForm({ next }: { next?: string }) {
  const { state, onSubmit, pending } = useFormAction(signIn);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/app"} />
      <FormMessage state={state} />
      <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")}>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="input"
          aria-invalid={Boolean(fieldError(state, "email"))} />
      </Field>
      <Field label="Senha" htmlFor="password" error={fieldError(state, "password")}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input"
          aria-invalid={Boolean(fieldError(state, "password"))} />
      </Field>
      <div className="flex justify-end">
        <Link href="/recuperar-senha" className="text-sm font-medium text-navy-600 hover:underline">
          Esqueci minha senha
        </Link>
      </div>
      <SubmitButton pending={pending} className="w-full" size="lg" pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
