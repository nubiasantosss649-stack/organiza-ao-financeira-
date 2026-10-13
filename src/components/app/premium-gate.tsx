import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { listPlans } from "@/lib/plans";
import { formatBRL } from "@/lib/money";

/**
 * Tela de recurso Pro. Para usuários Grátis, explica o recurso, benefícios e preço.
 * A proteção real fica no backend (RLS/funções) quando o recurso for implementado.
 */
export async function PremiumFeature({
  feature,
  title,
  headline,
  description,
  benefits,
  icon,
  preview,
  children,
  hasExistingData = false,
}: {
  feature: string;
  title: string;
  headline: string;
  description: string;
  benefits: string[];
  icon: ReactNode;
  preview?: ReactNode;
  children?: ReactNode;
  /** Usuário sem o recurso, mas com dados já cadastrados: mostra o conteúdo (somente leitura/uso básico). */
  hasExistingData?: boolean;
}) {
  const [ent, plans] = await Promise.all([getEntitlements(), listPlans()]);
  const pro = plans.find((p) => p.id === "pro");

  const enabled = hasFeature(ent, feature);
  if (children && (enabled || hasExistingData)) {
    return (
      <div className="space-y-4">
        {!enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-money-100 bg-money-50 px-4 py-3 text-sm">
            <span className="text-slate-700">
              <Lock className="mr-1.5 inline h-3.5 w-3.5 text-money-700" aria-hidden />
              Seu plano atual não inclui este recurso. Seus dados continuam disponíveis; para cadastrar novos itens, assine o Pro.
            </span>
            <Link href="/app/planos" className="font-semibold text-money-700 hover:underline">Conhecer o Pro</Link>
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="card overflow-hidden">
        <div className="relative bg-navy-900 px-5 py-8 text-white sm:px-8">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-money-500/20 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-white/10 p-2.5 text-money-400">{icon}</span>
              <Badge tone="money"><Lock className="h-3 w-3" aria-hidden /> Recurso Pro</Badge>
            </div>
            <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{title}</h1>
            <p className="mt-2 text-lg text-navy-100">{headline}</p>
          </div>
        </div>
        <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-2">
          <div>
            <p className="text-slate-600">{description}</p>
            <ul className="mt-4 space-y-2.5">
              {benefits.map((b) => (
                <li key={b} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-money-600" aria-hidden />{b}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            {preview}
            <div className="rounded-2xl border border-money-100 bg-money-50 p-5">
              <p className="text-sm font-semibold text-money-700">{pro?.name ?? "Controle Fácil Pro"}</p>
              {pro ? (
                <p className="mt-1"><span className="tabular text-3xl font-extrabold text-navy-900">{formatBRL(pro.price_cents)}</span><span className="text-sm text-slate-500"> /mês</span></p>
              ) : null}
              <p className="mt-1 text-xs text-slate-600">Cancele quando quiser. Seus dados continuam sempre acessíveis.</p>
              <div className="mt-4 flex flex-col gap-2">
                <ButtonLink href="/app/planos" variant="money"><Sparkles className="h-4 w-4" aria-hidden /> Conhecer o Pro</ButtonLink>
                <Link href="/app/planos" className="text-center text-sm font-medium text-navy-600 hover:underline">Ver benefícios e comparar planos</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pré-visualização ilustrativa, sempre identificada como exemplo (nunca como dado real). */
export function ExamplePreview({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <span className="absolute -top-2.5 left-3 rounded-full bg-white px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Exemplo ilustrativo</span>
      {children}
    </div>
  );
}
