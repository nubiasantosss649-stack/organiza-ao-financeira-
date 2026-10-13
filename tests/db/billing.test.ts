/**
 * Testes de cobrança no banco: ativação só com pagamento aprovado, idempotência,
 * recusa, cancelamento, estorno, teste Pro e painel administrativo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
let db: Client;

async function createUser(email: string): Promise<string> {
  const { rows } = await db.query("insert into auth.users (email) values ($1) returning id", [email]);
  return rows[0].id;
}

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;

async function as<T>(role: "authenticated" | "service_role", uid: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    if (uid) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role })]);
    const r = await fn((sql, params) => db.query(sql, params as unknown[]));
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
const asUser = <T>(uid: string, fn: (q: Q) => Promise<T>) => as("authenticated", uid, fn);
const asServer = <T>(fn: (q: Q) => Promise<T>) => as("service_role", null, fn);

const plan = async (uid: string) =>
  (await asUser(uid, async (q) => (await q("select public.my_entitlements() as e")).rows[0].e as { plan_id: string })).plan_id;

let n = 0;
const uniq = () => `${Date.now()}${n++}`;

async function checkout(uid: string, preId: string) {
  return asServer(async (q) => (await q("select public.billing_register_checkout($1, 'mercadopago', $2, 1990, null) as id", [uid, preId])).rows[0].id as string);
}
async function payment(preId: string, payId: string, status: string, paidAt = "now()", periodEnd: string | null = null) {
  return asServer(async (q) => (await q(
    `select public.billing_record_payment('mercadopago', $1, $2, 1990, $3, null, ${paidAt === "now()" ? "now()" : `'${paidAt}'::timestamptz`}, $4) as r`,
    [preId, payId, status, periodEnd],
  )).rows[0].r as { applied: boolean; reason?: string });
}
async function subStatus(preId: string, status: string) {
  return asServer(async (q) => (await q(
    "select public.billing_apply_subscription_status('mercadopago', $1, $2, $3, '2030-01-01T00:00:00Z'::timestamptz) as r",
    [preId, status, status],
  )).rows[0].r as { applied: boolean; reason?: string });
}

d("Banco — assinaturas e cobranças (Etapa 3)", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  it("checkout pendente e assinatura autorizada NÃO liberam o Pro; só o pagamento aprovado libera", async () => {
    const u = await createUser(`c${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    await checkout(u, pre);
    expect(await plan(u)).toBe("free");
    expect((await subStatus(pre, "active")).applied).toBe(true);
    expect(await plan(u)).toBe("free");
    expect((await payment(pre, `pay_${uniq()}`, "approved")).applied).toBe(true);
    expect(await plan(u)).toBe("pro");
    const ev = await asUser(u, async (q) => (await q("select event_type from public.subscription_events order by id")).rows.map((r) => r.event_type));
    expect(ev).toEqual(["checkout_started", "status_changed", "payment_approved"]);
    const pays = await asUser(u, async (q) => (await q("select status, amount_cents from public.billing_payments")).rows);
    expect(pays).toEqual([{ status: "approved", amount_cents: 1990 }]);
  });

  it("notificações repetidas não duplicam pagamento nem estendem o período em dobro", async () => {
    const u = await createUser(`i${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    const pay = `pay_${uniq()}`;
    await checkout(u, pre);
    await payment(pre, pay, "approved", "2026-10-01T12:00:00Z", "2026-11-01T12:00:00Z");
    expect(await payment(pre, pay, "approved", "2026-10-01T12:00:00Z", "2026-11-01T12:00:00Z")).toEqual({ applied: false, reason: "duplicate" });
    expect(await subStatus(pre, "active")).toMatchObject({ applied: true });
    expect(await subStatus(pre, "active")).toEqual({ applied: false, reason: "unchanged" });
    const r = await db.query("select count(*)::int as n, max(period_end)::text as e from public.billing_payments where provider_payment_id = $1", [pay]);
    expect(r.rows[0].n).toBe(1);
    const s = await db.query("select current_period_end::text as e from public.subscriptions where provider_subscription_id = $1", [pre]);
    expect(new Date(s.rows[0].e).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("notificação de assinatura desconhecida é ignorada", async () => {
    expect(await subStatus("pre_inexistente", "active")).toEqual({ applied: false, reason: "unknown_subscription" });
    expect(await payment("pre_inexistente", "x", "approved")).toEqual({ applied: false, reason: "unknown_subscription" });
  });

  it("pagamento recusado: fica em atraso mas mantém o acesso até o fim do período já pago", async () => {
    const u = await createUser(`r${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    await checkout(u, pre);
    await payment(pre, `pay_${uniq()}`, "approved");
    await payment(pre, `pay_${uniq()}`, "rejected");
    const s = await db.query("select status from public.subscriptions where provider_subscription_id = $1", [pre]);
    expect(s.rows[0].status).toBe("past_due");
    expect(await plan(u)).toBe("pro");
    // nova tentativa aprovada → volta a ativa
    await payment(pre, `pay_${uniq()}`, "approved");
    expect((await db.query("select status from public.subscriptions where provider_subscription_id = $1", [pre])).rows[0].status).toBe("active");
  });

  it("primeiro pagamento recusado não libera o Pro", async () => {
    const u = await createUser(`rr${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    await checkout(u, pre);
    await payment(pre, `pay_${uniq()}`, "rejected");
    expect(await plan(u)).toBe("free");
  });

  it("cancelamento mantém o Pro até o fim do período pago e depois volta ao Grátis", async () => {
    const u = await createUser(`x${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    await checkout(u, pre);
    await payment(pre, `pay_${uniq()}`, "approved");
    await subStatus(pre, "canceled");
    expect(await plan(u)).toBe("pro");
    const s = await db.query("select status, canceled_at is not null as c from public.subscriptions where provider_subscription_id = $1", [pre]);
    expect(s.rows[0]).toEqual({ status: "canceled", c: true });
    await db.query("update public.subscriptions set current_period_end = now() - interval '1 minute' where provider_subscription_id = $1", [pre]);
    expect(await plan(u)).toBe("free");
    // pode assinar de novo
    await checkout(u, `pre_${uniq()}`);
  });

  it("estorno remove o período liberado por aquele pagamento", async () => {
    const u = await createUser(`e${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    const pay = `pay_${uniq()}`;
    await checkout(u, pre);
    await payment(pre, pay, "approved");
    expect(await plan(u)).toBe("pro");
    await asServer((q) => q("select public.billing_record_payment('mercadopago', $1, $2, 1990, 'refunded', null, null, null)", [pre, pay]));
    expect(await plan(u)).toBe("free");
  });

  it("não permite duas assinaturas em andamento para o mesmo usuário", async () => {
    const u = await createUser(`dup${uniq()}@t.local`);
    const pre = `pre_${uniq()}`;
    await checkout(u, pre);
    await payment(pre, `pay_${uniq()}`, "approved");
    await expect(checkout(u, `pre_${uniq()}`)).rejects.toThrow(/subscriptions_one_open_per_user/);
  });

  it("checkout abandonado é substituído pelo novo", async () => {
    const u = await createUser(`ab${uniq()}@t.local`);
    await checkout(u, `pre_${uniq()}`);
    await checkout(u, `pre_${uniq()}`);
    const r = await db.query("select status from public.subscriptions where user_id = $1 order by created_at", [u]);
    expect(r.rows.map((x) => x.status)).toEqual(["expired", "pending"]);
  });

  it("usuário não executa funções de cobrança nem lê webhooks/admins", async () => {
    const u = await createUser(`h${uniq()}@t.local`);
    await expect(asUser(u, (q) => q("select public.billing_record_payment('mercadopago', 'p', 'x', 1, 'approved', null, now(), null)"))).rejects.toThrow(/permission denied/);
    await expect(asUser(u, (q) => q("select public.billing_register_checkout($1, 'mercadopago', 'p', 1, null)", [u]))).rejects.toThrow(/permission denied/);
    await expect(asUser(u, (q) => q("select * from public.webhook_events"))).rejects.toThrow(/permission denied/);
    await expect(asUser(u, (q) => q("select * from public.admins"))).rejects.toThrow(/permission denied/);
    await expect(asUser(u, (q) => q("insert into public.admins (user_id) values ($1)", [u]))).rejects.toThrow(/permission denied/);
  });

  describe("teste gratuito do Pro", () => {
    it("desativado por padrão", async () => {
      const u = await createUser(`t${uniq()}@t.local`);
      await expect(asUser(u, (q) => q("select public.start_pro_trial()"))).rejects.toThrow(/TRIAL_DISABLED/);
    });
    it("quando habilitado: libera o Pro por N dias, uma vez só, sem cobrança, e expira sozinho", async () => {
      await db.query("update public.app_settings set value = '{\"enabled\": true, \"days\": 7, \"requires_card\": false}' where key = 'pro_trial'");
      try {
        const u = await createUser(`t${uniq()}@t.local`);
        const r = await asUser(u, async (q) => (await q("select public.start_pro_trial() as r")).rows[0].r as { days: number });
        expect(r.days).toBe(7);
        expect(await plan(u)).toBe("pro");
        await expect(asUser(u, (q) => q("select public.start_pro_trial()"))).rejects.toThrow(/TRIAL_NOT_ELIGIBLE/);
        const pays = await db.query("select count(*)::int as n from public.billing_payments where user_id = $1", [u]);
        expect(pays.rows[0].n).toBe(0);
        await db.query("update public.subscriptions set current_period_end = now() - interval '1 second' where user_id = $1", [u]);
        expect(await plan(u)).toBe("free");
        // quem já assinou não pode fazer teste
        const paid = await createUser(`tp${uniq()}@t.local`);
        const pre = `pre_${uniq()}`;
        await checkout(paid, pre);
        await payment(pre, `pay_${uniq()}`, "approved");
        await expect(asUser(paid, (q) => q("select public.start_pro_trial()"))).rejects.toThrow(/TRIAL_NOT_ELIGIBLE/);
      } finally {
        await db.query("update public.app_settings set value = '{\"enabled\": false, \"days\": 7, \"requires_card\": false}' where key = 'pro_trial'");
      }
    });
  });

  describe("painel administrativo", () => {
    let admin: string;
    let common: string;
    beforeAll(async () => {
      admin = await createUser(`adm${uniq()}@t.local`);
      common = await createUser(`com${uniq()}@t.local`);
      await db.query("insert into public.admins (user_id) values ($1)", [admin]);
    });

    it("usuário comum não acessa nenhuma função administrativa", async () => {
      for (const sql of [
        "select public.admin_metrics()",
        "select public.admin_logs(10)",
        "select public.admin_set_trial(true, 7)",
        "select public.admin_update_plan('pro', 1, null, null, null, 20, 'month', array['debts'])",
        "select * from public.admin_list_promotions()",
      ]) {
        await expect(asUser(common, (q) => q(sql)), sql).rejects.toThrow(/ADMIN_ONLY/);
      }
      expect(await asUser(common, async (q) => (await q("select public.is_admin() as a")).rows[0].a)).toBe(false);
    });

    it("métricas separam faturamento confirmado do projetado e não expõem dados de clientes", async () => {
      const m = await asUser(admin, async (q) => (await q("select public.admin_metrics() as m")).rows[0].m as Record<string, unknown>);
      expect(Number(m.revenue_confirmed_month_cents)).toBeGreaterThan(0);
      expect(m).toHaveProperty("mrr_projected_cents");
      expect(m.users_total as number).toBeGreaterThan(0);
      const json = JSON.stringify(m);
      expect(json).not.toMatch(/@t\.local|[0-9a-f]{8}-[0-9a-f]{4}-/);
      // admin continua sem acesso aos dados financeiros dos clientes
      const tx = await asUser(admin, async (q) => (await q("select count(*)::int as n from public.transactions")).rows[0].n);
      expect(tx).toBe(0);
    });

    it("altera preço/limites de IA sem mexer no código, com auditoria", async () => {
      await asUser(admin, (q) => q("select public.admin_update_plan('pro', 1990, null, null, null, 25, 'month', (select features from public.plans where id = 'pro'))"));
      expect((await db.query("select ai_analyses_limit from public.plans where id = 'pro'")).rows[0].ai_analyses_limit).toBe(25);
      const log = await db.query("select action, target from public.admin_audit_log where admin_id = $1", [admin]);
      expect(log.rows).toContainEqual({ action: "update_plan", target: "pro" });
      await db.query("update public.plans set ai_analyses_limit = 20 where id = 'pro'");
    });

    it("promoção só vale dentro do prazo real", async () => {
      const id = await asUser(admin, async (q) => (await q(
        "select public.admin_save_promotion(null, 'Lançamento', null, 1490, now() - interval '1 day', now() + interval '1 day', true) as id",
      )).rows[0].id as string);
      const price = await asUser(common, async (q) => (await q("select public.current_price('pro') as p")).rows[0].p as { price_cents: number; regular_price_cents: number });
      expect(price).toMatchObject({ price_cents: 1490, regular_price_cents: 1990 });
      await asUser(admin, (q) => q("select public.admin_save_promotion($1, 'Lançamento', null, 1490, now() - interval '2 days', now() - interval '1 day', true)", [id]));
      const after = await asUser(common, async (q) => (await q("select public.current_price('pro') as p")).rows[0].p as { price_cents: number });
      expect(after.price_cents).toBe(1990);
    });
  });
});
