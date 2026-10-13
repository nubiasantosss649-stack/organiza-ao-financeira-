"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { resendConfirmation } from "../../actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/forms/form-message";

export function ResendForm({ email }: { email: string }) {
  const { state, onSubmit, pending } = useFormAction(resendConfirmation);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="secondary" className="w-full" pendingText="Enviando…">Reenviar e-mail de confirmação</SubmitButton>
    </form>
  );
}
