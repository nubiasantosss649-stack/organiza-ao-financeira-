import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getBillingProvider, webhookSecret } from "@/lib/billing";
import { verifyWebhookSignature } from "@/lib/billing/signature";
import { normalizeTopic, processNotification } from "@/lib/billing/process";
import { flushBillingEmails } from "@/lib/email/run";

/**
 * Webhook do Mercado Pago.
 * 1) valida a assinatura (x-signature) com a chave secreta;
 * 2) registra a notificação (idempotência por x-request-id);
 * 3) consulta o recurso no Mercado Pago e aplica no banco (funções idempotentes).
 * Responde 200 rapidamente para notificações já tratadas ou irrelevantes.
 */
export async function POST(request: NextRequest) {
  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const url = request.nextUrl;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // corpo vazio ou inválido: usa só a query string
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  const dataId = (url.searchParams.get("data.id") ?? (typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : null))?.slice(0, 120) ?? null;
  const topic = (url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (typeof body.type === "string" ? body.type : null))?.slice(0, 60) ?? null;
  const requestId = request.headers.get("x-request-id")?.slice(0, 120) ?? null;

  const admin = createAdminClient();
  const valid = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId,
    dataId,
    secret,
  });
  if (!valid || !requestId || !dataId) {
    // Registra tentativas inválidas para auditoria, com teto para não permitir encher o banco.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "invalid_signature")
      .gte("received_at", since);
    if ((count ?? 0) < 50) {
      await admin.from("webhook_events").insert({
        provider: "mercadopago",
        request_id: `invalid-${crypto.randomUUID()}`,
        topic,
        status: "invalid_signature",
      });
    }
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Idempotência: a mesma entrega (x-request-id) só é processada uma vez.
  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({ provider: "mercadopago", request_id: requestId, topic, resource_id: dataId })
    .select("id")
    .maybeSingle();
  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }

  if (!normalizeTopic(topic)) {
    await admin.from("webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", inserted!.id);
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const result = await processNotification(topic, dataId, getBillingProvider(), async (fn, args) => { const r = await admin.rpc(fn, args); return { data: r.data, error: r.error }; });
    await admin.from("webhook_events")
      .update({ status: result.status, error: result.detail.slice(0, 200), processed_at: new Date().toISOString() })
      .eq("id", inserted!.id);
    // E-mails de cobrança (recibo, falha, cancelamento) saem depois da resposta;
    // se falharem, o cron /api/cron/emails tenta de novo.
    after(() => flushBillingEmails().catch(() => undefined));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "erro";
    await admin.from("webhook_events").update({ status: "failed", error: message, processed_at: new Date().toISOString() }).eq("id", inserted!.id);
    // Remove o registro para permitir que a nova tentativa do provedor reprocesse.
    await admin.from("webhook_events").update({ request_id: `failed-${requestId}-${Date.now()}` }).eq("id", inserted!.id);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
