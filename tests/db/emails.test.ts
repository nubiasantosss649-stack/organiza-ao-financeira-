/**
 * Fila de e-mails de cobrança: enfileiramento pelos eventos, deduplicação,
 * trava de envio, reenvio com espera e permissões.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
let db: Client;
let n = 0;
const uniq = () => `${Date.now()}${n++}`;

async function createUser(): Promise<string> {
  const { rows } = await db.query("insert into auth.users (email) values ($1) returning id", [`e${uniq()}@t.local`]);
  return rows[0].id;
}
async function asRole<T>(role: string, uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    if (uid) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role })]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r.rows as T[];
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
const server = <T>(sql: string, params: unknown[] = []) => asRole<T>("service_role", null, sql, params);
const outbox = async (uid: string) =>
  (await db.query("select kind, dedupe_key, payload, status from public.email_outbox where user_id = $1 order by id", [uid])).rows;

async function paidSubscription(uid: string) {
  const pre = `pre_${uniq()}`;
  await server("select public.billing_register_checkout($1, 'mercadopago', $2, 1990, null)", [uid, pre]);
  await server("select public.billing_apply_subscription_status('mercadopago', $1, 'active', 'authorized', null)", [pre]);
  await server("select public.billing_record_payment('mercadopago', $1, $2, 1990, 'approved', null, now(), null)", [pre, `pay_${uniq()}`]);
  return pre;
}

d("Banco — e-mails de cobrança", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("delete from public.email_outbox");
  });
  afterAll(async () => {
    await db?.end();
  });

  it("pagamento aprovado gera um recibo; repetir o webhook não duplica", async () => {
    const u = await createUser();
    const pre = `pre_${uniq()}`;
    const pay = `pay_${uniq()}`;
    await server("select public.billing_register_checkout($1, 'mercadopago', $2, 1990, null)", [u, pre]);
    expect(await outbox(u)).toEqual([]);
    for (let i = 0; i < 2; i++) {
      await server("select public.billing_record_payment('mercadopago', $1, $2, 1990, 'approved', null, now(), null)", [pre, pay]);
    }
    const rows = await outbox(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "payment_receipt", status: "pending", payload: { amount_cents: 1990 } });
    expect(rows[0].payload.period_end).toBeTruthy();
  });

  it("pagamento recusado gera aviso de falha com a data de acesso", async () => {
    const u = await createUser();
    const pre = await paidSubscription(u);
    await server("select public.billing_record_payment('mercadopago', $1, $2, 1990, 'rejected', 'cc_rejected_insufficient_amount', null, null)", [pre, `pay_${uniq()}`]);
    const rows = await outbox(u);
    expect(rows.map((r) => r.kind)).toEqual(["payment_receipt", "payment_failed"]);
    expect(rows[1].payload.access_until).toBeTruthy();
    expect(JSON.stringify(rows[1].payload)).not.toContain("cc_rejected");
  });

  it("cancelamento (pedido + confirmação do provedor) gera um único e-mail", async () => {
    const u = await createUser();
    const pre = await paidSubscription(u);
    const [{ id }] = await server<{ id: string }>("select id from public.subscriptions where provider_subscription_id = $1", [pre]);
    await server("select public.billing_apply_subscription_status('mercadopago', $1, 'canceled', 'cancelled', null)", [pre]);
    await server("select public.billing_mark_cancel_requested($1)", [id]);
    const rows = await outbox(u);
    expect(rows.filter((r) => r.kind === "subscription_canceled")).toHaveLength(1);
  });

  it("checkout abandonado cancelado pelo provedor não gera e-mail", async () => {
    const u = await createUser();
    const pre = `pre_${uniq()}`;
    await server("select public.billing_register_checkout($1, 'mercadopago', $2, 1990, null)", [u, pre]);
    await server("select public.billing_apply_subscription_status('mercadopago', $1, 'canceled', 'cancelled', null)", [pre]);
    expect(await outbox(u)).toEqual([]);
  });

  it("claim trava o lote; retry reagenda com espera e desiste após 6 tentativas", async () => {
    const u = await createUser();
    await paidSubscription(u);
    const claimed = await server<{ id: number; user_id: string; attempts: number }>("select id, user_id, attempts from public.email_claim_batch(100)");
    const mine = claimed.find((r) => r.user_id === u)!;
    expect(mine.attempts).toBe(1);
    // Já reservado: outro processo não pega o mesmo e-mail.
    expect((await server<{ id: number }>("select id from public.email_claim_batch(100)")).map((r) => r.id)).not.toContain(mine.id);

    await server("select public.email_mark($1, 'retry', 'ECONNECTION')", [mine.id]);
    let [row] = (await db.query("select status, last_error, next_attempt_at > now() + interval '1 minute' as later from public.email_outbox where id = $1", [mine.id])).rows;
    expect(row).toEqual({ status: "pending", last_error: "ECONNECTION", later: true });

    await db.query("update public.email_outbox set attempts = 6 where id = $1", [mine.id]);
    await server("select public.email_mark($1, 'retry', 'ECONNECTION')", [mine.id]);
    [row] = (await db.query("select status from public.email_outbox where id = $1", [mine.id])).rows;
    expect(row.status).toBe("failed");

    await db.query("update public.email_outbox set status = 'pending', attempts = 0, next_attempt_at = now() where id = $1", [mine.id]);
    await server("select public.email_claim_batch(100)");
    await server("select public.email_mark($1, 'sent', null)", [mine.id]);
    [row] = (await db.query("select status, sent_at is not null as has_sent from public.email_outbox where id = $1", [mine.id])).rows;
    expect(row).toEqual({ status: "sent", has_sent: true });
  });

  it("usuário não lê a fila nem chama as funções de envio; admin vê só contagens", async () => {
    const u = await createUser();
    await expect(asRole("authenticated", u, "select * from public.email_outbox")).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", u, "select public.email_claim_batch(1)")).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", u, "select public.email_mark(1, 'sent', null)")).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", u, "select public.admin_email_stats()")).rejects.toThrow();

    const admin = await createUser();
    await db.query("insert into public.admins (user_id) values ($1)", [admin]);
    const [{ s }] = await asRole<{ s: Record<string, number> }>("authenticated", admin, "select public.admin_email_stats() as s");
    expect(Object.keys(s).every((k) => ["pending", "sending", "sent", "failed", "skipped"].includes(k))).toBe(true);
  });
});
