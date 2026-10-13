import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock, LogOut } from "lucide-react";
import { ACCOUNT_NAV, MAIN_NAV, PRO_NAV } from "@/components/app/nav-items";
import { getEntitlements } from "@/lib/auth";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const ent = await getEntitlements();
  const isPro = ent.plan_id !== "free";
  const section = (title: string, items: typeof MAIN_NAV, locked = false) => (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      <ul className="card divide-y divide-slate-100">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex items-center justify-between px-4 py-3.5 text-sm font-medium">
              {i.label}
              <span className="flex items-center gap-2">
                {locked ? <span className="inline-flex items-center gap-1 rounded-full bg-money-100 px-1.5 py-0.5 text-[10px] font-bold text-money-700"><Lock className="h-3 w-3" aria-hidden /> PRO</span> : null}
                <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Menu</h1>
      {section("Finanças", MAIN_NAV.filter((i) => i.href !== "/app"))}
      {section("Recursos Pro", PRO_NAV, !isPro)}
      {section("Conta", ACCOUNT_NAV)}
      <form action="/auth/sair" method="post">
        <button className="card flex w-full items-center gap-2 px-4 py-3.5 text-sm font-medium text-danger-700">
          <LogOut className="h-4 w-4" aria-hidden /> Sair
        </button>
      </form>
    </div>
  );
}
