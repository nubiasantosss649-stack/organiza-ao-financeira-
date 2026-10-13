"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bot, CreditCard, Crown, FileUp, HandCoins, Home, List, Lock, Menu, PieChart, Plus, Tags, Target, User, Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ACCOUNT_NAV, MAIN_NAV, PRO_NAV, type NavIcon, type NavItem } from "./nav-items";

const ICONS: Record<NavIcon, typeof Home> = {
  home: Home, list: List, target: Target, pie: PieChart, wallet: Wallet, tags: Tags, card: CreditCard,
  debt: HandCoins, import: FileUp, ai: Bot, reports: BarChart3, user: User, crown: Crown,
};

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/");
}

function SideLink({ item, pathname, locked }: { item: NavItem; pathname: string; locked: boolean }) {
  const Icon = ICONS[item.icon];
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active ? "bg-white/10 text-white" : "text-navy-100/80 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", active ? "text-money-400" : "")} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {locked ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-money-500/15 px-1.5 py-0.5 text-[10px] font-bold text-money-400">
          <Lock className="h-3 w-3" aria-hidden /> PRO
        </span>
      ) : null}
    </Link>
  );
}

export function SideNav({ isPro }: { isPro: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-6">
      <div className="space-y-1">
        {MAIN_NAV.map((item) => <SideLink key={item.href} item={item} pathname={pathname} locked={false} />)}
      </div>
      <div>
        <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-navy-100/50">Recursos Pro</p>
        <div className="space-y-1">
          {PRO_NAV.map((item) => <SideLink key={item.href} item={item} pathname={pathname} locked={!isPro} />)}
        </div>
      </div>
      <div className="space-y-1">
        {ACCOUNT_NAV.map((item) => <SideLink key={item.href} item={item} pathname={pathname} locked={false} />)}
      </div>
    </nav>
  );
}

const BOTTOM: Array<{ href: string; label: string; Icon: typeof Home }> = [
  { href: "/app", label: "Início", Icon: Home },
  { href: "/app/lancamentos", label: "Lançamentos", Icon: List },
  { href: "/app/lancamentos/novo", label: "Novo", Icon: Plus },
  { href: "/app/metas", label: "Metas", Icon: Target },
  { href: "/app/menu", label: "Mais", Icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Menu inferior"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {BOTTOM.map(({ href, label, Icon }) => {
          const isNew = href === "/app/lancamentos/novo";
          const active = !isNew && (href === "/app/lancamentos" ? pathname === href : isActive(pathname, href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-navy-900" : "text-slate-500",
                )}
              >
                {isNew ? (
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-money-500 text-white shadow-lg shadow-money-500/30">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                ) : (
                  <Icon className={cn("h-5 w-5", active && "text-money-600")} aria-hidden />
                )}
                <span>{isNew ? "Novo" : label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
