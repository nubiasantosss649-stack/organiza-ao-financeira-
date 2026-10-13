import { z } from "zod";
import { isISODate } from "./dates";
import { MAX_CENTS, parseBRL } from "./money";
import { MAX_INSTALLMENTS, MAX_RECURRENCES } from "./finance";

const trimmed = (max: number, label: string) =>
  z.string().trim().min(1, `Informe ${label}.`).max(max, `Use no máximo ${max} caracteres.`);

export const moneyField = (opts: { allowNegative?: boolean; allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const cents = parseBRL(value === "" && opts.allowZero ? "0" : value);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 1.234,56." });
        return z.NEVER;
      }
      if (!opts.allowNegative && cents < 0) {
        ctx.addIssue({ code: "custom", message: "O valor não pode ser negativo." });
        return z.NEVER;
      }
      if (!opts.allowZero && cents === 0) {
        ctx.addIssue({ code: "custom", message: "O valor deve ser maior que zero." });
        return z.NEVER;
      }
      if (Math.abs(cents) > MAX_CENTS) {
        ctx.addIssue({ code: "custom", message: "Valor acima do permitido." });
        return z.NEVER;
      }
      return cents;
    });

export const isoDate = z.string().refine(isISODate, "Data inválida.");
const optionalIsoDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), "Data inválida.");

export const uuid = z.uuid("Seleção inválida.");
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid("Seleção inválida.").nullable());

export const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida.");

/** Checkbox "já pago": marcado envia "paid"; desmarcado não envia nada (= pendente). */
const statusField = z.preprocess((v) => (v === "paid" ? "paid" : "pending"), z.enum(["paid", "pending"]));

export const transactionSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    amount: moneyField(),
    description: trimmed(120, "uma descrição"),
    occurred_on: isoDate,
    account_id: uuid,
    category_id: optionalUuid,
    status: statusField,
    notes: z.string().trim().max(500, "Use no máximo 500 caracteres.").optional().transform((v) => v || null),
    repeat: z.enum(["single", "installments", "recurring"]).default("single"),
    repeat_count: z.coerce.number().int().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.repeat === "installments" && !(v.repeat_count && v.repeat_count >= 2 && v.repeat_count <= MAX_INSTALLMENTS)) {
      ctx.addIssue({ code: "custom", path: ["repeat_count"], message: `Informe de 2 a ${MAX_INSTALLMENTS} parcelas.` });
    }
    if (v.repeat === "recurring" && !(v.repeat_count && v.repeat_count >= 2 && v.repeat_count <= MAX_RECURRENCES)) {
      ctx.addIssue({ code: "custom", path: ["repeat_count"], message: `Informe de 2 a ${MAX_RECURRENCES} meses.` });
    }
    if (v.repeat === "installments" && v.repeat_count && v.amount < v.repeat_count) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Valor menor que o número de parcelas." });
    }
  });

export const transactionUpdateSchema = z.object({
  kind: z.enum(["income", "expense"]),
  amount: moneyField(),
  description: trimmed(120, "uma descrição"),
  occurred_on: isoDate,
  account_id: uuid,
  category_id: optionalUuid,
  status: statusField,
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

export const accountSchema = z.object({
  name: trimmed(60, "o nome da conta"),
  type: z.enum(["checking", "savings", "cash", "digital_wallet", "investment", "other"]),
  initial_balance: moneyField({ allowNegative: true, allowZero: true }),
  color,
});

export const categorySchema = z.object({
  name: trimmed(40, "o nome da categoria"),
  kind: z.enum(["income", "expense"]),
  color,
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/, "Ícone inválido."),
});

export const budgetSchema = z.object({
  category_id: optionalUuid,
  amount: moneyField(),
});

export const goalSchema = z.object({
  name: trimmed(60, "o nome da meta"),
  kind: z.enum(["savings", "emergency", "travel", "purchase", "education", "other"]),
  target: moneyField(),
  target_date: optionalIsoDate,
});

export const goalDepositSchema = z.object({
  goal_id: uuid,
  direction: z.enum(["deposit", "withdraw"]),
  amount: moneyField(),
  deposited_on: isoDate,
  note: z.string().trim().max(200).optional().transform((v) => v || null),
});

/** Normaliza (espaços/maiúsculas) ANTES de validar o formato do e-mail. */
export const emailField = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."));

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letras e números na senha.");

export const signUpSchema = z
  .object({
    full_name: trimmed(120, "seu nome"),
    email: emailField,
    password: passwordSchema,
    confirm_password: z.string(),
    accept_terms: z.literal("on", { error: "É preciso aceitar os Termos de Uso e a Política de Privacidade." }),
  })
  .refine((v) => v.password === v.confirm_password, { path: ["confirm_password"], message: "As senhas não conferem." });

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Informe sua senha."),
});

export const profileSchema = z.object({
  full_name: trimmed(120, "seu nome"),
});

/** Converte FormData em objeto simples (somente campos de texto). */
export function formToObject(form: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") obj[key] = value;
  }
  return obj;
}

export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
