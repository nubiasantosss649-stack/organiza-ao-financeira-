"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Aviso honesto de conexão: o app precisa de internet para salvar e consultar dados. */
export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="sticky top-14 z-20 flex items-center justify-center gap-2 bg-warning-100 px-4 py-2 text-sm font-medium text-warning-700 lg:top-0">
      <WifiOff className="h-4 w-4" aria-hidden />
      Sem conexão. Seus dados aparecem quando a internet voltar; nada é salvo enquanto estiver offline.
    </div>
  );
}
