import { describe, expect, it } from "vitest";
import { csvCell, toCSV } from "@/lib/csv";

describe("CSV", () => {
  it("escapa separadores e aspas", () => {
    expect(csvCell('Pão; leite "integral"')).toBe('"Pão; leite ""integral"""');
    expect(csvCell(null)).toBe("");
  });
  it("neutraliza fórmulas de planilha", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+5511999")).toBe("'+5511999");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("gera arquivo com BOM e CRLF", () => {
    const out = toCSV(["a", "b"], [[1, "x"]]);
    expect(out.startsWith("﻿a;b\r\n1;x")).toBe(true);
  });
});
