/**
 * Testes de banco: isolamento de dados (RLS), limites de plano e regras.
 * Executar com: npm run test:db  (sobe um PostgreSQL temporário)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

let db: Client;

async function createUser(email: string, fullName = "Pessoa Teste"): Promise<string> {
  const { rows } = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify({ full_name: fullName })],
  );
  return rows[0].id as string;
}

/** Executa `fn` como o usuário autenticado `uid`, dentro de uma transação revertida ao final. */
async function asUser<T>(uid: string | null, fn: (q: Client["query"]) => Promise<T>, commit = false): Promise<T> {
  await db.query("begin");
  try {
    if (uid) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    } else {
      await db.query("set local role anon");
    }
    const result = await fn(db.query.bind(db) as Client["query"]);
    await db.query(commit ? "commit" : "rollback");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function expectError(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

d("Banco de dados — RLS, isolamento e limites", () => {
  let alice: string;
  let bob: string;
  let aliceAccount: string;
  let bobAccount: string;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    alice = await createUser("alice@teste.local", "Alice");
    bob = await createUser("bob@teste.local", "Bob");

    aliceAccount = await asUser(alice, async (q) => {
      const { rows } = await q("insert into public.accounts (name, initial_balance_cents) values ('Conta Alice', 100000) returning id");
      return rows[0].id;
    }, true);
    bobAccount = await asUser(bob, async (q) => {
      const { rows } = await q("insert into public.accounts (name, initial_balance_cents) values ('Conta Bob', 50000) returning id");
      return rows[0].id;
    }, true);

    await asUser(bob, async (q) => {
      await q(
        "insert into public.transactions (account_id, kind, amount_cents, description, occurred_on) values ($1, 'expense', 9999, 'Segredo do Bob', current_date)",
        [bobAccount],
      );
    }, true);
  });

  afterAll(async () => {
    await db?.end();
  });

  it("cria perfil e categorias padrão no cadastro, sem lançamentos fictícios", async () => {
    await asUser(alice, async (q) => {
      const profile = await q("select full_name from public.profiles");
      expect(profile.rows).toEqual([{ full_name: "Alice" }]);
      const cats = await q("select count(*)::int as n from public.categories");
      expect(cats.rows[0].n).toBe(20);
      const tx = await q("select count(*)::int as n from public.transactions");
      expect(tx.rows[0].n).toBe(0);
    });
  });

  it("um usuário não enxerga dados de outro", async () => {
    await asUser(alice, async (q) => {
      const queries = [
        "select user_id from public.accounts",
        "select user_id from public.transactions",
        "select user_id from public.categories",
        "select user_id from public.account_balances",
        "select id as user_id from public.profiles",
      ];
      for (const sql of queries) {
        const { rows } = await q(sql);
        expect(rows.every((r: { user_id: string }) => r.user_id === alice)).toBe(true);
      }
      const { rows } = await q("select * from public.transactions where description = 'Segredo do Bob'");
      expect(rows).toHaveLength(0);
    });
  });

  it("não permite alterar ou excluir dados de outro usuário", async () => {
    await asUser(alice, async (q) => {
      const upd = await q("update public.accounts set name = 'hack' where id = $1", [bobAccount]);
      expect(upd.rowCount).toBe(0);
      const del = await q("delete from public.transactions where user_id = $1", [bob]);
      expect(del.rowCount).toBe(0);
    });
    const { rows } = await db.query("select name from public.accounts where id = $1", [bobAccount]);
    expect(rows[0].name).toBe("Conta Bob");
  });

  it("não permite inserir registros em nome de outro usuário", async () => {
    await expectError(
      asUser(alice, (q) => q("insert into public.accounts (user_id, name) values ($1, 'x')", [bob])),
      /row-level security/,
    );
  });

  it("não permite usar a conta de outro usuário em um lançamento", async () => {
    await expectError(
      asUser(alice, (q) =>
        q("insert into public.transactions (account_id, kind, amount_cents, description, occurred_on) values ($1, 'expense', 100, 'x', current_date)", [bobAccount]),
      ),
      /foreign key/,
    );
  });

  it("visitante anônimo não lê dados financeiros", async () => {
    await expectError(asUser(null, (q) => q("select * from public.transactions")), /permission denied/);
    await expectError(asUser(null, (q) => q("select * from public.accounts")), /permission denied/);
  });

  it("usuário não pode criar a própria assinatura nem mudar colunas protegidas do perfil", async () => {
    await expectError(
      asUser(alice, (q) =>
        q("insert into public.subscriptions (user_id, plan_id, provider, status) values ($1, 'pro', 'manual', 'active')", [alice]),
      ),
      /permission denied/,
    );
    await expectError(asUser(alice, (q) => q("update public.profiles set created_at = now()")), /permission denied/);
    await expectError(asUser(alice, (q) => q("update public.plans set price_cents = 0")), /permission denied/);
    const ok = await asUser(alice, (q) => q("update public.profiles set full_name = 'Alice Silva'"));
    expect(ok.rowCount).toBe(1);
  });

  it("exige categoria do mesmo tipo do lançamento", async () => {
    await expectError(
      asUser(alice, async (q) => {
        const { rows } = await q("select id from public.categories where kind = 'income' limit 1");
        await q(
          "insert into public.transactions (account_id, category_id, kind, amount_cents, description, occurred_on) values ($1, $2, 'expense', 100, 'x', current_date)",
          [aliceAccount, rows[0].id],
        );
      }),
      /CATEGORY_KIND_MISMATCH/,
    );
  });

  it("calcula saldo e totais em centavos somente com dados do próprio usuário", async () => {
    await asUser(alice, async (q) => {
      await q(
        `insert into public.transactions (account_id, kind, amount_cents, description, occurred_on, status) values
          ($1, 'income', 250010, 'Salário', current_date, 'paid'),
          ($1, 'expense', 3333, 'Café', current_date, 'paid'),
          ($1, 'expense', 10001, 'Luz', current_date, 'pending')`,
        [aliceAccount],
      );
      const bal = await q("select balance_cents from public.account_balances where id = $1", [aliceAccount]);
      expect(Number(bal.rows[0].balance_cents)).toBe(100000 + 250010 - 3333);
      const sum = await q("select * from public.monthly_summary(current_date, current_date)");
      expect(sum.rows).toHaveLength(1);
      expect(Number(sum.rows[0].income_paid_cents)).toBe(250010);
      expect(Number(sum.rows[0].expense_paid_cents)).toBe(3333);
      expect(Number(sum.rows[0].expense_pending_cents)).toBe(10001);
      const cats = await q("select * from public.category_totals(current_date - 1, current_date + 1)");
      const total = cats.rows.reduce((acc: number, r: { total_cents: string }) => acc + Number(r.total_cents), 0);
      expect(total).toBe(3333 + 10001); // o gasto do Bob (9999) não aparece
    });
  });

  it("totais filtrados do período respeitam busca literal (sem curingas)", async () => {
    await asUser(alice, async (q) => {
      await q(
        `insert into public.transactions (account_id, kind, amount_cents, description, occurred_on, status) values
          ($1, 'expense', 1000, 'Desconto 50% loja', current_date, 'paid'),
          ($1, 'expense', 2000, 'Desconto 50 reais', current_date, 'pending')`,
        [aliceAccount],
      );
      const all = await q("select * from public.transaction_totals(current_date, current_date, 'expense')");
      expect(Number(all.rows[0].expense_paid_cents)).toBe(1000);
      expect(Number(all.rows[0].expense_pending_cents)).toBe(2000);
      const literal = await q("select * from public.transaction_totals(current_date, current_date, null, null, null, null, '50%')");
      expect(Number(literal.rows[0].tx_count)).toBe(1);
    });
  });

  describe("limites do plano grátis", () => {
    it("permite no máximo 2 contas ativas, sem apagar as existentes", async () => {
      await asUser(alice, async (q) => {
        await q("insert into public.accounts (name) values ('Segunda')");
        await expect(q("insert into public.accounts (name) values ('Terceira')")).rejects.toThrow(/PLAN_LIMIT:accounts/);
      });
    });

    it("arquivar libera espaço e desarquivar respeita o limite", async () => {
      await asUser(alice, async (q) => {
        const { rows } = await q("insert into public.accounts (name) values ('Segunda') returning id");
        await q("update public.accounts set archived_at = now() where id = $1", [rows[0].id]);
        const third = await q("insert into public.accounts (name) values ('Terceira') returning id");
        expect(third.rowCount).toBe(1);
        await expect(q("update public.accounts set archived_at = null where id = $1", [rows[0].id])).rejects.toThrow(/PLAN_LIMIT:accounts/);
      });
    });

    it("permite 1 orçamento ativo e 1 meta ativa", async () => {
      await asUser(alice, async (q) => {
        await q("insert into public.budgets (amount_cents) values (100000)");
        const { rows } = await q("select id from public.categories where kind = 'expense' limit 1");
        await expect(q("insert into public.budgets (category_id, amount_cents) values ($1, 5000)", [rows[0].id])).rejects.toThrow(/PLAN_LIMIT:budgets/);
      });
      await asUser(alice, async (q) => {
        await q("insert into public.goals (name, target_cents) values ('Reserva', 500000)");
        const done = await q("insert into public.goals (name, target_cents, status) values ('Concluída', 100, 'completed')");
        expect(done.rowCount).toBe(1);
        await expect(q("insert into public.goals (name, target_cents) values ('Viagem', 300000)")).rejects.toThrow(/PLAN_LIMIT:goals/);
      });
    });

    it("orçamento só aceita categoria de despesa", async () => {
      await expectError(
        asUser(alice, async (q) => {
          const { rows } = await q("select id from public.categories where kind = 'income' limit 1");
          await q("insert into public.budgets (category_id, amount_cents) values ($1, 100)", [rows[0].id]);
        }),
        /BUDGET_CATEGORY_NOT_EXPENSE/,
      );
    });

    it("informa direitos do plano para a interface", async () => {
      const ent = await asUser(alice, async (q) => (await q("select public.my_entitlements() as e")).rows[0].e);
      expect(ent.plan_id).toBe("free");
      expect(ent.limits.accounts).toBe(2);
      expect(ent.limits.active_goals).toBe(1);
      expect(ent.usage.accounts).toBe(1);
      expect(ent.features).not.toContain("debts");
    });
  });

  describe("plano Pro", () => {
    it("assinatura vigente libera limites; após o fim do período pago volta ao grátis sem perder dados", async () => {
      const carol = await createUser("carol@teste.local");
      await db.query(
        "insert into public.subscriptions (user_id, plan_id, provider, status, started_at, current_period_end) values ($1, 'pro', 'manual', 'active', now(), now() + interval '30 days')",
        [carol],
      );
      await asUser(carol, async (q) => {
        for (const n of ["A", "B", "C", "D"]) await q("insert into public.accounts (name) values ($1)", [n]);
        const ent = (await q("select public.my_entitlements() as e")).rows[0].e;
        expect(ent.plan_id).toBe("pro");
        expect(ent.limits.accounts).toBeNull();
      }, true);

      // Cancelada, mas ainda dentro do período pago: continua Pro.
      await db.query("update public.subscriptions set status = 'canceled', canceled_at = now() where user_id = $1", [carol]);
      await asUser(carol, async (q) => {
        expect((await q("select public.my_entitlements() as e")).rows[0].e.plan_id).toBe("pro");
      });

      // Período encerrado: volta ao grátis, dados continuam acessíveis, mas não cria acima do limite.
      await db.query("update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1", [carol]);
      await asUser(carol, async (q) => {
        const { rows } = await q("select count(*)::int as n from public.accounts");
        expect(rows[0].n).toBe(4);
        await expect(q("insert into public.accounts (name) values ('E')")).rejects.toThrow(/PLAN_LIMIT:accounts/);
      });
    });

    it("assinatura pendente (pagamento não confirmado) não libera o Pro", async () => {
      const dave = await createUser("dave@teste.local");
      await db.query(
        "insert into public.subscriptions (user_id, plan_id, provider, status, current_period_end) values ($1, 'pro', 'manual', 'pending', now() + interval '30 days')",
        [dave],
      );
      const ent = await asUser(dave, async (q) => (await q("select public.my_entitlements() as e")).rows[0].e);
      expect(ent.plan_id).toBe("free");
    });
  });

  it("excluir o usuário remove todos os dados dele (cascata)", async () => {
    const eve = await createUser("eve@teste.local");
    await asUser(eve, async (q) => {
      const { rows } = await q("insert into public.accounts (name) values ('Eve') returning id");
      await q("insert into public.transactions (account_id, kind, amount_cents, description, occurred_on) values ($1, 'income', 1, 'x', current_date)", [rows[0].id]);
    }, true);
    await db.query("delete from auth.users where id = $1", [eve]);
    for (const table of ["profiles", "accounts", "categories", "transactions"]) {
      const col = table === "profiles" ? "id" : "user_id";
      const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${col} = $1`, [eve]);
      expect(rows[0].n).toBe(0);
    }
  });
});
