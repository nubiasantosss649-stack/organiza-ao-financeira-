import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Bot, Check, PiggyBank, ShieldCheck, Target, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink, Button } from "@/components/ui/button";
import { ExamplePreview } from "@/components/app/premium-gate";
import { AccountForm } from "@/components/forms/account-form";
import { completeOnboarding } from "../perfil/actions";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { SLOGAN } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Boas-vindas" };

const STEPS = ["Boas-vindas", "Sua conta", "Primeiro gasto", "Seu painel"];

export default async function OnboardingPage({ searchParams }: PageProps<"/app/boas-vindas">) {
  const sp = await searchParams;
  const user = await requireUser();
  const step = Math.min(4, Math.max(1, Number(sp.passo) || 1));
  const supabase = await createClient();
  const [accounts, { count: txCount }] = await Promise.all([
    listAccounts(),
    supabase.from("transactions").select("id", { count: "exact", head: true }),
  ]);
  const firstName = user.fullName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex items-center gap-2" aria-label="Etapas">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full", i + 1 <= step ? "bg-money-500" : "bg-slate-200")} />
            <span className={cn("hidden text-xs sm:block", i + 1 === step ? "font-semibold text-navy-900" : "text-slate-500")} aria-current={i + 1 === step ? "step" : undefined}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Que bom ter você aqui{firstName ? `, ${firstName}` : ""}! 👋</h1>
          <p className="mt-2 text-slate-600">{SLOGAN} Em poucos minutos você vai ver seu dinheiro com mais clareza.</p>
          <ul className="mt-6 space-y-4">
            {[
              { Icon: Wallet, t: "Registre receitas e despesas", d: "Manualmente, de forma ilimitada, no celular ou no computador." },
              { Icon: BarChart3, t: "Veja tudo no painel", d: "Saldo, contas a pagar, gastos por categoria e comparação com o mês anterior." },
              { Icon: Target, t: "Crie metas e orçamentos", d: "Saiba quanto guardar por mês e quando está gastando acima do planejado." },
              { Icon: ShieldCheck, t: "Seus dados são só seus", d: "Somente você acessa suas informações financeiras." },
            ].map(({ Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="rounded-xl bg-money-50 p-2 text-money-600"><Icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block font-semibold">{t}</span><span className="text-sm text-slate-600">{d}</span></span>
              </li>
            ))}
          </ul>
          <ButtonLink href={`/app/boas-vindas?passo=${accounts.length ? 3 : 2}`} variant="money" size="lg" className="mt-8 w-full sm:w-auto">Vamos começar</ButtonLink>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Onde está seu dinheiro hoje?</h1>
          <p className="mb-6 mt-2 text-slate-600">
            Cadastre sua conta principal (banco, carteira digital ou dinheiro). Informe o saldo atual para o painel começar certo.
          </p>
          {accounts.length ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-money-700"><Check className="h-5 w-5" aria-hidden /> Você já cadastrou: {accounts.map((a) => a.name).join(", ")}.</p>
              <ButtonLink href="/app/boas-vindas?passo=3" variant="money">Continuar</ButtonLink>
            </div>
          ) : (
            <AccountForm redirectTo="/app/boas-vindas?passo=3" />
          )}
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Registre seu primeiro gasto</h1>
          <p className="mt-2 text-slate-600">
            Pode ser algo simples, como o almoço de hoje ou a conta de luz. Quanto mais você registra, mais preciso fica seu painel.
          </p>
          {txCount ? (
            <p className="mt-4 flex items-center gap-2 text-money-700"><Check className="h-5 w-5" aria-hidden /> Ótimo! Você já tem {txCount} {txCount === 1 ? "lançamento" : "lançamentos"}.</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={`/app/lancamentos/novo?next=${encodeURIComponent("/app/boas-vindas?passo=4")}`} variant="money" size="lg">
              <PiggyBank className="h-5 w-5" aria-hidden /> Registrar gasto
            </ButtonLink>
            <ButtonLink href="/app/boas-vindas?passo=4" variant="ghost" size="lg">{txCount ? "Continuar" : "Fazer depois"}</ButtonLink>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Como ler seu painel</h1>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Saldo total", "Soma das suas contas: saldo inicial + receitas recebidas − despesas pagas."],
              ["Valor disponível", "Saldo total menos as contas pendentes vencidas e a vencer até o fim do mês."],
              ["A pagar e vencidas", "Despesas marcadas como pendentes. Marque como pagas quando quitar."],
              ["Gastos por categoria", "Onde seu dinheiro foi no mês. Bom ponto de partida para economizar."],
              ["Comparação mensal", "Setas mostram se receitas e despesas subiram ou caíram em relação ao mês anterior."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold">{t}</dt><dd className="text-slate-600">{d}</dd></div>
            ))}
          </dl>

          <div className="mt-6 rounded-2xl border border-money-100 bg-money-50/60 p-4">
            <p className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-money-600" aria-hidden /> Conheça o Controle Fácil IA</p>
            <p className="mb-4 mt-1 text-sm text-slate-600">
              O assistente analisa apenas os seus lançamentos e sugere onde economizar. Veja como é uma análise:
            </p>
            <ExamplePreview>
              <p className="text-sm text-slate-700">
                “Você gastou R$ 480 em restaurantes neste mês. Reduzindo esse valor em 25%, poderia economizar aproximadamente R$ 120 por mês.”
              </p>
            </ExamplePreview>
            <p className="mt-3 text-xs text-slate-500">
              O plano Grátis inclui análises demonstrativas com seus próprios dados assim que o assistente for liberado. <Link href="/app/ia" className="underline">Saiba mais</Link>
            </p>
          </div>

          <form action={completeOnboarding} className="mt-8">
            <Button variant="money" size="lg" className="w-full sm:w-auto">Ir para o meu painel</Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
