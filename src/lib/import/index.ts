import { createHash } from "node:crypto";
import { parseCsv } from "./csv";
import { parseOfx } from "./ofx";
import { MAX_IMPORT_BYTES, type ParseResult, type ParsedRow } from "./types";

export * from "./types";

export function detectFormat(fileName: string, content: string): "csv" | "ofx" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ofx") || /<OFX>/i.test(content.slice(0, 5000))) return "ofx";
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  return null;
}

export function parseStatement(fileName: string, content: string): ParseResult | { error: string } {
  if (typeof content !== "string" || content.length === 0) return { error: "Arquivo vazio." };
  if (Buffer.byteLength(content, "utf8") > MAX_IMPORT_BYTES * 2) return { error: "Arquivo muito grande (máximo 1 MB)." };
  if (/\u0000/.test(content)) return { error: "Arquivo binário não suportado. Envie um CSV ou OFX." };
  const format = detectFormat(fileName, content);
  if (!format) return { error: "Formato não suportado. Envie um arquivo .csv ou .ofx." };
  return format === "ofx" ? parseOfx(content) : parseCsv(content);
}

export function normalizeDescription(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identificador estável de uma linha importada (evita importar duas vezes).
 * Usa o FITID do banco quando existe; senão, data + valor + descrição + posição
 * entre linhas idênticas do mesmo arquivo (para não descartar compras repetidas legítimas).
 */
export function importHash(accountId: string, row: ParsedRow, occurrence = 0): string {
  const key = row.externalId
    ? `fitid|${accountId}|${row.externalId}`
    : `row|${accountId}|${row.date}|${row.amountCents}|${normalizeDescription(row.description)}|${occurrence}`;
  return createHash("sha256").update(key).digest("hex");
}

/** Calcula o hash de cada linha, numerando ocorrências iguais dentro do arquivo. */
export function hashRows(accountId: string, rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}|${r.amountCents}|${normalizeDescription(r.description)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return importHash(accountId, r, n);
  });
}
