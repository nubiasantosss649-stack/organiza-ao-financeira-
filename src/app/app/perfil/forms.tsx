"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { changePassword, deleteMyAccount, signOutOthers, updateProfile } from "./actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "@/components/forms/form-message";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const { state, onSubmit, pending } = useFormAction(updateProfile);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Nome" htmlFor="full_name" error={fieldError(state, "full_name")}>
        <input id="full_name" name="full_name" defaultValue={fullName} maxLength={120} autoComplete="name" className="input" />
      </Field>
      <Field label="E-mail" htmlFor="email" hint="Para alterar o e-mail, fale com o suporte.">
        <input id="email" value={email} disabled className="input" readOnly />
      </Field>
      <SubmitButton pending={pending}>Salvar</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const { state, onSubmit, pending } = useFormAction(changePassword);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Senha atual" htmlFor="current_password" error={fieldError(state, "current_password")}>
        <input id="current_password" name="current_password" type="password" autoComplete="current-password" className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nova senha" htmlFor="password" error={fieldError(state, "password")}>
          <input id="password" name="password" type="password" autoComplete="new-password" className="input" />
        </Field>
        <Field label="Confirme a nova senha" htmlFor="confirm_password" error={fieldError(state, "confirm_password")}>
          <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" className="input" />
        </Field>
      </div>
      <SubmitButton pending={pending} variant="secondary">Alterar senha</SubmitButton>
    </form>
  );
}

export function SignOutOthersForm() {
  const { state, onSubmit, pending } = useFormAction(signOutOthers);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="secondary" size="sm" pendingText="Encerrando…">Encerrar outras sessões</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const { state, onSubmit, pending } = useFormAction(deleteMyAccount);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Sua senha" htmlFor="del-password" error={fieldError(state, "password")}>
        <input id="del-password" name="password" type="password" autoComplete="current-password" className="input" />
      </Field>
      <Field label='Digite "EXCLUIR" para confirmar' htmlFor="confirmation" error={fieldError(state, "confirmation")}>
        <input id="confirmation" name="confirmation" autoComplete="off" className="input" />
      </Field>
      <SubmitButton pending={pending} variant="danger" pendingText="Excluindo…">Excluir minha conta definitivamente</SubmitButton>
    </form>
  );
}
