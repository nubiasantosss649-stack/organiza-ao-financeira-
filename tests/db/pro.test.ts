/**
 * Testes de banco da Etapa 2: recursos Pro protegidos no backend, cartões sem
 * contagem dupla, dívidas, importação sem duplicatas e limites do assistente de IA.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { invoiceDueDate } from "@/lib/cards";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
let db: Client;

async function createUser(email: string): Promise<string> {
  const { rows } = await db.query("insert into auth.users (email) values ($1) returning id", [email]);
  return rows[0].id;
}

async function makePro(uid: string) {
  await db.query(
    "insert into public.subscriptions (user_id, plan_id, provider, status, started_at, current_period_end) values ($1, 'pro', 'manual', 'active', now(), now() + interval '30 days')",
    [uid],
  );
}

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;

async function asUser<T>(uid: string, fn: (q: Q) => Promise<T>, commit = true): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const r = await fn((sql, params) => db.query(sql, params as unknown[]));
    await db.query(commit ? "commit" : "rollback");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

d("Banco — Etapa 2 (Pro)", () => {
  let free: string;
  let pro: string;
  let proAccount: string;
  let card: string;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const stamp = Date.now();
    free = await createUser(`free${stamp}@t.local`);
    pro = await createUser(`pro${stamp}@t.local`);
    await makePro(pro);
    proAccount = await asUser(pro, async (q) =>
      String((await q("insert into public.accounts (name, initial_balance_cents) values ('Banco', 500000) returning id")).rows[0].id));
    card = await asUser(pro, async (q) =>
      String((await q("insert into public.credit_cards (name, limit_cents, closing_day, due_day) values ('Visa', 300000, 3, 10) returning id")).rows[0].id));
  });

  afterAll(async () => {
    await db?.end();
  });

  describe("recursos Pro protegidos no banco", () => {
    it("plano Grátis não cria cartão, dívida nem importação", async () => {
      await expect(asUser(free, (q) => q("insert into public.credit_cards (name, limit_cents, closing_day, due_day) values ('X', 1000, 1, 10)"))).rejects.toThrow(/row-level security/);
      await expect(asUser(free, (q) => q("insert into public.debts (name, balance_cents, balance_date) values ('X', 1000, current_date)"))).rejects.toThrow(/row-level security/);
      const acc = await asUser(free, async (q) => String((await q("insert into public.accounts (name) values ('A') returning id")).rows[0].id));
      await expect(asUser(free, (q) => q("insert into public.statement_imports (account_id, file_name, format) values ($1, 'a.csv', 'csv')", [acc]))).rejects.toThrow(/row-level security/);
    });

    it("plano Grátis não usa o cartão de outro usuário nem lança compra em cartão", async () => {
      const acc = await asUser(free, async (q) => String((await q("select id from public.accounts limit 1")).rows[0].id));
      await expect(asUser(free, (q) =>
        q("insert into public.transactions (card_id, kind, amount_cents, description, occurred_on) values ($1, 'expense', 100, 'x', current_date)", [card]),
      )).rejects.toThrow(/FEATURE_REQUIRED|foreign key/);
      // lançamento normal em conta continua liberado
      await asUser(free, (q) => q("insert into public.transactions (account_id, kind, amount_cents, description, occurred_on) values ($1, 'expense', 100, 'x', current_date)", [acc]));
    });

    it("dados Pro continuam visíveis após o fim da assinatura, mas não é possível criar novos", async () => {
      const ex = await createUser(`ex${Date.now()}@t.local`);
      await makePro(ex);
      await asUser(ex, (q) => q("insert into public.debts (name, balance_cents, balance_date) values ('Empréstimo', 100000, current_date)"));
      await db.query("update public.subscriptions set current_period_end = now() - interval '1 day', status = 'canceled' where user_id = $1", [ex]);
      await asUser(ex, async (q) => {
        expect((await q("select count(*)::int as n from public.debt_summaries")).rows[0].n).toBe(1);
        // pagamento de dívida existente segue permitido (mantém saldos corretos)
        const id = (await q("select id from public.debts limit 1")).rows[0].id;
        await q("insert into public.debt_payments (debt_id, amount_cents, paid_on) values ($1, 1000, current_date)", [id]);
        expect(Number((await q("select remaining_cents from public.debt_summaries")).rows[0].remaining_cents)).toBe(99000);
      });
      await expect(asUser(ex, (q) => q("insert into public.debts (name, balance_cents, balance_date) values ('Nova', 1, current_date)"))).rejects.toThrow(/row-level security/);
    });
  });

  describe("cartões: faturas e sem contagem dupla", () => {
    it("calcula a fatura no banco igual ao TypeScript", async () => {
      const cases: Array<[number, number, string]> = [
        [3, 10, "2026-10-02"], [3, 10, "2026-10-03"], [25, 5, "2026-12-30"], [31, 10, "2026-02-28"], [5, 31, "2026-01-10"], [30, 1, "2028-02-29"],
      ];
      for (const [c, due, date] of cases) {
        const { rows } = await db.query("select private.card_invoice_due($1, $2, $3::date)::text as d", [c, due, date]);
        expect(rows[0].d, `${c}/${due}/${date}`).toBe(invoiceDueDate(c, due, date));
      }
    });

    it("compra no cartão é despesa, não mexe no saldo; pagar a fatura reduz o saldo sem virar despesa", async () => {
      await asUser(pro, async (q) => {
        await q("insert into public.transactions (card_id, kind, amount_cents, description, occurred_on, status) values ($1, 'expense', 12000, 'Restaurante', '2026-10-05', 'pending')", [card]);
        const tx = (await q("select status, invoice_due_on::text as due from public.transactions where card_id = $1", [card])).rows[0];
        expect(tx).toEqual({ status: "paid", due: "2026-11-10" });

        const balance = async () => Number((await q("select balance_cents from public.account_balances where id = $1", [proAccount])).rows[0].balance_cents);
        expect(await balance()).toBe(500000);
        const used = async () => Number((await q("select used_cents from public.card_summaries where id = $1", [card])).rows[0].used_cents);
        expect(await used()).toBe(12000);

        const inv = (await q("select * from public.card_invoices($1)", [card])).rows;
        expect(inv).toHaveLength(1);
        expect(Number(inv[0].total_cents)).toBe(12000);

        await q("insert into public.card_invoice_payments (card_id, invoice_due_on, account_id, amount_cents, paid_on) values ($1, '2026-11-10', $2, 12000, '2026-11-08')", [card, proAccount]);
        expect(await balance()).toBe(488000);
        expect(await used()).toBe(0);

        // A despesa aparece UMA vez: só a compra (outubro), nada no mês do pagamento.
        const oct = (await q("select expense_paid_cents from public.monthly_summary('2026-10-01', '2026-11-01')")).rows.map((r) => Number(r.expense_paid_cents));
        expect(oct).toEqual([12000, 0]);
        expect((await q("select * from public.open_card_invoices('2026-12-31')")).rows).toHaveLength(0);
      });
    });

    it("lançamento precisa ter exatamente uma origem e compra no cartão só pode ser despesa", async () => {
      await expect(asUser(pro, (q) => q("insert into public.transactions (account_id, card_id, kind, amount_cents, description, occurred_on) values ($1, $2, 'expense', 1, 'x', current_date)", [proAccount, card]))).rejects.toThrow(/transactions_one_source/);
      await expect(asUser(pro, (q) => q("insert into public.transactions (kind, amount_cents, description, occurred_on) values ('expense', 1, 'x', current_date)"))).rejects.toThrow(/transactions_one_source/);
      await expect(asUser(pro, (q) => q("insert into public.transactions (card_id, kind, amount_cents, description, occurred_on) values ($1, 'income', 1, 'x', current_date)", [card]))).rejects.toThrow(/transactions_card_is_expense/);
    });

    it("mudar o fechamento recalcula as faturas", async () => {
      await asUser(pro, async (q) => {
        const c = String((await q("insert into public.credit_cards (name, limit_cents, closing_day, due_day) values ('Master', 100000, 3, 10) returning id")).rows[0].id);
        await q("insert into public.transactions (card_id, kind, amount_cents, description, occurred_on) values ($1, 'expense', 500, 'x', '2026-10-05')", [c]);
        await q("update public.credit_cards set closing_day = 10, due_day = 20 where id = $1", [c]);
        const due = (await q("select invoice_due_on::text as d from public.transactions where card_id = $1", [c])).rows[0].d;
        expect(due).toBe(invoiceDueDate(10, 20, "2026-10-05"));
      }, false);
    });
  });

  describe("importação", () => {
    it("o mesmo hash não é importado duas vezes; desfazer remove os lançamentos", async () => {
      const hash = "a".repeat(64);
      await asUser(pro, async (q) => {
        const imp = String((await q("insert into public.statement_imports (account_id, file_name, format) values ($1, 'x.ofx', 'ofx') returning id", [proAccount])).rows[0].id);
        await q("insert into public.transactions (account_id, kind, amount_cents, description, occurred_on, import_id, import_hash) values ($1, 'expense', 100, 'x', current_date, $2, $3)", [proAccount, imp, hash]);
        await expect(q("insert into public.transactions (account_id, kind, amount_cents, description, occurred_on, import_id, import_hash) values ($1, 'expense', 100, 'x', current_date, $2, $3)", [proAccount, imp, hash])).rejects.toThrow(/transactions_import_hash_unique/);
      }, false);
      await asUser(pro, async (q) => {
        const imp = String((await q("insert into public.statement_imports (account_id, file_name, format) values ($1, 'x.ofx', 'ofx') returning id", [proAccount])).rows[0].id);
        await q("insert into public.transactions (account_id, kind, amount_cents, description, occurred_on, import_id, import_hash) values ($1, 'expense', 100, 'x', current_date, $2, $3)", [proAccount, imp, hash]);
        await q("delete from public.statement_imports where id = $1", [imp]);
        expect((await q("select count(*)::int as n from public.transactions where import_hash = $1", [hash])).rows[0].n).toBe(0);
      }, false);
    });
  });

  describe("assistente de IA", () => {
    it("exige consentimento antes de qualquer análise", async () => {
      await expect(asUser(free, (q) => q("select public.ai_reserve('preset')"))).rejects.toThrow(/AI_CONSENT_REQUIRED/);
    });

    it("Grátis: 3 análises prontas no total, sem perguntas livres; falhas não contam", async () => {
      const u = await createUser(`ai${Date.now()}@t.local`);
      await asUser(u, (q) => q("update public.profiles set ai_consent_at = now()"));
      await expect(asUser(u, (q) => q("select public.ai_reserve('chat')"))).rejects.toThrow(/FEATURE_REQUIRED:ai_assistant/);

      const reserve = () => asUser(u, async (q) => (await q("select public.ai_reserve('preset') as r")).rows[0].r as { usage_id: number; used: number; limit: number });
      const first = await reserve();
      expect(first).toMatchObject({ used: 1, limit: 3, period: "lifetime" });
      // servidor marca falha (ex.: provedor fora do ar) → não consome
      await db.query("set role service_role");
      await db.query("select public.ai_finish($1, false, null, 0, 0, 0)", [first.usage_id]);
      await db.query("reset role");

      for (let i = 0; i < 3; i++) {
        const r = await reserve();
        await db.query("select public.ai_finish($1, true, 'claude-opus-5-5', 100, 50, 1400)", [r.usage_id]);
      }
      await expect(reserve()).rejects.toThrow(/AI_LIMIT_REACHED/);
      const usage = await asUser(u, async (q) => (await q("select public.my_ai_usage() as u")).rows[0].u);
      expect(usage).toMatchObject({ used: 3, limit: 3, consented: true });
    });

    it("o usuário não consegue estornar a própria análise nem gravar uso diretamente", async () => {
      await expect(asUser(pro, (q) => q("select public.ai_finish(1, false, null, 0, 0, 0)"))).rejects.toThrow(/permission denied/);
      await expect(asUser(pro, (q) => q("insert into public.ai_usage (user_id, kind) values ($1, 'chat')", [pro]))).rejects.toThrow(/permission denied/);
    });

    it("Pro: perguntas livres com limite mensal configurável no plano", async () => {
      await db.query("update public.plans set ai_analyses_limit = 2 where id = 'pro'");
      try {
        await asUser(pro, (q) => q("update public.profiles set ai_consent_at = now()"));
        await asUser(pro, (q) => q("select public.ai_reserve('chat')"));
        await asUser(pro, (q) => q("select public.ai_reserve('preset')"));
        await expect(asUser(pro, (q) => q("select public.ai_reserve('chat')"))).rejects.toThrow(/AI_LIMIT_REACHED/);
        // uso do mês anterior não conta
        await db.query("update public.ai_usage set created_at = now() - interval '40 days', status = 'completed' where user_id = $1", [pro]);
        await asUser(pro, (q) => q("select public.ai_reserve('chat')"));
      } finally {
        await db.query("update public.plans set ai_analyses_limit = 20 where id = 'pro'");
      }
    });
  });

  it("isolamento: o usuário Grátis não vê cartões, dívidas, faturas nem uso de IA do Pro", async () => {
    await asUser(free, async (q) => {
      for (const t of ["credit_cards", "card_summaries", "card_invoice_payments", "debts", "debt_summaries", "statement_imports", "ai_usage"]) {
        expect((await q(`select count(*)::int as n from public.${t}`)).rows[0].n, t).toBe(0);
      }
      expect((await q("select * from public.card_invoices($1)", [card])).rows).toHaveLength(0);
    });
  });
});
