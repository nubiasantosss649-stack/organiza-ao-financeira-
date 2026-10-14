import { isISODate } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import { MAX_IMPORT_ROWS, type ParseResult, type ParsedRow } from "./types";

function tag(block: string, name: string): string | undefined {
  // OFX 1.x (SGML) pode não fechar as tags; OFX 2.x (XML) fecha.
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&");
}

/** Valor OFX: ponto decimal, sinal opcional (ex.: -45.90). Alguns bancos usam vírgula. */
export function parseOfxAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!/^[+-]?\d+([.,]\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith("-");
  const cents = parseBRL(s.replace(/^[+-]/, "").replace(".", ","));
  if (cents === null) return null;
  return negative ? -cents : cents;
}

export function parseOfx(content: string): ParseResult {
  const rows: ParsedRow[] = [];
  const skipped: ParseResult["skipped"] = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((rawBlock, i) => {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0];
    const line = i + 1;
    const dt = tag(block, "DTPOSTED");
    const amt = tag(block, "TRNAMT");
    const date = dt && /^\d{8}/.test(dt) ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : null;
    const amountCents = amt ? parseOfxAmount(amt) : null;
    const description = decodeEntities(tag(block, "MEMO") || tag(block, "NAME") || "").replace(/\s+/g, " ").trim();
    if (!date || !isISODate(date)) return void skipped.push({ line, reason: "Data inválida" });
    if (amountCents === null || amountCents === 0) return void skipped.push({ line, reason: "Valor inválido" });
    if (rows.length >= MAX_IMPORT_ROWS) return void skipped.push({ line, reason: "Limite de linhas por importação" });
    rows.push({
      date,
      description: (description || "Lançamento importado").slice(0, 120),
      amountCents,
      externalId: tag(block, "FITID")?.slice(0, 100) || undefined,
    });
  });
  return { format: "ofx", rows, skipped };
}
