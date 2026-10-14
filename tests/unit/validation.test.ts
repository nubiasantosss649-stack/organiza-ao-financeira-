import { describe, expect, it } from "vitest";
import { accountSchema, goalSchema, signUpSchema, transactionSchema } from "@/lib/validation";
import { safeNext } from "@/lib/redirect";
import { friendlyDbError } from "@/lib/errors";

const ACC = "11111111-1111-4111-8111-111111111111";

describe("validação de lançamentos", () => {
  const base = { kind: "expense", amount: "1.234,56", description: " Mercado ", occurred_on: "2026-10-13", account_id: ACC, status: "paid" };

  it("converte valor para centavos e normaliza campos", () => {
    const r = transactionSchema.parse(base);
    expect(r.amount).toBe(123456);
    expect(r.description).toBe("Mercado");
    expect(r.category_id).toBeNull();
    expect(r.repeat).toBe("single");
  });
  it("checkbox desmarcado vira pendente", () => {
    const { status: _status, ...rest } = base;
    void _status;
    expect(transactionSchema.parse(rest).status).toBe("pending");
  });
  it("rejeita valores inválidos, zero e negativos", () => {
    for (const amount of ["abc", "0", "-10,00", ""]) {
      expect(transactionSchema.safeParse({ ...base, amount }).success).toBe(false);
    }
  });
  it("exige número de parcelas válido", () => {
    expect(transactionSchema.safeParse({ ...base, repeat: "installments" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, repeat: "installments", repeat_count: "121" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, repeat: "installments", repeat_count: "12" }).success).toBe(true);
    expect(transactionSchema.safeParse({ ...base, amount: "0,05", repeat: "installments", repeat_count: "12" }).success).toBe(false);
  });
  it("rejeita datas e ids inválidos", () => {
    expect(transactionSchema.safeParse({ ...base, occurred_on: "2026-02-30" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, account_id: "1 or 1=1" }).success).toBe(false);
  });
});

describe("outras validações", () => {
  it("conta aceita saldo inicial negativo e zero", () => {
    expect(accountSchema.parse({ name: "Banco", type: "checking", initial_balance: "-50,00", color: "#0B2545" }).initial_balance).toBe(-5000);
    expect(accountSchema.parse({ name: "Banco", type: "checking", initial_balance: "", color: "#0B2545" }).initial_balance).toBe(0);
    expect(accountSchema.safeParse({ name: "Banco", type: "checking", initial_balance: "0", color: "red" }).success).toBe(false);
  });
  it("meta com prazo opcional", () => {
    expect(goalSchema.parse({ name: "Viagem", kind: "travel", target: "5.000", target_date: "" }).target_date).toBeNull();
  });
  it("cadastro exige termos, senha forte e confirmação igual", () => {
    const ok = { full_name: "Ana", email: "ANA@Ex.com ", password: "Senha1234", confirm_password: "Senha1234", accept_terms: "on" };
    expect(signUpSchema.parse(ok).email).toBe("ana@ex.com");
    expect(signUpSchema.safeParse({ ...ok, accept_terms: undefined }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, password: "somenteletras", confirm_password: "somenteletras" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, confirm_password: "Outra1234" }).success).toBe(false);
  });
});

describe("segurança", () => {
  it("evita redirecionamento aberto", () => {
    expect(safeNext("/app/metas")).toBe("/app/metas");
    expect(safeNext("https://malicioso.com")).toBe("/app");
    expect(safeNext("//malicioso.com")).toBe("/app");
    expect(safeNext("/\\malicioso.com")).toBe("/app");
    expect(safeNext(null)).toBe("/app");
  });
  it("traduz erros do banco sem expor detalhes", () => {
    expect(friendlyDbError({ message: "PLAN_LIMIT:accounts" })).toMatch(/limite de contas/);
    expect(friendlyDbError({ code: "XX000", message: "internal stack trace" })).toBe("Não foi possível concluir a operação. Tente novamente.");
  });
});
