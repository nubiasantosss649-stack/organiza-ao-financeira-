import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PremiumFeature } from "@/components/app/premium-gate";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ImportWizard } from "./import-wizard";
import { undoImport } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { listAccounts, listCategories } from "@/lib/queries";

export const metadata: Metadata = { title: "Importar extrato" };

async function ImportContent() {
  const supabase = await createClient();
  const [accounts, categories, { data: history }] = await Promise.all([
    listAccounts(),
    listCategories(),
    supabase.from("statement_imports").select("id, file_name, format, rows_imported, rows_skipped, created_at, account_id").order("created_at", { ascending: false }).limit(20),
  ]);
  const accById = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Novo extrato" description="1) Escolha a conta e o arquivo · 2) revise categorias e duplicatas · 3) confirme." />
        <ImportWizard accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} />
      </Card>
      <Card>
        <CardHeader title="Importações anteriores" />
        {history?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate">
                  <strong>{h.file_name}</strong> · {accById.get(h.account_id) ?? "Conta"} · {new Date(h.created_at).toLocaleDateString("pt-BR")}
                  <span className="block text-xs text-slate-500">{h.rows_imported} importado(s){h.rows_skipped ? `, ${h.rows_skipped} ignorado(s)` : ""}</span>
                </span>
                <ActionForm action={undoImport} hidden={{ id: h.id }}>
                  <ConfirmButton variant="ghost" size="sm" className="text-danger-700" message="Desfazer esta importação? Todos os lançamentos criados por ela serão excluídos.">Desfazer</ConfirmButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma importação ainda.</p>
        )}
      </Card>
      <Card className="bg-navy-50/60 text-sm text-slate-700">
        <p className="font-semibold text-navy-900">Dicas</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>No app ou site do banco, procure por “exportar extrato” e escolha OFX (Money/Quicken) ou CSV.</li>
          <li>O CSV precisa ter colunas de data, descrição e valor (ou débito e crédito).</li>
          <li>Não pedimos senha do banco: o arquivo é lido apenas para criar os lançamentos que você confirmar.</li>
          <li>Conexão direta com bancos (Open Finance) ainda não está disponível.</li>
        </ul>
      </Card>
    </div>
  );
}

export default async function ImportPage() {
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
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar extrato</h1>
        <p className="mt-1 text-sm text-slate-500">CSV ou OFX, com revisão antes de salvar.</p>
      </div>
      <ImportContent />
    </PremiumFeature>
  );
}
