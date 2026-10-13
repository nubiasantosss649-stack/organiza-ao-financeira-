import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BottomNav, SideNav } from "@/components/app/nav";
import { ConnectionStatus } from "@/components/app/connection-status";
import { getEntitlements, requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const [user, ent] = await Promise.all([requireUser(), getEntitlements()]);
  const isPro = ent.plan_id !== "free";
  const firstName = (user.fullName ?? user.email).split(" ")[0];

  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col overflow-y-auto bg-navy-900 px-4 py-6 lg:flex">
        <Link href="/app" className="mb-8 px-2"><Logo inverted /></Link>
        <SideNav isPro={isPro} />
        <div className="mt-auto pt-6">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="truncate text-sm font-semibold text-white">{user.fullName ?? "Minha conta"}</p>
            <p className="truncate text-xs text-navy-100/70">{user.email}</p>
            <p className="mt-2 text-xs font-semibold text-money-400">{ent.plan_name}</p>
          </div>
          <form action="/auth/sair" method="post" className="mt-2">
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-navy-100/80 hover:bg-white/5 hover:text-white">
              <LogOut className="h-4 w-4" aria-hidden /> Sair
            </button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link href="/app"><Logo /></Link>
        <Link href="/app/perfil" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white" aria-label="Meu perfil">
          {firstName.slice(0, 1).toUpperCase()}
        </Link>
      </header>

      <ConnectionStatus />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>
      <BottomNav />
    </div>
  );
}
