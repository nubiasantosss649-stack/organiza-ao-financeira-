import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Confirme seu e-mail" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/cadastro/verifique-email">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email.slice(0, 254) : "";
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 w-fit rounded-2xl bg-money-50 p-3 text-money-600"><MailCheck className="h-7 w-7" aria-hidden /></div>
      <h1 className="text-xl font-bold text-navy-900">Confirme seu e-mail</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enviamos um link de confirmação{email ? <> para <strong className="break-all">{email}</strong></> : null}.
        Abra o e-mail e clique no link para ativar sua conta.
      </p>
      <p className="mt-2 text-xs text-slate-500">Não encontrou? Verifique a pasta de spam ou promoções.</p>
      {email ? <div className="mt-6"><ResendForm email={email} /></div> : null}
      <Link href="/entrar" className="mt-6 inline-block text-sm font-semibold text-navy-600 hover:underline">Voltar para o login</Link>
    </div>
  );
}
