import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { PremiumFeature } from "@/components/app/premium-gate";

export const metadata: Metadata = { title: "Cartões de crédito" };

export default function CardsPage() {
  return (
    <PremiumFeature
      feature="credit_cards"
      title="Cartões de crédito"
      headline="Tenha mais controle sobre o seu dinheiro."
      description="Controle limite, fechamento e vencimento das faturas, compras parceladas e pagamentos, sem contar o mesmo gasto duas vezes quando a fatura for paga."
      icon={<CreditCard className="h-6 w-6" />}
      benefits={[
        "Cadastro de cartões com limite, fechamento e vencimento",
        "Compras parceladas distribuídas nas faturas certas",
        "Limite disponível sempre atualizado",
        "Visualização e pagamento de faturas",
      ]}
    />
  );
}
