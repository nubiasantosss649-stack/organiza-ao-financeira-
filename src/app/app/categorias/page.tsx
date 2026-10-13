import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { CategoryIcon } from "@/components/app/category-icon";
import { CategoryForm } from "@/components/forms/category-form";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteCategory, setCategoryArchived } from "./actions";
import { listCategories } from "@/lib/queries";
import type { Category } from "@/lib/types";

export const metadata: Metadata = { title: "Categorias" };

function CategoryList({ title, items }: { title: string; items: Category[] }) {
  return (
    <Card>
      <CardHeader title={title} description={`${items.length} ${items.length === 1 ? "categoria" : "categorias"}`} />
      <ul className="divide-y divide-slate-100">
        {items.map((c) => (
          <li key={c.id} className="py-2.5">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <CategoryIcon name={c.icon} color={c.color} size="sm" />
                <span className={`flex-1 text-sm font-medium ${c.archived_at ? "text-slate-400" : ""}`}>{c.name}</span>
                {c.archived_at ? <Badge>Arquivada</Badge> : null}
                <span className="text-xs text-navy-600 group-open:hidden">Editar</span>
              </summary>
              <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-4">
                <CategoryForm defaults={{ id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon }} />
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  <ActionForm action={setCategoryArchived} hidden={{ id: c.id, archive: c.archived_at ? "0" : "1" }}>
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">
                      {c.archived_at ? "Reativar" : "Arquivar (ocultar das opções)"}
                    </button>
                  </ActionForm>
                  <ActionForm action={deleteCategory} hidden={{ id: c.id }}>
                    <ConfirmButton variant="ghost" size="sm" className="text-danger-700"
                      message="Excluir esta categoria? Os lançamentos dela ficarão como 'Sem categoria' e orçamentos dela serão removidos.">
                      Excluir
                    </ConfirmButton>
                  </ActionForm>
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function CategoriesPage() {
  const categories = await listCategories({ includeArchived: true });
  return (
    <div className="space-y-5">
      <PageHeader title="Categorias" description="Organize seus lançamentos do seu jeito. Crie, edite ou arquive categorias." />
      <div className="grid gap-4 lg:grid-cols-3">
        <CategoryList title="Despesas" items={categories.filter((c) => c.kind === "expense")} />
        <CategoryList title="Receitas" items={categories.filter((c) => c.kind === "income")} />
        <Card>
          <CardHeader title="Nova categoria" />
          <CategoryForm />
        </Card>
      </div>
    </div>
  );
}
