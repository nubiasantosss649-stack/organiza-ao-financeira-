import "server-only";
import { MercadoPagoProvider } from "./mercadopago";
import type { BillingProvider } from "./types";

/** Checkout só fica disponível com a flag explícita E as credenciais configuradas. */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true" && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

export function getBillingProvider(): BillingProvider {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  return new MercadoPagoProvider(token, process.env.MERCADOPAGO_API_URL || "https://api.mercadopago.com");
}

export function webhookSecret(): string | null {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET || null;
}
