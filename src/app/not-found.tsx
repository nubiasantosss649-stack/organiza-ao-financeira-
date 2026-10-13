import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-slate-600">O endereço pode estar incorreto ou o item foi removido.</p>
      <Link href="/app" className="font-semibold text-navy-600 hover:underline">Voltar ao início</Link>
    </main>
  );
}
