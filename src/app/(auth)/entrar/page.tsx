import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";
import { safeNext } from "@/lib/redirect";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  return (
    <>
      <h1 className="text-xl font-bold text-navy-900">Bem-vindo de volta</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Entre para acompanhar suas finanças.</p>
      <SignInForm next={next} />
      <p className="mt-6 text-center text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-money-600 hover:underline">Criar conta grátis</Link>
      </p>
    </>
  );
}
