"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/types";

/** Botão que executa uma ação de assinatura e mostra o resultado. */
export function SubscriptionButton({
  action,
  label,
  pendingLabel = "Aguarde…",
  confirmMessage,
  variant = "money",
}: {
  action: () => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  confirmMessage?: string;
  variant?: "money" | "primary" | "secondary" | "danger" | "ghost";
}) {
  const [state, dispatch, pending] = useActionState(async () => action(), {} as ActionState);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          startTransition(() => dispatch());
        }}
      >
        {pending ? pendingLabel : label}
      </Button>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </div>
  );
}
