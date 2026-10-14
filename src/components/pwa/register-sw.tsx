"use client";

import { useEffect } from "react";

/** Registra o service worker em produção (não interfere no desenvolvimento). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sem service worker o app continua funcionando normalmente.
    });
  }, []);
  return null;
}
