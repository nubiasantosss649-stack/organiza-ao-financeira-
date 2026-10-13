"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormAction } from "./use-form-action";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, fieldError } from "@/components/forms/form-message";
import { cn } from "@/lib/cn";
import { formatBRL, parseBRL, splitInstallments } from "@/lib/money";
import type { ActionState } from "@/lib/types";

interface Option {
  id: string;
  name: string;
}
interface CategoryOption extends Option {
  kind: "income" | "expense";
}

export interface TransactionDefaults {
  kind: "income" | "expense";
  amount: string;
  description: string;
  occurred_on: string;
  account_id: string;
  /** Preenchido quando o lançamento é uma compra no cartão de crédito. */
  card_id?: string;
  category_id: string;
  status: "paid" | "pending";
  notes: string;
}

export function TransactionForm({
  action,
  accounts,
  cards = [],
  categories,
  defaults,
  mode,
  submitLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  accounts: Option[];
  /** Cartões disponíveis (somente para quem tem o recurso Pro de cartões). */
  cards?: Option[];
  categories: CategoryOption[];
  defaults: TransactionDefaults;
  mode: "create" | "edit";
  submitLabel: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [kind, setKind] = useState(defaults.kind);
  const [repeat, setRepeat] = useState<"single" | "installments" | "recurring">("single");
  const [amount, setAmount] = useState(defaults.amount);
  const [count, setCount] = useState("2");
  const [source, setSource] = useState<"account" | "card">(defaults.card_id ? "card" : "account");
  const onCard = kind === "expense" && source === "card" && cards.length > 0;
  const err = (n: string) => fieldError(state, n);

  const kindCategories = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const categoryDefault = kindCategories.some((c) => c.id === defaults.category_id) ? defaults.category_id : "";

  const installmentPreview = useMemo(() => {
    if (repeat !== "installments") return null;
    const cents = parseBRL(amount);
    const n = Number(count);
    if (!cents || !Number.isInteger(n) || n < 2 || n > 120 || cents < n) return null;
    const parts = splitInstallments(cents, n);
    return parts[0] === parts[n - 1]
      ? `${n}x de ${formatBRL(parts[0])}`
      : `1ª parcela ${formatBRL(parts[0])} e demais ${formatBRL(parts[n - 1])}`;
  }, [repeat, amount, count]);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormMessage state={state} />

      <fieldset>
        <legend className="label">Tipo</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(["expense", "income"] as const).map((k) => (
            <label
              key={k}
              className={cn(
                "cursor-pointer rounded-lg py-2 text-center text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-600",
                kind === k ? (k === "expense" ? "bg-navy-900 text-white shadow" : "bg-money-500 text-white shadow") : "text-slate-600",
              )}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "expense" ? "Despesa" : "Receita"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={repeat === "installments" ? "Valor total da compra (R$)" : "Valor (R$)"}
          htmlFor="amount"
          error={err("amount")}
          hint={installmentPreview ?? undefined}
        >
          <input
            id="amount" name="amount" inputMode="decimal" placeholder="0,00" required autoComplete="off"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="input tabular text-lg font-semibold" aria-invalid={Boolean(err("amount"))}
          />
        </Field>
        <Field label={kind === "expense" ? "Data / vencimento" : "Data do recebimento"} htmlFor="occurred_on" error={err("occurred_on")}>
          <input id="occurred_on" name="occurred_on" type="date" required defaultValue={defaults.occurred_on} className="input" aria-invalid={Boolean(err("occurred_on"))} />
        </Field>
      </div>

      <Field label="Descrição" htmlFor="description" error={err("description")}>
        <input id="description" name="description" required maxLength={120} defaultValue={defaults.description}
          placeholder={kind === "expense" ? "Ex.: Supermercado, aluguel, conta de luz" : "Ex.: Salário, freela, reembolso"}
          className="input" aria-invalid={Boolean(err("description"))} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="category_id" error={err("category_id")}>
          <select key={kind} id="category_id" name="category_id" defaultValue={categoryDefault} className="input">
            <option value="">Sem categoria</option>
            {kindCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {onCard ? (
          <Field label="Cartão de crédito" htmlFor="card_id" error={err("card_id")} hint="A compra entra na fatura conforme a data de fechamento do cartão.">
            <select id="card_id" name="card_id" defaultValue={defaults.card_id ?? cards[0]?.id} className="input">
              {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field
            label="Conta ou carteira"
            htmlFor="account_id"
            error={err("account_id")}
            hint={accounts.length === 0 ? <Link href="/app/contas" className="text-navy-600 underline">Cadastre uma conta primeiro</Link> : undefined}
          >
            <select id="account_id" name="account_id" required defaultValue={defaults.account_id} className="input" aria-invalid={Boolean(err("account_id"))}>
              {accounts.length === 0 ? <option value="">Nenhuma conta cadastrada</option> : null}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      {kind === "expense" && cards.length > 0 ? (
        <fieldset>
          <legend className="label">Forma de pagamento</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["account", "Conta / dinheiro / Pix"], ["card", "Cartão de crédito"]] as const).map(([value, label]) => (
              <label key={value} className={cn(
                "cursor-pointer rounded-xl border px-2 py-2 text-center text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-600",
                source === value ? "border-navy-600 bg-navy-50 text-navy-900" : "border-slate-200 text-slate-600",
              )}>
                <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {onCard ? null : (
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
          <input type="checkbox" name="status" value="paid" defaultChecked={defaults.status === "paid"}
            className="h-5 w-5 rounded accent-money-500" />
          <span>
            <span className="font-semibold text-navy-900">{kind === "expense" ? "Já foi pago" : "Já recebi"}</span>
            <span className="block text-xs text-slate-500">
              Desmarque para registrar como {kind === "expense" ? "conta a pagar" : "valor a receber"}.
            </span>
          </span>
        </label>
      )}

      {mode === "create" ? (
        <fieldset className="space-y-3">
          <legend className="label">Repetição</legend>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["single", "Única"],
              ["installments", "Parcelada"],
              ["recurring", "Todo mês"],
            ] as const).map(([value, label]) => (
              <label key={value} className={cn(
                "cursor-pointer rounded-xl border px-2 py-2 text-center text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-600",
                repeat === value ? "border-navy-600 bg-navy-50 text-navy-900" : "border-slate-200 text-slate-600",
              )}>
                <input type="radio" name="repeat" value={value} checked={repeat === value} onChange={() => setRepeat(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {repeat !== "single" ? (
            <Field
              label={repeat === "installments" ? "Número de parcelas" : "Repetir por quantos meses"}
              htmlFor="repeat_count"
              error={err("repeat_count")}
              hint={repeat === "installments"
                ? "O valor total é dividido sem perder centavos. As próximas parcelas ficam como pendentes."
                : "Serão criados lançamentos mensais com o mesmo valor; os próximos ficam como pendentes."}
            >
              <input id="repeat_count" name="repeat_count" type="number" min={2} max={repeat === "installments" ? 120 : 60}
                value={count} onChange={(e) => setCount(e.target.value)} className="input w-32" />
            </Field>
          ) : null}
        </fieldset>
      ) : null}

      <Field label="Observações (opcional)" htmlFor="notes" error={err("notes")}>
        <textarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={defaults.notes} className="input" />
      </Field>

      <SubmitButton pending={pending} variant={kind === "income" ? "money" : "primary"} size="lg" className="w-full sm:w-auto">{submitLabel}</SubmitButton>
    </form>
  );
}
