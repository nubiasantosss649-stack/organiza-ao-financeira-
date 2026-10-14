import { renderEmail, type EmailKind } from "./templates";
import type { SendMail } from "./transport";

interface OutboxRow {
  id: number;
  user_id: string;
  kind: EmailKind;
  payload: Record<string, unknown>;
}

export interface OutboxDeps {
  claim: (limit: number) => Promise<OutboxRow[]>;
  mark: (id: number, status: "sent" | "skipped" | "retry", error: string | null) => Promise<void>;
  /** E-mail e nome atuais do usuário (busca no momento do envio; nada é guardado na fila). */
  recipient: (userId: string) => Promise<{ email: string | null; name: string | null } | null>;
  send: SendMail;
  siteUrl: string;
  supportEmail: string;
}

/** Envia os e-mails pendentes da fila. Falhas temporárias voltam para a fila com espera crescente. */
export async function processOutbox(deps: OutboxDeps, limit = 20): Promise<{ sent: number; skipped: number; retried: number }> {
  const rows = await deps.claim(limit);
  const result = { sent: 0, skipped: 0, retried: 0 };
  for (const row of rows) {
    const who = await deps.recipient(row.user_id).catch(() => undefined);
    if (who === undefined) {
      await deps.mark(row.id, "retry", "recipient_lookup_failed");
      result.retried++;
      continue;
    }
    if (!who?.email) {
      await deps.mark(row.id, "skipped", "no_email");
      result.skipped++;
      continue;
    }
    try {
      const mail = renderEmail(row.kind, row.payload ?? {}, { name: who.name, siteUrl: deps.siteUrl, supportEmail: deps.supportEmail });
      await deps.send({ to: who.email, ...mail });
      await deps.mark(row.id, "sent", null);
      result.sent++;
    } catch (e) {
      // Registra só o tipo do erro (sem endereço de e-mail ou conteúdo).
      const code = e instanceof Error ? (e as Error & { code?: string }).code ?? e.name : "error";
      await deps.mark(row.id, "retry", String(code).slice(0, 80));
      result.retried++;
    }
  }
  return result;
}
