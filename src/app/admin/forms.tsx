"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { FormMessage, fieldError } from "@/components/forms/form-message";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { savePlan, savePromotion, saveTrial } from "./actions";

export interface PlanFormData {
  id: "free" | "pro";
  name: string;
  price: string;
  max_accounts: string;
  max_active_budgets: string;
  max_active_goals: string;
  ai_limit: string;
  ai_period: "lifetime" | "month";
  features: string[];
}

export function PlanForm({ plan, featureLabels }: { plan: PlanFormData; featureLabels: Record<string, string> }) {
  const { state, onSubmit, pending } = useFormAction(savePlan);
  const err = (n: string) => fieldError(state, n);
  const p = plan.id;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="plan" value={plan.id} />
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Preço mensal (R$)" htmlFor={`${p}-price`} error={err("price")}>
          <input id={`${p}-price`} name="price" defaultValue={plan.price} inputMode="decimal" className="input tabular" />
        </Field>
        <Field label="Contas ativas" htmlFor={`${p}-acc`} error={err("max_accounts")} hint="Vazio = ilimitado">
          <input id={`${p}-acc`} name="max_accounts" defaultValue={plan.max_accounts} inputMode="numeric" className="input" />
        </Field>
        <Field label="Orçamentos ativos" htmlFor={`${p}-bud`} error={err("max_active_budgets")} hint="Vazio = ilimitado">
          <input id={`${p}-bud`} name="max_active_budgets" defaultValue={plan.max_active_budgets} inputMode="numeric" className="input" />
        </Field>
        <Field label="Metas ativas" htmlFor={`${p}-goal`} error={err("max_active_goals")} hint="Vazio = ilimitado">
          <input id={`${p}-goal`} name="max_active_goals" defaultValue={plan.max_active_goals} inputMode="numeric" className="input" />
        </Field>
        <Field label="Análises de IA" htmlFor={`${p}-ai`} error={err("ai_limit")} hint="Vazio = ilimitado">
          <input id={`${p}-ai`} name="ai_limit" defaultValue={plan.ai_limit} inputMode="numeric" className="input" />
        </Field>
        <Field label="Período do limite de IA" htmlFor={`${p}-aip`}>
          <select id={`${p}-aip`} name="ai_period" defaultValue={plan.ai_period} className="input">
            <option value="month">Por mês</option>
            <option value="lifetime">No total (sem renovar)</option>
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="label">Recursos incluídos</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {Object.entries(featureLabels).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="features" value={key} defaultChecked={plan.features.includes(key)} className="h-4 w-4 accent-money-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton pending={pending} size="sm">Salvar {plan.name}</SubmitButton>
    </form>
  );
}

export function TrialForm({ enabled, days }: { enabled: boolean; days: number }) {
  const { state, onSubmit, pending } = useFormAction(saveTrial);
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-money-500" />
        Oferecer teste gratuito do Pro (sem cartão; termina sozinho, sem cobrança)
      </label>
      <Field label="Duração (dias)" htmlFor="trial-days" error={fieldError(state, "days")}>
        <input id="trial-days" name="days" type="number" min={1} max={30} defaultValue={days} className="input w-28" />
      </Field>
      <SubmitButton pending={pending} size="sm">Salvar teste</SubmitButton>
    </form>
  );
}

export function PromotionForm({ defaults }: { defaults?: { id: string; name: string; description: string; price: string; starts_at: string; ends_at: string; active: boolean } }) {
  const { state, onSubmit, pending } = useFormAction(savePromotion);
  const err = (n: string) => fieldError(state, n);
  const p = defaults?.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da oferta" htmlFor={`pr-name-${p}`} error={err("name")}>
          <input id={`pr-name-${p}`} name="name" defaultValue={defaults?.name} placeholder="Ex.: Oferta de lançamento" className="input" />
        </Field>
        <Field label="Preço promocional (R$/mês)" htmlFor={`pr-price-${p}`} error={err("price")}>
          <input id={`pr-price-${p}`} name="price" defaultValue={defaults?.price} inputMode="decimal" className="input tabular" />
        </Field>
        <Field label="Início (horário de Brasília)" htmlFor={`pr-start-${p}`} error={err("starts_at")}>
          <input id={`pr-start-${p}`} name="starts_at" type="datetime-local" defaultValue={defaults?.starts_at} className="input" />
        </Field>
        <Field label="Fim (horário de Brasília)" htmlFor={`pr-end-${p}`} error={err("ends_at")}>
          <input id={`pr-end-${p}`} name="ends_at" type="datetime-local" defaultValue={defaults?.ends_at} className="input" />
        </Field>
      </div>
      <Field label="Descrição (opcional)" htmlFor={`pr-desc-${p}`}>
        <input id={`pr-desc-${p}`} name="description" defaultValue={defaults?.description} maxLength={300} className="input" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={defaults?.active ?? true} className="h-4 w-4 accent-money-500" /> Ativa
      </label>
      <p className="text-xs text-slate-500">
        O preço promocional vale para quem assinar dentro do prazo e é mantido nas renovações dessa assinatura. Ofertas só aparecem durante o período real configurado.
      </p>
      <SubmitButton pending={pending} size="sm">{defaults ? "Salvar oferta" : "Criar oferta"}</SubmitButton>
    </form>
  );
}
