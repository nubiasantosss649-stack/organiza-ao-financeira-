/** Status internos de assinatura e cobrança. */
export type SubscriptionStatus = "pending" | "active" | "past_due" | "paused" | "canceled";
export type PaymentStatus = "approved" | "rejected" | "pending" | "refunded" | "cancelled";

export interface ProviderSubscription {
  id: string;
  status: SubscriptionStatus;
  providerStatus: string;
  externalReference: string | null;
  nextChargeAt: string | null;
  amountCents: number | null;
  checkoutUrl: string | null;
}

export interface ProviderPayment {
  id: string;
  subscriptionId: string;
  status: PaymentStatus;
  statusDetail: string | null;
  amountCents: number;
  paidAt: string | null;
}

/**
 * Contrato do provedor de pagamentos. A implementação real é o Mercado Pago;
 * trocar de provedor (ex.: Stripe, Pagar.me) significa implementar esta interface.
 */
export interface BillingProvider {
  readonly id: string;
  createSubscription(input: {
    userId: string;
    payerEmail: string;
    reason: string;
    amountCents: number;
    backUrl: string;
  }): Promise<ProviderSubscription>;
  getSubscription(id: string): Promise<ProviderSubscription>;
  setSubscriptionStatus(id: string, status: "paused" | "canceled" | "active"): Promise<ProviderSubscription>;
  getPayment(id: string): Promise<ProviderPayment>;
}
