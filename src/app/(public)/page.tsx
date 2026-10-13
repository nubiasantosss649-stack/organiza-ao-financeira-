import Link from "next/link";
import {
  BarChart3, Bot, Check, CreditCard, FileUp, HandCoins, Lock, PieChart, ShieldCheck, Smartphone, Target, Wallet,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SLOGAN } from "@/components/brand/logo";
import { PlanComparisonTable, planHighlights } from "@/components/app/plan-comparison";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import type { Plan } from "@/lib/types";

async function loadPlans(): Promise<Plan[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plans")
      .select("id, name, description, price_cents, billing_interval, max_accounts, max_active_budgets, max_active_goals, ai_analyses_limit, ai_limit_period, features")
      .order("sort_order");
    return (data ?? []) as Plan[];
  } catch {
    return [];
  }
}

const FAQ = [
  ["O plano Grátis expira?", "Não. O Controle Fácil Grátis não tem prazo de expiração e não pede cartão de crédito."],
  ["Meus dados financeiros ficam seguros?", "Sim. Cada pessoa acessa somente as próprias informações, com regras de segurança aplicadas diretamente no banco de dados. Não vendemos seus dados."],
  ["O aplicativo se conecta à minha conta bancária?", "Não. Você registra os lançamentos manualmente e, no Pro, pode importar extratos em CSV ou OFX. Não pedimos senha de banco."],
  ["Se eu cancelar o Pro, perco meus dados?", "Não. Você mantém o Pro até o fim do período pago e depois volta ao Grátis com todos os registros acessíveis."],
  ["Funciona no celular?", "Sim. O Controle Fácil foi feito para o celular e funciona no navegador do computador também. O app precisa de internet para salvar e consultar dados."],
  ["A inteligência artificial faz pagamentos ou promete ganhos?", "Não. O assistente apenas analisa seus próprios lançamentos e sugere caminhos. Ele não movimenta dinheiro e não promete resultados."],
];

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const plans = await loadPlans();
  const pro = plans.find((p) => p.id === "pro");
  const proPrice = pro ? formatBRL(pro.price_cents) : null;

  return (
    <main>
      {sp.conta === "excluida" ? (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <Alert tone="success">Sua conta e seus dados foram excluídos. Obrigado por ter usado o Controle Fácil.</Alert>
        </div>
      ) : null}

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-money-500/20 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-money-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Controle financeiro pessoal
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Descubra onde seu dinheiro está indo.
            </h1>
            <p className="mt-4 text-lg text-navy-100">{SLOGAN}</p>
            <p className="mt-2 text-navy-100/80">
              Registre gastos e receitas, acompanhe contas a pagar, crie orçamentos e metas. Comece grátis, sem cartão de crédito.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/cadastro" variant="money" size="lg">Criar conta grátis</ButtonLink>
              <ButtonLink href="#planos" variant="secondary" size="lg" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                Conhecer o Pro
              </ButtonLink>
            </div>
          </div>

          {/* Ilustração do painel (não são dados reais) */}
          <figure className="relative">
            <div className="rounded-3xl bg-white p-5 text-navy-900 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Saldo total</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Ilustração</span>
              </div>
              <p className="tabular text-3xl font-bold">R$ 3.250,00</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-money-50 p-2.5"><p className="text-slate-500">Receitas</p><p className="tabular font-bold text-money-700">R$ 4.500</p></div>
                <div className="rounded-xl bg-navy-50 p-2.5"><p className="text-slate-500">Despesas</p><p className="tabular font-bold">R$ 2.870</p></div>
                <div className="rounded-xl bg-warning-50 p-2.5"><p className="text-slate-500">A pagar</p><p className="tabular font-bold text-warning-700">R$ 380</p></div>
              </div>
              <div className="mt-4 space-y-2.5">
                {[["Mercado", 82], ["Moradia", 64], ["Transporte", 38], ["Restaurantes", 30]].map(([n, w]) => (
                  <div key={n}>
                    <div className="mb-1 flex justify-between text-xs"><span>{n}</span></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-navy-600" style={{ width: `${w}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
                <Bot className="h-4 w-4 shrink-0 text-money-600" aria-hidden />
                Você gastou R$ 480 em restaurantes neste mês. Reduzindo 25%, economizaria cerca de R$ 120 por mês.
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-navy-100/60">Ilustração do aplicativo com valores de exemplo.</figcaption>
          </figure>
        </div>
      </section>

      {/* Benefícios */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Tenha mais controle sobre o seu dinheiro</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">Tudo o que você precisa para organizar a vida financeira, de um jeito simples.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { Icon: Wallet, t: "Receitas e despesas", d: "Registro ilimitado, parcelas, gastos recorrentes, filtros por dia, semana, mês e ano." },
            { Icon: BarChart3, t: "Painel automático", d: "Saldo, valor disponível, contas a pagar e vencidas, gráficos e comparação com o mês anterior." },
            { Icon: PieChart, t: "Orçamentos", d: "Limites por categoria e alerta quando os gastos passam do planejado." },
            { Icon: Target, t: "Minhas metas", d: "Reserva de emergência, viagem, notebook: veja quanto guardar por mês." },
            { Icon: Smartphone, t: "Feito para o celular", d: "Navegação simples com menu inferior. Use no celular ou no computador." },
            { Icon: ShieldCheck, t: "Privacidade de verdade", d: "Seus dados são só seus. Exporte ou exclua tudo quando quiser (LGPD)." },
          ].map(({ Icon, t, d }) => (
            <div key={t} className="card p-5">
              <span className="inline-flex rounded-xl bg-money-50 p-2.5 text-money-600"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pro */}
      <section className="bg-surface py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Receba análises personalizadas com inteligência artificial</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
            O Controle Fácil Pro adiciona ferramentas para quem quer ir além. Organize suas dívidas e alcance suas metas financeiras.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: Bot, t: "Controle Fácil IA", d: "Análises dos seus próprios gastos e sugestões de economia, sem inventar dados." },
              { Icon: HandCoins, t: "Minhas dívidas", d: "Plano de quitação, simulações com hipóteses claras e comparação de estratégias." },
              { Icon: CreditCard, t: "Cartões de crédito", d: "Faturas, limite disponível e parcelas, sem contar gastos em dobro." },
              { Icon: FileUp, t: "Importação de extratos", d: "CSV e OFX com detecção de duplicatas e categorização sugerida." },
            ].map(({ Icon, t, d }) => (
              <div key={t} className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex rounded-xl bg-navy-900 p-2.5 text-money-400"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-money-100 px-2 py-0.5 text-[10px] font-bold text-money-700"><Lock className="h-3 w-3" aria-hidden /> PRO</span>
                </div>
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Os recursos Pro estão sendo liberados em etapas. Você será avisado no app quando cada um estiver disponível.
          </p>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Preços claros</h2>
        <p className="mt-2 text-center text-slate-600">Comece grátis. Assine o Pro quando fizer sentido para você.</p>
        {plans.length ? (
          <>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {plans.map((p) => (
                <div key={p.id} className={`card p-6 ${p.id === "pro" ? "border-money-400/60 ring-1 ring-money-400/30" : ""}`}>
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                  <p className="mt-4"><span className="tabular text-4xl font-extrabold">{formatBRL(p.price_cents)}</span><span className="text-slate-500">{p.billing_interval === "month" ? " /mês" : ""}</span></p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {planHighlights(p).map((h) => <li key={h} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-money-600" aria-hidden />{h}</li>)}
                  </ul>
                  <ButtonLink href="/cadastro" variant={p.id === "pro" ? "money" : "secondary"} className="mt-6 w-full">
                    {p.id === "pro" ? `Assinar Pro${proPrice ? ` por ${proPrice}/mês` : ""}` : "Criar conta grátis"}
                  </ButtonLink>
                  {p.id === "pro" ? <p className="mt-2 text-center text-xs text-slate-500">Crie sua conta grátis e assine pelo app quando o pagamento for liberado.</p> : null}
                </div>
              ))}
            </div>
            <div className="card mt-6 p-5"><PlanComparisonTable plans={plans} /></div>
          </>
        ) : (
          <p className="mt-8 text-center text-slate-600">Plano Grátis por R$ 0,00, sem prazo de expiração.</p>
        )}
      </section>

      {/* FAQ */}
      <section className="bg-surface py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Perguntas frequentes</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card group p-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-3">{q}<span className="text-money-600 transition group-open:rotate-45" aria-hidden>+</span></span>
                </summary>
                <p className="mt-2 text-sm text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy-900 py-14 text-center text-white">
        <h2 className="text-3xl font-bold">Seu dinheiro organizado começa hoje</h2>
        <p className="mt-2 text-navy-100">Crie sua conta em menos de um minuto.</p>
        <ButtonLink href="/cadastro" variant="money" size="lg" className="mt-6">Criar conta grátis</ButtonLink>
        <p className="mt-4 text-sm text-navy-100/70">Já tem conta? <Link href="/entrar" className="font-semibold text-white underline">Entrar</Link></p>
      </section>
    </main>
  );
}
