import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { PremiumFeature } from "@/components/app/premium-gate";

export const metadata: Metadata = { title: "Minhas dívidas" };

export default function DebtsPage() {
  return (
    <PremiumFeature
      feature="debts"
      title="Minhas dívidas"
      headline="Organize suas dívidas e alcance suas metas financeiras."
      description="Cadastre suas dívidas, acompanhe parcelas e saldo restante e compare estratégias para quitar mais rápido. Toda simulação mostra claramente as hipóteses usadas."
      icon={<HandCoins className="h-6 w-6" />}
      benefits={[
        "Cadastro de dívidas com juros, parcelas e vencimentos",
        "Registro de pagamentos e saldo restante",
        "Simulação de quitação antecipada",
        "Comparação de estratégias (ex.: maior juro primeiro x menor saldo primeiro)",
        "Plano de quitação e gráficos de evolução",
      ]}
    />
  );
}
