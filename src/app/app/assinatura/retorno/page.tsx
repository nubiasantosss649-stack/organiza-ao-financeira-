import type { Metadata } from "next";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getMySubscription, hasPaidAccess, syncSubscriptionFromProvider } from "@/lib/subscription";

export const metadata: Metadata = { title: "Confirmando pagamento" };

/**
 * Retorno do checkout. NÃO ativa nada: apenas consulta o status no servidor do
 * provedor. O Pro só é liberado quando o pagamento aprovado é confirmado.
 */
export default async function ReturnPage() {
  await syncSubscriptionFromProvider();
  const sub = await getMySubscription();
  const active = sub && sub.provider !== "trial" && hasPaidAccess(sub) && ["active", "past_due"].includes(sub.status);
  return (
    <div className="mx-auto max-w-lg">
      <Card className="p-6 text-center">
        {active ? (
          <>
            <h1 className="text-xl font-bold">Pagamento confirmado! 🎉</h1>
            <p className="mt-2 text-sm text-slate-600">Seu Controle Fácil Pro já está ativo.</p>
            <Link href="/app" className="mt-5 inline-block rounded-xl bg-money-500 px-5 py-2.5 font-semibold text-white">Ir para o painel</Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-navy-600" aria-hidden />
            <h1 className="mt-3 text-xl font-bold">Estamos confirmando seu pagamento</h1>
            <p className="mt-2 text-sm text-slate-600">
              Assim que o Mercado Pago aprovar o pagamento, o Pro é liberado automaticamente. Isso costuma levar poucos minutos.
            </p>
            <div className="mt-5 flex justify-center gap-3 text-sm font-semibold">
              <Link href="/app/assinatura/retorno" className="text-navy-600 hover:underline">Verificar novamente</Link>
              <Link href="/app/assinatura" className="text-navy-600 hover:underline">Minha assinatura</Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
