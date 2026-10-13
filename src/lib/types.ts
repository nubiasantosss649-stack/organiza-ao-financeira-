import type { ISODate } from "./dates";
import type { TxKind, TxStatus } from "./finance";

export type AccountType = "checking" | "savings" | "cash" | "digital_wallet" | "investment" | "other";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro em espécie",
  digital_wallet: "Carteira digital",
  investment: "Investimentos",
  other: "Outra",
};

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  archived_at: string | null;
  initial_balance_cents: number;
  balance_cents: number;
}

export interface Category {
  id: string;
  name: string;
  kind: TxKind;
  color: string;
  icon: string;
  is_default: boolean;
  archived_at: string | null;
}

export interface Transaction {
  id: string;
  account_id: string;
  category_id: string | null;
  kind: TxKind;
  amount_cents: number;
  description: string;
  occurred_on: ISODate;
  status: TxStatus;
  paid_on: ISODate | null;
  notes: string | null;
  recurrence_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  created_at: string;
}

export type GoalKind = "savings" | "emergency" | "travel" | "purchase" | "education" | "other";

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  savings: "Guardar dinheiro",
  emergency: "Reserva de emergência",
  travel: "Viagem",
  purchase: "Compra planejada",
  education: "Estudos",
  other: "Outra meta",
};

export interface GoalProgress {
  id: string;
  name: string;
  kind: GoalKind;
  target_cents: number;
  target_date: ISODate | null;
  status: "active" | "completed" | "archived";
  created_at: string;
  saved_cents: number;
  deposits_count: number;
}

export interface Budget {
  id: string;
  category_id: string | null;
  amount_cents: number;
  is_active: boolean;
}

export interface Entitlements {
  plan_id: string;
  plan_name: string;
  price_cents: number;
  features: string[];
  limits: {
    accounts: number | null;
    active_budgets: number | null;
    active_goals: number | null;
    ai_analyses: number | null;
    ai_limit_period: "lifetime" | "month";
  };
  usage: { accounts: number; active_budgets: number; active_goals: number };
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_interval: "none" | "month";
  max_accounts: number | null;
  max_active_budgets: number | null;
  max_active_goals: number | null;
  ai_analyses_limit: number | null;
  ai_limit_period: "lifetime" | "month";
  features: string[];
}

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};
