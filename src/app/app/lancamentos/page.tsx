import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Plus, Search, Undo2, ReceiptText } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { TransactionRow } from "@/components/app/transaction-row";
import { toggleTransactionStatus } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { listAccounts, listCards, listCategories, sourceName } from "@/lib/queries";
import {
  formatDateBR, formatPeriodLabel, isISODate, periodRange, shiftPeriod, todayISO, type PeriodKind,
} from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Transaction } from "@/lib/types";

export const metadata: Metadata = { title: "Lançamentos" };

const PAGE_SIZE = 50;
const PERIODS: Array<[PeriodKind, string]> = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"], ["year", "Ano"]];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function TransactionsPage({ searchParams }: PageProps<"/app/lancamentos">) {
  const sp = await searchParams;
  const today = todayISO();
  const period = (["day", "week", "month", "year"] as const).find((p) => p === sp.periodo) ?? "month";
  const ref = str(sp.ref) && isISODate(str(sp.ref)!) ? str(sp.ref)! : today;
  const { from, to } = periodRange(period, ref);
  const q = (str(sp.q) ?? "").trim().slice(0, 60);
  const kind = sp.tipo === "income" || sp.tipo === "expense" ? sp.tipo : null;
  const status = sp.status === "paid" || sp.status === "pending" ? sp.status : null;
  const account = str(sp.conta) && UUID_RE.test(str(sp.conta)!) ? str(sp.conta)! : null;
  const category = str(sp.categoria) && UUID_RE.test(str(sp.categoria)!) ? str(sp.categoria)! : null;
  const page = Math.max(0, Math.min(1000, Number.parseInt(str(sp.pagina) ?? "0", 10) || 0));

  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select("*")
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  if (account) query = query.eq("account_id", account);
  if (category) query = query.eq("category_id", category);
  if (q) query = query.ilike("description", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const [{ data, error }, totalsRes, accounts, categories, cards] = await Promise.all([
    query
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
    supabase.rpc("transaction_totals", {
      p_from: from, p_to: to, p_kind: kind, p_status: status, p_account: account, p_category: category, p_search: q || null,
    }),
    listAccounts({ includeArchived: true }),
    listCategories({ includeArchived: true }),
    listCards({ includeArchived: true }),
  ]);
  if (error) throw new Error("Falha ao carregar lançamentos.");

  const txs = ((data ?? []) as Transaction[]).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
  const totals = totalsRes.data?.[0] ?? { income_paid_cents: 0, expense_paid_cents: 0, income_pending_cents: 0, expense_pending_cents: 0, tx_count: 0 };
  const income = Number(totals.income_paid_cents) + Number(totals.income_pending_cents);
  const expense = Number(totals.expense_paid_cents) + Number(totals.expense_pending_cents);
  const count = Number(totals.tx_count);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const baseParams = { periodo: period, ref, q: q || undefined, tipo: kind ?? undefined, status: status ?? undefined, conta: account ?? undefined, categoria: category ?? undefined };
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ ...baseParams, ...over }).forEach(([k, v]) => { if (v) p.set(k, v); });
    return `/app/lancamentos?${p.toString()}`;
  };

  const groups = new Map<string, typeof txs>();
  for (const t of txs) {
    if (!groups.has(t.occurred_on)) groups.set(t.occurred_on, []);
    groups.get(t.occurred_on)!.push(t);
  }
  const hasFilters = Boolean(q || kind || status || account || category);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">Lançamentos</h1>
          <p className="mt-1 text-sm text-slate-500">Histórico de receitas e despesas</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/app/lancamentos/novo?tipo=income" variant="secondary" size="sm">+ Receita</ButtonLink>
          <ButtonLink href="/app/lancamentos/novo" variant="money" size="sm"><Plus className="h-4 w-4" aria-hidden /> Despesa</ButtonLink>
        </div>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Período">
            {PERIODS.map(([value, label]) => (
              <Link key={value} href={href({ periodo: value, pagina: undefined })} role="tab" aria-selected={period === value}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", period === value ? "bg-white text-navy-900 shadow-sm" : "text-slate-600")}>
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center rounded-xl border border-slate-200">
            <Link href={href({ ref: shiftPeriod(period, ref, -1), pagina: undefined })} className="p-2 text-slate-600" aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Link>
            <span className="min-w-32 px-1 text-center text-sm font-semibold">{formatPeriodLabel(period, ref)}</span>
            <Link href={href({ ref: shiftPeriod(period, ref, 1), pagina: undefined })} className="p-2 text-slate-600" aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Link>
          </div>
          {ref !== today ? <Link href={href({ ref: today, pagina: undefined })} className="text-sm font-medium text-navy-600 hover:underline">Hoje</Link> : null}
        </div>

        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6" action="/app/lancamentos" role="search">
          <input type="hidden" name="periodo" value={period} />
          <input type="hidden" name="ref" value={ref} />
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input name="q" defaultValue={q} placeholder="Pesquisar descrição" aria-label="Pesquisar" className="input pl-9" />
          </div>
          <select name="tipo" defaultValue={kind ?? ""} aria-label="Tipo" className="input">
            <option value="">Receitas e despesas</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
          </select>
          <select name="status" defaultValue={status ?? ""} aria-label="Situação" className="input">
            <option value="">Pagos e pendentes</option>
            <option value="paid">Pagos/recebidos</option>
            <option value="pending">Pendentes</option>
          </select>
          <select name="conta" defaultValue={account ?? ""} aria-label="Conta" className="input">
            <option value="">Todas as contas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="categoria" defaultValue={category ?? ""} aria-label="Categoria" className="input">
            <option value="">Todas as categorias</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind === "income" ? "receita" : "despesa"})</option>)}
          </select>
          <div className="flex gap-2 lg:col-span-6">
            <button className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
            {hasFilters ? <Link href={`/app/lancamentos?periodo=${period}&ref=${ref}`} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Limpar filtros</Link> : null}
          </div>
        </form>
      </Card>

      <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Totais do período">
        <div className="card p-3"><p className="text-xs text-slate-500">Receitas</p><p className="tabular text-sm font-bold text-money-700 sm:text-lg">{formatBRL(income)}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Despesas</p><p className="tabular text-sm font-bold sm:text-lg">{formatBRL(expense)}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Saldo do período</p><p className={cn("tabular text-sm font-bold sm:text-lg", income - expense < 0 ? "text-danger-700" : "text-navy-900")}>{formatBRL(income - expense)}</p></div>
      </section>
      <p className="-mt-2 text-xs text-slate-500">Totais incluem lançamentos pagos e pendentes do período filtrado ({count} {count === 1 ? "lançamento" : "lançamentos"}).</p>

      <Card className="p-0 sm:p-0">
        {txs.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="h-6 w-6" />}
            title={hasFilters ? "Nada encontrado com esses filtros" : "Nenhum lançamento neste período"}
            description={hasFilters ? "Tente outro termo ou limpe os filtros." : "Registre receitas e despesas para acompanhar seu dinheiro."}
            action={hasFilters ? undefined : <ButtonLink href="/app/lancamentos/novo" variant="money" size="sm"><Plus className="h-4 w-4" /> Novo lançamento</ButtonLink>}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {[...groups.entries()].map(([date, items]) => (
              <div key={date} className="px-3 sm:px-5">
                <h2 className="sticky top-14 z-10 -mx-3 bg-white/95 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur sm:-mx-5 sm:px-5 lg:top-0">
                  {date === today ? "Hoje" : formatDateBR(date)}
                </h2>
                <ul className="divide-y divide-slate-50">
                  {items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      tx={t}
                      category={t.category_id ? catById.get(t.category_id) : undefined}
                      accountName={sourceName(t, accById, cardById)}
                      today={today}
                      actions={t.card_id ? undefined :
                        <form action={toggleTransactionStatus}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            className={cn("rounded-lg p-2", t.status === "pending" ? "text-money-600 hover:bg-money-50" : "text-slate-400 hover:bg-slate-100")}
                            aria-label={t.status === "pending" ? `Marcar "${t.description}" como ${t.kind === "income" ? "recebido" : "pago"}` : `Marcar "${t.description}" como pendente`}
                            title={t.status === "pending" ? (t.kind === "income" ? "Marcar como recebido" : "Marcar como pago") : "Voltar para pendente"}
                          >
                            {t.status === "pending" ? <Check className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                          </button>
                        </form>
                      }
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {count > PAGE_SIZE ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {page > 0 ? <Link href={href({ pagina: String(page - 1) })} className="font-medium text-navy-600">← Anteriores</Link> : <span />}
          <span className="text-slate-500">Página {page + 1} de {Math.ceil(count / PAGE_SIZE)}</span>
          {(page + 1) * PAGE_SIZE < count ? <Link href={href({ pagina: String(page + 1) })} className="font-medium text-navy-600">Próximos →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
