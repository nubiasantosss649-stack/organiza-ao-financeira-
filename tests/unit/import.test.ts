import { describe, expect, it } from "vitest";
import { hashRows, importHash, parseStatement } from "@/lib/import";
import { parseCsvAmount, parseCsvDate } from "@/lib/import/csv";
import { buildHistoryIndex, suggestCategory } from "@/lib/import/categorize";
import type { ParseResult } from "@/lib/import";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-45.90<FITID>A1<MEMO>IFOOD *RESTAURANTE
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>3500.00<FITID>A2<NAME>SALARIO EMPRESA X
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026XX01<TRNAMT>-1.00<FITID>A3<MEMO>quebrado
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_XML = `<?xml version="1.0"?><OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-120,50</TRNAMT><FITID>X9</FITID><MEMO>CONTA DE LUZ &amp; GAS</MEMO></STMTTRN></OFX>`;

const ok = (r: ParseResult | { error: string }) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("OFX", () => {
  it("lê OFX 1.x (SGML) com datas, sinais e FITID; ignora linhas inválidas", () => {
    const r = ok(parseStatement("extrato.ofx", OFX_SGML));
    expect(r.format).toBe("ofx");
    expect(r.rows).toEqual([
      { date: "2026-10-05", description: "IFOOD *RESTAURANTE", amountCents: -4590, externalId: "A1" },
      { date: "2026-10-01", description: "SALARIO EMPRESA X", amountCents: 350000, externalId: "A2" },
    ]);
    expect(r.skipped).toHaveLength(1);
  });
  it("lê OFX 2.x (XML) com vírgula decimal e entidades", () => {
    const r = ok(parseStatement("x.ofx", OFX_XML));
    expect(r.rows[0]).toMatchObject({ date: "2026-10-03", amountCents: -12050, description: "CONTA DE LUZ & GAS" });
  });
});

describe("CSV", () => {
  it("formato brasileiro com ; e coluna Valor", () => {
    const csv = "Extrato conta corrente\nData;Descrição;Valor\n05/10/2026;Supermercado Dia;-1.234,56\n06/10/2026;PIX recebido;200,00\n07/10/2026;SALDO DO DIA;5.000,00\n";
    const r = ok(parseStatement("nubank.csv", csv));
    expect(r.rows).toEqual([
      { date: "2026-10-05", description: "Supermercado Dia", amountCents: -123456 },
      { date: "2026-10-06", description: "PIX recebido", amountCents: 20000 },
    ]);
    expect(r.skipped[0].reason).toMatch(/saldo/i);
  });
  it("formato com vírgula, aspas e colunas Débito/Crédito", () => {
    const csv = 'date,description,debito,credito\n2026-10-01,"Loja, centro",50.00,\n2026-10-02,Estorno,,10.00\n';
    const r = ok(parseStatement("a.csv", csv));
    expect(r.rows.map((x) => [x.description, x.amountCents])).toEqual([["Loja, centro", -5000], ["Estorno", 1000]]);
  });
  it("rejeita cabeçalho desconhecido, binário e extensões não suportadas", () => {
    expect(ok(parseStatement("a.csv", "foo;bar\n1;2")).rows).toHaveLength(0);
    expect(parseStatement("a.pdf", "%PDF")).toHaveProperty("error");
    expect(parseStatement("a.csv", "a\u0000b")).toHaveProperty("error");
  });
  it("datas e valores variados", () => {
    expect(parseCsvDate("5/1/26")).toBe("2026-01-05");
    expect(parseCsvDate("31/02/2026")).toBeNull();
    expect(parseCsvAmount("(45,00)")).toBe(-4500);
    expect(parseCsvAmount("45,00 D")).toBe(-4500);
    expect(parseCsvAmount("R$ -10,00")).toBe(-1000);
    expect(parseCsvAmount("abc")).toBeNull();
  });
});

describe("duplicatas", () => {
  const row = { date: "2026-10-05", description: "Uber *Trip", amountCents: -2350 };
  it("hash estável e independente de maiúsculas/pontuação", () => {
    expect(importHash("acc", row)).toBe(importHash("acc", { ...row, description: "UBER TRIP" }));
    expect(importHash("acc", row)).not.toBe(importHash("outra", row));
    expect(importHash("acc", row)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("compras idênticas no mesmo arquivo não são descartadas", () => {
    const [a, b] = hashRows("acc", [row, row]);
    expect(a).not.toBe(b);
    expect(hashRows("acc", [row, row])).toEqual([a, b]); // reimportar o mesmo arquivo gera os mesmos hashes
  });
});

describe("categorização automática", () => {
  const cats = [
    { id: "rest", name: "Restaurantes", kind: "expense" as const },
    { id: "merc", name: "Mercado", kind: "expense" as const },
    { id: "sal", name: "Salário", kind: "income" as const },
    { id: "beleza", name: "Cuidados pessoais", kind: "expense" as const },
  ];
  it("usa o histórico do usuário antes das regras", () => {
    const idx = buildHistoryIndex([
      { description: "IFOOD *RESTAURANTE", categoryId: "merc", kind: "expense" },
      { description: "ifood restaurante", categoryId: "merc", kind: "expense" },
    ]);
    expect(suggestCategory("Ifood - Restaurante", "expense", cats, idx)).toEqual({ categoryId: "merc", source: "history" });
  });
  it("aplica regras por palavra inteira", () => {
    const idx = new Map();
    expect(suggestCategory("IFOOD *PIZZA", "expense", cats, idx).categoryId).toBe("rest");
    expect(suggestCategory("SALARIO EMPRESA", "income", cats, idx).categoryId).toBe("sal");
    expect(suggestCategory("BARBEARIA DO ZE", "expense", cats, idx).categoryId).toBe("beleza");
    expect(suggestCategory("Transferência", "expense", cats, idx).categoryId).toBeNull();
  });
});
