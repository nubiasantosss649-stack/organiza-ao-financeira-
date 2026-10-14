import { isISODate, toISO } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import { MAX_IMPORT_ROWS, type ParseResult, type ParsedRow } from "./types";

/** Divide uma linha CSV respeitando aspas. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const DATE_HEADERS = ["data", "date", "data lancamento", "data do lancamento", "data movimento", "dt"];
const DESC_HEADERS = ["descricao", "historico", "description", "lancamento", "estabelecimento", "memo", "detalhes", "titulo"];
const AMOUNT_HEADERS = ["valor", "amount", "valor (r$)", "valor r$", "quantia"];
const DEBIT_HEADERS = ["debito", "saida", "debito (r$)", "valor debito"];
const CREDIT_HEADERS = ["credito", "entrada", "credito (r$)", "valor credito"];

function findCol(headers: string[], names: string[]): number {
  const h = headers.map(norm);
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((x) => x.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Aceita DD/MM/AAAA, DD/MM/AA, DD-MM-AAAA e AAAA-MM-DD. */
export function parseCsvDate(raw: string): string | null {
  const s = raw.trim().slice(0, 10);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return isISODate(s) ? s : null;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = toISO(y, Number(m[2]), Number(m[1]));
  return isISODate(iso) ? iso : null;
}

/** Valor do extrato com sinal: "-1.234,56", "1234.56", "(45,00)", "45,00 D", "R$ -10,00". */
export function parseCsvAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/[dD]$/.test(s)) { negative = true; s = s.slice(0, -1); }
  else if (/[cC]$/.test(s)) s = s.slice(0, -1);
  s = s.replace(/^R\$/i, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  const cents = parseBRL(s);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

export function parseCsv(content: string): ParseResult {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const skipped: ParseResult["skipped"] = [];
  if (lines.length < 2) return { format: "csv", rows: [], skipped: [{ line: 1, reason: "Arquivo sem lançamentos" }] };

  // Procura a linha de cabeçalho entre as primeiras 10 (alguns bancos têm linhas de título).
  let headerIdx = -1;
  let sep = ";";
  let cols = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
  for (let i = 0; i < Math.min(10, lines.length) && headerIdx < 0; i++) {
    for (const candidate of [";", ",", "\t"]) {
      const headers = splitCsvLine(lines[i], candidate);
      const c = {
        date: findCol(headers, DATE_HEADERS),
        desc: findCol(headers, DESC_HEADERS),
        amount: findCol(headers, AMOUNT_HEADERS),
        debit: findCol(headers, DEBIT_HEADERS),
        credit: findCol(headers, CREDIT_HEADERS),
      };
      if (c.date >= 0 && c.desc >= 0 && (c.amount >= 0 || c.debit >= 0 || c.credit >= 0)) {
        headerIdx = i;
        sep = candidate;
        cols = c;
        break;
      }
    }
  }
  if (headerIdx < 0) {
    return {
      format: "csv",
      rows: [],
      skipped: [{ line: 1, reason: "Cabeçalho não reconhecido. O arquivo precisa ter colunas de Data, Descrição e Valor (ou Débito/Crédito)." }],
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = i + 1;
    const cells = splitCsvLine(lines[i], sep);
    const date = parseCsvDate(cells[cols.date] ?? "");
    const description = (cells[cols.desc] ?? "").replace(/\s+/g, " ").trim();
    let amountCents: number | null = null;
    if (cols.amount >= 0 && (cells[cols.amount] ?? "") !== "") {
      amountCents = parseCsvAmount(cells[cols.amount]);
    } else {
      const debit = cols.debit >= 0 && cells[cols.debit] ? parseCsvAmount(cells[cols.debit]) : null;
      const credit = cols.credit >= 0 && cells[cols.credit] ? parseCsvAmount(cells[cols.credit]) : null;
      if (debit) amountCents = -Math.abs(debit);
      else if (credit) amountCents = Math.abs(credit);
    }
    if (!date) { skipped.push({ line, reason: "Data inválida" }); continue; }
    if (amountCents === null || amountCents === 0) { skipped.push({ line, reason: "Valor inválido ou zero" }); continue; }
    if (/^saldo/i.test(norm(description))) { skipped.push({ line, reason: "Linha de saldo" }); continue; }
    if (rows.length >= MAX_IMPORT_ROWS) { skipped.push({ line, reason: "Limite de linhas por importação" }); continue; }
    rows.push({ date, description: (description || "Lançamento importado").slice(0, 120), amountCents });
  }
  return { format: "csv", rows, skipped };
}
