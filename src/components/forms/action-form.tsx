"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/types";

/** Formulário pequeno (arquivar, excluir…) que exibe o erro retornado pela ação. */
export function ActionForm({
  action,
  hidden,
  children,
  className,
}: {
  action: (form: FormData) => Promise<ActionState | void>;
  hidden: Record<string, string>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(async (_: ActionState, form: FormData) => (await action(form)) ?? {}, {});
  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state.error ? <p role="alert" className="mt-1 max-w-xs text-xs text-danger-700">{state.error}</p> : null}
    </form>
  );
}
