import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { PremiumFeature } from "@/components/app/premium-gate";

export const metadata: Metadata = { title: "Importar extrato" };

export default function ImportPage() {
  return (
    <PremiumFeature
      feature="statement_import"
      title="Importar extrato"
      headline="Traga seus lançamentos do banco em segundos."
      description="Envie o extrato em CSV ou OFX, revise os lançamentos, corrija categorias e confirme. Possíveis duplicatas são identificadas antes de importar."
      icon={<FileUp className="h-6 w-6" />}
      benefits={[
        "Arquivos CSV e OFX dos principais bancos",
        "Pré-visualização antes de confirmar",
        "Categorização automática como sugestão, com correção manual",
        "Detecção de lançamentos duplicados",
      ]}
    />
  );
}
