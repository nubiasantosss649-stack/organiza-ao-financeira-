import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { ExamplePreview, PremiumFeature } from "@/components/app/premium-gate";

export const metadata: Metadata = { title: "Controle Fácil IA" };

export default function AIPage() {
  return (
    <PremiumFeature
      feature="ai_assistant"
      title="Controle Fácil IA"
      headline="Receba análises personalizadas com inteligência artificial."
      description="Um assistente que analisa somente os seus próprios lançamentos, com sua autorização, para mostrar com clareza para onde vai o seu dinheiro. Ele não inventa dados, não promete ganhos e não faz pagamentos."
      icon={<Bot className="h-6 w-6" />}
      benefits={[
        "Entenda para onde vai seu dinheiro",
        "Identifique categorias com gastos elevados",
        "Descubra oportunidades de economia",
        "Compare despesas entre meses",
        "Receba sugestões de orçamento e plano para metas e dívidas",
      ]}
      preview={
        <ExamplePreview>
          <div className="flex gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-money-400"><Bot className="h-4 w-4" aria-hidden /></span>
            <p className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-slate-700 shadow-sm">
              Você gastou R$ 480 em restaurantes neste mês. Reduzindo esse valor em 25%, poderia economizar aproximadamente R$ 120 por mês.
            </p>
          </div>
        </ExamplePreview>
      }
    />
  );
}
