"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authedClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { billingEnabled, getBillingProvider } from "@/lib/billing";
import { getMySubscription, hasPaidAccess, syncSubscriptionFromProvider } from "@/lib/subscription";
import { siteUrl } from "@/lib/env";
import { flushBillingEmails } from "@/lib/email/run";
import type { ActionState } from "@/lib/types";

/** Inicia o checkout no Mercado Pago. O Pro só é liberado depois do pagamento aprovado (webhook). */
export async function startCheckout(): Promise<ActionState> {
  if (!billingEnabled()) return { error: "A assinatura ainda não está disponível. Nenhuma cobrança foi feita." };
  const { supabase, user } = await authedClient();
  if (!user.email) return { error: "Sua conta precisa de um e-mail confirmado." };

  const current = await getMySubscription();
  if (current && hasPaidAccess(current) && current.provider !== "trial" && ["active", "past_due", "paused"].includes(current.status)) {
    return { error: "Você já tem uma assinatura ativa." };
  }

  const { data: price } = await supabase.rpc("current_price", { p_plan: "pro" });
  const p = price as { price_cents: number; promotion_id: string | null };
  if (!p || p.price_cents <= 0) return { error: "Preço do plano indisponível." };

  let checkoutUrl: string | null;
  try {
    const provider = getBillingProvider();
    const sub = await provider.createSubscription({
      userId: user.id,
      payerEmail: user.email,
      reason: "Controle Fácil Pro — assinatura mensal",
      amountCents: p.price_cents,
      backUrl: `${siteUrl()}/app/assinatura/retorno`,
    });
    const admin = createAdminClient();
    const { error } = await admin.rpc("billing_register_checkout", {
      p_user: user.id, p_provider: provider.id, p_provider_subscription_id: sub.id,
      p_price_cents: p.price_cents, p_promotion_id: p.promotion_id,
    });
    if (error) return { error: "Não foi possível iniciar a assinatura. Tente novamente." };
    checkoutUrl = sub.checkoutUrl;
  } catch {
    return { error: "O serviço de pagamento não respondeu. Tente novamente em instantes." };
  }
  if (!checkoutUrl) return { error: "O serviço de pagamento não retornou o link de pagamento." };
  redirect(checkoutUrl);
}

/** Consulta o status diretamente no provedor (não confia no retorno do navegador). */
export async function refreshSubscription(): Promise<ActionState> {
  const r = await syncSubscriptionFromProvider();
  revalidatePath("/app", "layout");
  return r;
}

export async function cancelSubscription(): Promise<ActionState> {
  await authedClient();
  const sub = await getMySubscription();
  if (!sub?.provider_subscription_id || !["active", "past_due", "paused", "pending"].includes(sub.status)) {
    return { error: "Não há assinatura ativa para cancelar." };
  }
  try {
    const provider = getBillingProvider();
    const remote = await provider.setSubscriptionStatus(sub.provider_subscription_id, "canceled");
    const admin = createAdminClient();
    await admin.rpc("billing_apply_subscription_status", {
      p_provider: provider.id, p_provider_subscription_id: remote.id, p_status: remote.status,
      p_provider_status: remote.providerStatus.slice(0, 40), p_next_charge_at: null,
    });
    await admin.rpc("billing_mark_cancel_requested", { p_subscription: sub.id });
    after(() => flushBillingEmails().catch(() => undefined));
  } catch {
    return { error: "Não foi possível cancelar agora. Tente novamente em instantes ou fale com o suporte." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Assinatura cancelada. Você continua com o Pro até o fim do período já pago." };
}

/** Reativar: assinatura pausada volta a ser cobrada; cancelada precisa de nova contratação. */
export async function reactivateSubscription(): Promise<ActionState> {
  await authedClient();
  const sub = await getMySubscription();
  if (sub?.status === "paused" && sub.provider_subscription_id) {
    try {
      const provider = getBillingProvider();
      const remote = await provider.setSubscriptionStatus(sub.provider_subscription_id, "active");
      const admin = createAdminClient();
      await admin.rpc("billing_apply_subscription_status", {
        p_provider: provider.id, p_provider_subscription_id: remote.id, p_status: remote.status,
        p_provider_status: remote.providerStatus.slice(0, 40), p_next_charge_at: remote.nextChargeAt,
      });
    } catch {
      return { error: "Não foi possível reativar agora. Tente novamente." };
    }
    revalidatePath("/app", "layout");
    return { ok: true, message: "Assinatura reativada." };
  }
  return startCheckout();
}

export async function startTrial(): Promise<ActionState> {
  const { supabase } = await authedClient();
  const { error } = await supabase.rpc("start_pro_trial");
  if (error) {
    if (error.message.includes("TRIAL_DISABLED")) return { error: "O teste gratuito não está disponível no momento." };
    if (error.message.includes("TRIAL_NOT_ELIGIBLE")) return { error: "O teste gratuito é oferecido uma única vez por conta." };
    return { error: "Não foi possível iniciar o teste." };
  }
  revalidatePath("/app", "layout");
  redirect("/app/assinatura?teste=1");
}
