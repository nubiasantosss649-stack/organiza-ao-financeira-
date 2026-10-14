"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { ActionState } from "@/lib/types";

/**
 * Executa uma Server Action a partir do submit SEM limpar o formulário.
 * (Com `<form action>`, o React 19 reseta os campos após o envio; se houver
 * erro de validação, o usuário perderia o que digitou.)
 */
export function useFormAction(action: (prev: ActionState, form: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, {});
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, onSubmit, pending };
}
