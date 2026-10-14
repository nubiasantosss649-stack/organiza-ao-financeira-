import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validação da notificação (webhook) do Mercado Pago.
 * Cabeçalho `x-signature`: "ts=<timestamp>,v1=<hmac hex>"; cabeçalho `x-request-id`.
 * Manifesto assinado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * HMAC-SHA256 com a "assinatura secreta" da aplicação.
 * (Formato conforme a documentação de Webhooks do Mercado Pago — confirmar no sandbox.)
 */
export function parseSignatureHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k?.trim().toLowerCase(), v.join("=").trim()];
    }),
  );
  if (!parts.ts || !parts.v1 || !/^\d{1,20}$/.test(parts.ts) || !/^[0-9a-f]{64}$/i.test(parts.v1)) return null;
  return { ts: parts.ts, v1: parts.v1.toLowerCase() };
}

export function buildManifest(dataId: string | null, requestId: string | null, ts: string): string {
  let manifest = "";
  // Ids alfanuméricos devem ir em minúsculas no manifesto.
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

export function verifyWebhookSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const sig = parseSignatureHeader(params.signatureHeader);
  if (!sig || !params.secret) return false;
  const expected = createHmac("sha256", params.secret)
    .update(buildManifest(params.dataId, params.requestId, sig.ts))
    .digest();
  const received = Buffer.from(sig.v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
