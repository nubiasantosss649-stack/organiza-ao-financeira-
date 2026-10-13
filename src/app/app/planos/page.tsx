import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PlanComparisonTable, planHighlights } from "@/components/app/plan-comparison";
import { getEntitlements } from "@/lib/auth";
import { isCheckoutAvailable, listPlans } from "@/lib/plans";
import { formatBRL } from "@/lib/money";

export const metadata: Metadata = { title: "Planos" };

export default async function PlansPage() {
  const [plans, ent] = await Promise.all([listPlans(), getEntitlements()]);
  const checkout = isCheckoutAvailable();
  const pro = plans.find((p) => p.id === "pro");

  return (
    <div className="space-y-5">
      <PageHeader title="Planos" description="Comece grátis e assine o Pro quando quiser mais recursos." />

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const current = ent.plan_id === p.id;
          const isPro = p.id !== "free";
          return (
            <Card key={p.id} className={isPro ? "border-money-400/60 ring-1 ring-money-400/30" : ""}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <p className="text-sm text-slate-500">{p.description}</p>
                </div>
                {current ? <Badge tone="navy">Seu plano</Badge> : isPro ? <Badge tone="money">Recomendado</Badge> : null}
              </div>
              <p className="mt-4">
                <span className="tabular text-3xl font-extrabold">{formatBRL(p.price_cents)}</span>
                <span className="text-sm text-slate-500">{p.billing_interval === "month" ? " /mês" : " para sempre"}</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {planHighlights(p).map((h) => (
                  <li key={h} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-money-600" aria-hidden />{h}</li>
                ))}
                {isPro ? (
                  <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-money-600" aria-hidden />Dívidas, cartões, importação de extratos e relatórios</li>
                ) : (
                  <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-money-600" aria-hidden />Sem prazo de expiração e sem cartão de crédito</li>
                )}
              </ul>
              {isPro && current ? (
                <Link href="/app/assinatura" className="mt-5 flex h-11 items-center justify-center rounded-xl border border-slate-300 font-semibold hover:bg-slate-50">Gerenciar assinatura</Link>
              ) : null}
              {isPro && !current ? (
                <div className="mt-5">
                  {checkout ? (
                    <Link href="/app/assinatura" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-money-500 font-semibold text-white hover:bg-money-600">
                      <Sparkles className="h-4 w-4" aria-hidden /> Assinar por {formatBRL(p.price_cents)}/mês
                    </Link>
                  ) : (
                    <>
                      <button disabled className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 font-semibold text-slate-500">
                        Assinatura disponível em breve
                      </button>
                      <p className="mt-2 text-center text-xs text-slate-500">
                        Estamos finalizando o pagamento seguro. Nenhuma cobrança é feita até lá.
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Comparativo Grátis x Pro</h2>
        <PlanComparisonTable plans={plans} />
      </Card>

      {pro ? (
        <Alert tone="info">
          Cancelamento simples, a qualquer momento. Ao cancelar, você mantém o Pro até o fim do período pago e depois volta ao plano Grátis
          sem perder nenhum dado já registrado.
        </Alert>
      ) : null}
    </div>
  );
}
