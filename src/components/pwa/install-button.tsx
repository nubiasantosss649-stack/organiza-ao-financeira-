"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { cn } from "@/lib/cn";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noop = () => () => {};
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Botão "Instalar app": usa o prompt nativo (Android/Chrome/Edge) e, no iPhone,
 * mostra o passo a passo (Compartilhar → Adicionar à Tela de Início).
 */
export function InstallAppButton({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const standalone = useSyncExternalStore(noop, isStandalone, () => true);
  const ios = useSyncExternalStore(noop, isIOS, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || (!promptEvent && !ios)) return null;

  const base = tone === "dark"
    ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
    : "border-slate-300 bg-white text-navy-900 hover:bg-slate-50";

  return (
    <div className={className}>
      <button
        type="button"
        className={cn("inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold", base)}
        onClick={async () => {
          if (promptEvent) {
            await promptEvent.prompt();
            setPromptEvent(null);
          } else {
            setShowIOS((v) => !v);
          }
        }}
      >
        <Download className="h-4 w-4" aria-hidden /> Instalar app
      </button>
      {showIOS ? (
        <p className={cn("mt-2 max-w-xs rounded-xl p-3 text-xs", tone === "dark" ? "bg-white/10 text-navy-100" : "bg-navy-50 text-slate-700")} role="status">
          No iPhone: toque em <Share className="inline h-3.5 w-3.5" aria-label="Compartilhar" /> <strong>Compartilhar</strong> no Safari e depois em
          <strong> Adicionar à Tela de Início</strong>.
        </p>
      ) : null}
    </div>
  );
}
