"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Sem dados financeiros no log: apenas o identificador do erro.
    console.error("Erro na área logada", error.digest ?? "");
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="card mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">{offline ? "Você está sem conexão" : "Algo deu errado"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {offline
          ? "Conecte-se à internet para ver e salvar seus dados."
          : "Não foi possível carregar esta página. Seus dados estão seguros. Tente novamente em instantes."}
      </p>
      <Button className="mt-4" onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
