/**
 * CSV no padrão brasileiro (separador ";", decimal com vírgula, BOM UTF-8 para o Excel).
 * Protege contra injeção de fórmulas em planilhas (=, +, -, @, tab, CR).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
