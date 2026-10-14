"use client";

import { useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";
import { askAssistant } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface Props {
  presets: Array<{ id: string; label: string }>;
  canChat: boolean;
  remaining: number | null;
  available: boolean;
}

interface Exchange { question: string; answer?: string; error?: string }

export function Assistant({ presets, canChat, remaining: initialRemaining, available }: Props) {
  const [history, setHistory] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState("");
  const [remaining, setRemaining] = useState(initialRemaining);
  const [pending, start] = useTransition();
  const blocked = !available || (remaining !== null && remaining <= 0);

  function ask(req: { kind: "preset"; presetId: string; label: string } | { kind: "chat"; question: string }) {
    const label = req.kind === "preset" ? req.label : req.question;
    setHistory((h) => [...h, { question: label }]);
    start(async () => {
      const res = await askAssistant(req.kind === "preset" ? { kind: "preset", presetId: req.presetId } : { kind: "chat", question: req.question });
      setHistory((h) => h.map((x, i) => (i === h.length - 1 ? (res.ok ? { ...x, answer: res.text } : { ...x, error: res.error }) : x)));
      if (res.ok && res.limit !== null) setRemaining(res.limit - res.used);
      if (!res.ok && res.code === "limit") setRemaining(0);
    });
  }

  return (
    <div className="space-y-4">
      {!available ? <Alert tone="warning">O assistente está temporariamente indisponível. Nenhuma análise será descontada.</Alert> : null}
      <div>
        <p className="mb-2 text-sm font-semibold">Análises prontas</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={pending || blocked}
              onClick={() => ask({ kind: "preset", presetId: p.id, label: p.label })}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-navy-900 hover:border-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {history.map((x, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-navy-900 px-3.5 py-2 text-sm text-white">{x.question}</p>
            <div className="flex gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-money-400"><Bot className="h-4 w-4" aria-hidden /></span>
              <div className={cn("max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm", x.error ? "bg-danger-50 text-danger-700" : "bg-white shadow-sm ring-1 ring-slate-200")}>
                {x.answer ?? x.error ?? <span className="animate-pulse text-slate-500">Analisando seus dados…</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {canChat ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const q = question.trim();
            if (q.length < 3) return;
            setQuestion("");
            ask({ kind: "chat", question: q });
          }}
        >
          <label htmlFor="ai-q" className="sr-only">Sua pergunta</label>
          <input id="ai-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} disabled={pending || blocked}
            placeholder="Pergunte sobre seus gastos, metas ou dívidas…" className="input" />
          <Button type="submit" disabled={pending || blocked || question.trim().length < 3} aria-label="Enviar pergunta"><Send className="h-4 w-4" /></Button>
        </form>
      ) : null}
    </div>
  );
}
