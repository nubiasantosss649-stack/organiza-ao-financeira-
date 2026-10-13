"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import Link from "next/link";
import { signUp } from "../actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "@/components/forms/form-message";

export function SignUpForm() {
  const { state, onSubmit, pending } = useFormAction(signUp);
  const err = (n: string) => fieldError(state, n);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Nome" htmlFor="full_name" error={err("full_name")}>
        <input id="full_name" name="full_name" autoComplete="name" required maxLength={120} className="input" aria-invalid={Boolean(err("full_name"))} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={err("email")}>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="input" aria-invalid={Boolean(err("email"))} />
      </Field>
      <Field label="Senha" htmlFor="password" error={err("password")} hint="Mínimo de 8 caracteres, com letras e números.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" aria-invalid={Boolean(err("password"))} />
      </Field>
      <Field label="Confirme a senha" htmlFor="confirm_password" error={err("confirm_password")}>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required className="input" aria-invalid={Boolean(err("confirm_password"))} />
      </Field>
      <div>
        <label className="flex items-start gap-2.5 text-sm text-slate-600">
          <input type="checkbox" name="accept_terms" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-money-500" />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="font-medium text-navy-600 underline">Termos de Uso</Link> e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium text-navy-600 underline">Política de Privacidade</Link>.
          </span>
        </label>
        {err("accept_terms") ? <p className="mt-1.5 text-sm text-danger-700" role="alert">{err("accept_terms")}</p> : null}
      </div>
      <SubmitButton pending={pending} variant="money" className="w-full" size="lg" pendingText="Criando conta…">Criar conta grátis</SubmitButton>
    </form>
  );
}
