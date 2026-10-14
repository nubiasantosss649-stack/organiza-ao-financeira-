import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Sem conexão", robots: { index: false } };

/** Página exibida pelo service worker quando não há internet. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-navy-900 px-6 text-center text-white">
      <Logo inverted />
      <WifiOff className="h-10 w-10 text-money-400" aria-hidden />
      <h1 className="text-2xl font-bold">Você está sem conexão</h1>
      <p className="max-w-sm text-navy-100">
        O Controle Fácil precisa de internet para mostrar e salvar seus dados com segurança. Assim que a conexão voltar, é só tentar de novo.
      </p>
      <a href="/app" className="rounded-xl bg-money-500 px-5 py-2.5 font-semibold text-white">Tentar novamente</a>
    </main>
  );
}
