import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Criar conta grátis" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-navy-900">Crie sua conta grátis</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Plano Grátis sem prazo de expiração. Não pedimos cartão de crédito.
      </p>
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-slate-600">
        Já tem conta? <Link href="/entrar" className="font-semibold text-navy-600 hover:underline">Entrar</Link>
      </p>
    </>
  );
}
