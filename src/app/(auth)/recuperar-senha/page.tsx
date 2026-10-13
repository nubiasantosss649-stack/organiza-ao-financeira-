import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-navy-900">Recuperar senha</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm"><Link href="/entrar" className="font-semibold text-navy-600 hover:underline">Voltar para o login</Link></p>
    </>
  );
}
