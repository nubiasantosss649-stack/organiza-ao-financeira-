import type { Metadata } from "next";
import Link from "next/link";
import { Bot, ShieldCheck } from "lucide-react";
import { Card, CardHeader, PageHeader, ProgressBar } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExamplePreview } from "@/components/app/premium-gate";
import { Assistant } from "./assistant";
import { setAIConsent } from "./actions";
import { getEntitlements, hasFeature } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AI_PRESETS } from "@/lib/ai/presets";
import { isAIConfigured } from "@/lib/ai/claude";

export const metadata: Metadata = { title: "Controle Fácil IA" };

const DATA_USED = [
  "Saldo total das contas e totais de receitas e despesas dos últimos 3 meses",
  "Gastos por categoria do mês atual e do anterior",
  "Contas pendentes e vencidas (somente os totais)",
  "Orçamentos, metas e dívidas (nome, valores e juros)",
  "Nomes e valores de despesas recorrentes identificadas (ex.: assinaturas)",
];

export default async function AIPage() {
  const supabase = await createClient();
  const [ent, { data: usage }] = await Promise.all([getEntitlements(), supabase.rpc("my_ai_usage")]);
  const u = (usage ?? { used: 0, limit: 0, period: "lifetime", consented: false }) as { used: number; limit: number | null; period: "lifetime" | "month"; consented: boolean };
  const canChat = hasFeature(ent, "ai_assistant");
  const remaining = u.limit === null ? null : Math.max(0, u.limit - u.used);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Controle Fácil IA" description="Seu assistente financeiro: entende seus gastos e sugere caminhos — sem inventar dados." />

      {!u.consented ? (
        <Card>
          <div className="flex gap-3">
            <span className="h-fit rounded-xl bg-navy-900 p-2.5 text-money-400"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
            <div className="text-sm text-slate-700">
              <h2 className="text-base font-semibold text-navy-900">Antes de começar: sua autorização</h2>
              <p className="mt-1">
                Para gerar as análises, o Controle Fácil envia ao provedor de inteligência artificial (Anthropic, modelo Claude)
                um <strong>resumo agregado</strong> dos seus dados. Não enviamos seu nome, e-mail, número de conta nem cada lançamento.
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">{DATA_USED.map((d) => <li key={d}>{d}</li>)}</ul>
              <p className="mt-2">As perguntas e respostas não ficam salvas no Controle Fácil. Você pode revogar a autorização quando quiser.</p>
              <form action={setAIConsent} className="mt-4">
                <input type="hidden" name="consent" value="1" />
                <Button variant="money">Autorizar e usar o assistente</Button>
              </form>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              {u.limit === null ? "Análises ilimitadas" : `${remaining} de ${u.limit} ${u.period === "month" ? "análises restantes neste mês" : "análises demonstrativas restantes"}`}
            </p>
            {!canChat ? <p className="text-xs text-slate-500">No plano Grátis você pode usar as análises prontas. Perguntas livres fazem parte do Pro.</p> : null}
          </div>
          {!canChat ? <Link href="/app/planos" className="text-sm font-semibold text-money-700 hover:underline">Desbloquear análises com IA</Link> : null}
        </div>
        {u.limit ? <div className="mt-2"><ProgressBar value={(u.used / u.limit) * 100} tone="navy" label="Análises usadas" /></div> : null}
      </Card>

      {u.consented ? (
        <Card>
          <CardHeader title="Pergunte ao assistente" description="As respostas usam apenas os seus dados registrados no app." />
          <Assistant presets={AI_PRESETS.map((p) => ({ id: p.id, label: p.label }))} canChat={canChat} remaining={remaining} available={isAIConfigured()} />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Como funciona" />
          <ExamplePreview>
            <div className="flex gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-money-400"><Bot className="h-4 w-4" aria-hidden /></span>
              <p className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-slate-700 shadow-sm">
                Você gastou R$ 480 em restaurantes neste mês. Reduzindo esse valor em 25%, poderia economizar aproximadamente R$ 120 por mês.
              </p>
            </div>
          </ExamplePreview>
        </Card>
      )}

      <div className="text-xs text-slate-500">
        O assistente não realiza pagamentos, não promete ganhos e não substitui orientação profissional. Confira sempre os valores sugeridos.
        {u.consented ? (
          <> <form action={setAIConsent} className="inline"><input type="hidden" name="consent" value="0" /><button className="underline">Revogar autorização</button></form></>
        ) : null}
      </div>
    </div>
  );
}
