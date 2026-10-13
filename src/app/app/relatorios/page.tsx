import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PremiumFeature } from "@/components/app/premium-gate";

export const metadata: Metadata = { title: "Relatórios" };

export default function ReportsPage() {
  return (
    <PremiumFeature
      feature="advanced_reports"
      title="Relatórios avançados"
      headline="Descubra onde seu dinheiro está indo."
      description="Relatórios detalhados, comparações mensais, projeções e identificação de assinaturas recorrentes, com exportação."
      icon={<BarChart3 className="h-6 w-6" />}
      benefits={[
        "Gráficos detalhados por categoria e por conta",
        "Comparações entre meses",
        "Identificação de assinaturas recorrentes",
        "Projeções financeiras com hipóteses explícitas",
        "Alertas de contas e exportação de relatórios",
      ]}
    />
  );
}
