import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { SUPPORT_EMAIL } from "@/lib/site";
import { processOutbox } from "./outbox";
import { isEmailConfigured, smtpSender } from "./transport";

/** Envia os e-mails de cobrança pendentes. Seguro para chamar várias vezes. */
export async function flushBillingEmails(limit = 20) {
  if (!isEmailConfigured()) return { sent: 0, skipped: 0, retried: 0, configured: false };
  const admin = createAdminClient();
  const r = await processOutbox({
    claim: async (n) => {
      const { data, error } = await admin.rpc("email_claim_batch", { p_limit: n });
      if (error) throw new Error("claim_failed");
      return data ?? [];
    },
    mark: async (id, status, error) => {
      await admin.rpc("email_mark", { p_id: id, p_status: status, p_error: error });
    },
    recipient: async (userId) => {
      const [{ data: u, error }, { data: p }] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      if (error && error.status !== 404) throw error;
      if (!u?.user) return null;
      return { email: u.user.email ?? null, name: p?.full_name ?? null };
    },
    send: smtpSender(),
    siteUrl: siteUrl(),
    supportEmail: SUPPORT_EMAIL,
  }, limit);
  return { ...r, configured: true };
}
