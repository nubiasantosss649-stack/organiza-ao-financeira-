import type { ISODate } from "@/lib/dates";

export interface ParsedRow {
  /** Data do lançamento (AAAA-MM-DD). */
  date: ISODate;
  description: string;
  /** Valor com sinal, em centavos: negativo = saída (despesa), positivo = entrada (receita). */
  amountCents: number;
  /** Identificador único do banco (OFX FITID), quando existir. */
  externalId?: string;
}

export interface ParseResult {
  format: "csv" | "ofx";
  rows: ParsedRow[];
  /** Linhas ignoradas, com o motivo (para mostrar ao usuário). */
  skipped: Array<{ line: number; reason: string }>;
}

export const MAX_IMPORT_BYTES = 1_000_000; // 1 MB
export const MAX_IMPORT_ROWS = 2_000;

/**
 * Arquitetura preparada para integrações bancárias autorizadas (Open Finance).
 * Um conector futuro deve implementar esta interface e entregar linhas no mesmo
 * formato da importação de arquivos, reaproveitando revisão, categorização e
 * detecção de duplicatas. NÃO implementado: exige instituição participante/
 * parceiro regulado, consentimento do Open Finance Brasil e avaliação de segurança.
 */
export interface BankConnector {
  readonly id: string;
  readonly displayName: string;
  fetchTransactions(params: { consentId: string; from: ISODate; to: ISODate }): Promise<ParsedRow[]>;
}
