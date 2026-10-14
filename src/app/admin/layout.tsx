import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: { default: "Admin", template: "%s · Admin · Controle Fácil" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3"><Logo inverted /><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold">ADMIN</span></div>
          <nav className="flex gap-1 text-sm">
            {[["/admin", "Visão geral"], ["/admin/planos", "Planos e ofertas"], ["/admin/logs", "Logs"], ["/app", "Voltar ao app"]].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-navy-100 hover:bg-white/10 hover:text-white">{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-4 text-xs text-slate-500">
          Conectado como {user.email}. Este painel mostra apenas números agregados — não há acesso aos dados financeiros individuais dos clientes.
        </p>
        {children}
      </main>
    </div>
  );
}
