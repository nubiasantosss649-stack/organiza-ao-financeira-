import type { Metadata } from "next";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Logs" };

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default async function AdminLogsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_logs", { p_limit: 100 });
  const logs = (data ?? { webhooks: [], subscription_events: [], admin_actions: [] }) as {
    webhooks: Array<{ provider: string; topic: string | null; status: string; error: string | null; received_at: string; processed_at: string | null }>;
    subscription_events: Array<{ event_type: string; from_status: string | null; to_status: string | null; created_at: string }>;
    admin_actions: Array<{ action: string; target: string | null; details: Record<string, unknown>; created_at: string }>;
  };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logs operacionais</h1>
      <p className="text-sm text-slate-500">Sem dados pessoais nem financeiros dos clientes: apenas o que aconteceu e quando.</p>
      <Card>
        <CardHeader title="Notificações de pagamento (webhooks)" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1.5">Recebida</th><th>Tópico</th><th>Status</th><th>Detalhe</th></tr></thead>
            <tbody>
              {logs.webhooks.map((w, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5">{dt(w.received_at)}</td>
                  <td>{w.topic ?? "—"}</td>
                  <td><Badge tone={w.status === "processed" ? "money" : w.status === "failed" || w.status === "invalid_signature" ? "danger" : "neutral"}>{w.status}</Badge></td>
                  <td className="text-xs text-slate-500">{w.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.webhooks.length === 0 ? <p className="py-3 text-sm text-slate-500">Nenhuma notificação recebida.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader title="Eventos de assinaturas" />
        <ul className="divide-y divide-slate-100 text-sm">
          {logs.subscription_events.map((e, i) => (
            <li key={i} className="flex justify-between gap-2 py-1.5"><span>{e.event_type}{e.to_status ? ` → ${e.to_status}` : ""}</span><span className="text-xs text-slate-500">{dt(e.created_at)}</span></li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Ações de administradores" />
        <ul className="divide-y divide-slate-100 text-sm">
          {logs.admin_actions.map((a, i) => (
            <li key={i} className="py-1.5"><span className="font-medium">{a.action}</span> {a.target} <span className="text-xs text-slate-500">· {dt(a.created_at)}</span>
              <code className="mt-0.5 block truncate text-[11px] text-slate-500">{JSON.stringify(a.details)}</code></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
