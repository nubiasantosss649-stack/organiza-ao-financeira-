"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { confirmImport, previewImport, type PreviewRow } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/cn";

const MAX_BYTES = 1_000_000;

/** Lê o arquivo como UTF-8 e, se não for válido, como Windows-1252 (comum em OFX de bancos brasileiros). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

interface Option { id: string; name: string }
interface CategoryOption extends Option { kind: "income" | "expense" }

export function ImportWizard({ accounts, categories }: { accounts: Option[]; categories: CategoryOption[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Array<PreviewRow & { include: boolean }> | null>(null);
  const [format, setFormat] = useState<"csv" | "ofx">("csv");
  const [skipped, setSkipped] = useState<Array<{ line: number; reason: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, start] = useTransition();

  const selected = useMemo(() => rows?.filter((r) => r.include) ?? [], [rows]);
  const totals = useMemo(() => ({
    income: selected.filter((r) => r.kind === "income").reduce((a, r) => a + r.amountCents, 0),
    expense: selected.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amountCents, 0),
  }), [selected]);

  async function onFile(file: File | undefined) {
    setError(null);
    setDone(null);
    setRows(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("Arquivo maior que 1 MB. Exporte um período menor no seu banco.");
    if (!/\.(csv|ofx|txt)$/i.test(file.name)) return setError("Envie um arquivo .csv ou .ofx.");
    const content = await readText(file);
    setFileName(file.name);
    start(async () => {
      const res = await previewImport({ accountId, fileName: file.name, content });
      if (!res.ok) return setError(res.error);
      setFormat(res.format);
      setSkipped(res.skipped);
      setRows(res.rows.map((r) => ({ ...r, include: r.duplicate === null })));
    });
  }

  function update(index: number, patch: Partial<PreviewRow & { include: boolean }>) {
    setRows((prev) => prev?.map((r) => (r.index === index ? { ...r, ...patch } : r)) ?? null);
  }

  function confirm() {
    if (!rows) return;
    start(async () => {
      const res = await confirmImport({
        accountId, fileName, format, skippedCount: skipped.length,
        rows: selected.map((r) => ({
          date: r.date, description: r.description, amountCents: r.amountCents, kind: r.kind,
          categoryId: r.categoryId, occurrence: r.occurrence, externalId: r.externalId,
        })),
      });
      if (!res.ok) return setError(res.error);
      setDone({ imported: res.imported, skipped: res.skipped });
      setRows(null);
    });
  }

  if (accounts.length === 0) {
    return <Alert tone="warning">Cadastre uma conta antes de importar um extrato. <Link href="/app/contas" className="font-semibold underline">Cadastrar conta</Link></Alert>;
  }

  return (
    <div className="space-y-4">
      {done ? (
        <Alert tone="success">
          {done.imported} {done.imported === 1 ? "lançamento importado" : "lançamentos importados"}
          {done.skipped ? ` · ${done.skipped} ignorado(s)` : ""}. <Link href="/app/lancamentos" className="font-semibold underline">Ver lançamentos</Link>
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="imp-account" className="label">Conta do extrato</label>
          <select id="imp-account" value={accountId} onChange={(e) => { setAccountId(e.target.value); setRows(null); }} className="input">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="imp-file" className="label">Arquivo CSV ou OFX (até 1 MB)</label>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 text-sm text-slate-600 hover:border-navy-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-600">
            <FileUp className="h-4 w-4" aria-hidden />
            <span className="truncate">{fileName || "Escolher arquivo"}</span>
            <input id="imp-file" type="file" accept=".csv,.ofx,.txt,text/csv,application/x-ofx" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {pending && !rows ? <p className="text-sm text-slate-500" aria-live="polite">Lendo o arquivo…</p> : null}

      {rows ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              <strong>{selected.length}</strong> de {rows.length} selecionados ·
              <span className="tabular text-money-700"> + {formatBRL(totals.income)}</span> ·
              <span className="tabular"> − {formatBRL(totals.expense)}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" className="text-sm font-medium text-navy-600" onClick={() => setRows(rows.map((r) => ({ ...r, include: true })))}>Marcar todos</button>
              <button type="button" className="text-sm font-medium text-navy-600" onClick={() => setRows(rows.map((r) => ({ ...r, include: false })))}>Desmarcar todos</button>
            </div>
          </div>
          {rows.some((r) => r.duplicate) ? (
            <Alert tone="warning">Linhas marcadas como duplicata vieram desmarcadas. Revise antes de confirmar.</Alert>
          ) : null}
          {skipped.length ? (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">{skipped.length} linha(s) do arquivo foram ignoradas</summary>
              <ul className="mt-1 list-disc pl-5">{skipped.slice(0, 20).map((s) => <li key={s.line}>Linha {s.line}: {s.reason}</li>)}</ul>
            </details>
          ) : null}

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {rows.map((r) => (
              <li key={r.index} className={cn("grid gap-2 p-3 sm:grid-cols-[auto_1fr_auto_12rem] sm:items-center", !r.include && "opacity-60")}>
                <input type="checkbox" checked={r.include} onChange={(e) => update(r.index, { include: e.target.checked })} className="h-5 w-5 accent-money-500" aria-label={`Importar ${r.description}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.description}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {formatDateBR(r.date)}
                    {r.duplicate === "imported" ? <Badge tone="danger">Já importado</Badge> : null}
                    {r.duplicate === "possible" ? <Badge tone="warning">Possível duplicata</Badge> : null}
                    {r.suggestion ? <Badge tone="navy">{r.suggestion === "history" ? "Categoria pelo seu histórico" : "Categoria sugerida"}</Badge> : null}
                  </p>
                </div>
                <span className={cn("tabular text-sm font-semibold", r.kind === "income" ? "text-money-700" : "")}>
                  {r.kind === "income" ? "+ " : "− "}{formatBRL(r.amountCents)}
                </span>
                <select
                  value={r.categoryId ?? ""}
                  onChange={(e) => update(r.index, { categoryId: e.target.value || null, suggestion: null })}
                  className="input py-2"
                  aria-label={`Categoria de ${r.description}`}
                >
                  <option value="">Sem categoria</option>
                  {categories.filter((c) => c.kind === r.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="money" onClick={confirm} disabled={pending || selected.length === 0}>
              {pending ? "Importando…" : `Importar ${selected.length} lançamento(s)`}
            </Button>
            <Button variant="ghost" onClick={() => { setRows(null); setFileName(""); }}>Cancelar</Button>
          </div>
          <p className="text-xs text-slate-500">Lançamentos importados entram como pagos/recebidos na conta escolhida. Você pode desfazer a importação depois.</p>
        </div>
      ) : null}
    </div>
  );
}
