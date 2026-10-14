export type NavIcon =
  | "home" | "list" | "target" | "pie" | "wallet" | "tags" | "card" | "debt" | "import" | "ai" | "reports" | "user" | "crown";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  premium?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { href: "/app", label: "Início", icon: "home" },
  { href: "/app/lancamentos", label: "Lançamentos", icon: "list" },
  { href: "/app/orcamentos", label: "Orçamentos", icon: "pie" },
  { href: "/app/metas", label: "Minhas metas", icon: "target" },
  { href: "/app/contas", label: "Contas e carteiras", icon: "wallet" },
  { href: "/app/categorias", label: "Categorias", icon: "tags" },
];

export const PRO_NAV: NavItem[] = [
  { href: "/app/ia", label: "Controle Fácil IA", icon: "ai", premium: true },
  { href: "/app/dividas", label: "Minhas dívidas", icon: "debt", premium: true },
  { href: "/app/cartoes", label: "Cartões de crédito", icon: "card", premium: true },
  { href: "/app/importar", label: "Importar extrato", icon: "import", premium: true },
  { href: "/app/relatorios", label: "Relatórios", icon: "reports", premium: true },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: "/app/planos", label: "Planos", icon: "crown" },
  { href: "/app/assinatura", label: "Minha assinatura", icon: "card" },
  { href: "/app/perfil", label: "Meu perfil", icon: "user" },
];
