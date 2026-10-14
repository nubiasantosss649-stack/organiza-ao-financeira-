import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/types";

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function fieldError(state: ActionState, name: string): string | undefined {
  return state.fieldErrors?.[name]?.[0];
}
