"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient, requireFeature } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { hashRows, importHash, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, normalizeDescription, parseStatement } from "@/lib/import";
import { buildHistoryIndex, suggestCategory } from "@/lib/import/categorize";
import { isISODate } from "@/lib/dates";
import { MAX_CENTS } from "@/lib/money";

export interface PreviewRow {
  index: number;
  date: string;
  description: string;
  amountCents: number;
  kind: "income" | "expense";
  categoryId: string | null;
  suggestion: "history" | "rule" | null;
  occurrence: number;
  externalId?: string;
  /** "imported": já importada antes (mesmo identificador); "possible": lançamento manual parecido. */
  duplicate: "imported" | "possible" | null;
}

export type PreviewResult =
  | { ok: true; format: "csv" | "ofx"; rows: PreviewRow[]; skipped: Array<{ line: number; reason: string }> }
  | { ok: false; error: string };

const previewInput = z.object({
  accountId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(MAX_IMPORT_BYTES * 2),
});

export async function previewImport(input: z.input<typeof previewInput>): Promise<PreviewResult> {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido ou maior que 1 MB." };
  let ctx;
  try {
    ctx = await requireFeature("statement_import");
  } catch {
    return { ok: false, error: "A importação de extratos faz parte do Controle Fácil Pro." };
  }
  const { supabase } = ctx;
  const { accountId, fileName, content } = parsed.data;

  const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!account) return { ok: false, error: "Conta não encontrada." };

  const result = parseStatement(fileName, content);
  if ("error" in result) return { ok: false, error: result.error };
  if (result.rows.length === 0) {
    return { ok: false, error: result.skipped[0]?.reason ?? "Nenhum lançamento encontrado no arquivo." };
  }

  const hashes = hashRows(accountId, result.rows);
  const [{ data: categories }, { data: history }] = await Promise.all([
    supabase.from("categories").select("id, name, kind").is("archived_at", null),
    supabase.from("transactions").select("description, category_id, kind").not("category_id", "is", null)
      .order("created_at", { ascending: false }).limit(1000),
  ]);
  const historyIndex = buildHistoryIndex(
    (history ?? []).map((h) => ({ description: h.description, categoryId: h.category_id as string, kind: h.kind })),
  );

  // Duplicatas exatas (já importadas) e possíveis (lançamento manual com mesma data e valor).
  const imported = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data } = await supabase.from("transactions").select("import_hash").in("import_hash", hashes.slice(i, i + 200));
    (data ?? []).forEach((r) => imported.add(r.import_hash as string));
  }
  const dates = result.rows.map((r) => r.date).sort();
  const { data: existing } = await supabase
    .from("transactions")
    .select("occurred_on, amount_cents, kind")
    .eq("account_id", accountId)
    .is("import_hash", null)
    .gte("occurred_on", dates[0])
    .lte("occurred_on", dates[dates.length - 1])
    .limit(5000);
  const manual = new Map<string, number>();
  for (const e of existing ?? []) {
    const key = `${e.occurred_on}|${e.kind}|${Number(e.amount_cents)}`;
    manual.set(key, (manual.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const rows: PreviewRow[] = result.rows.map((r, index) => {
    const kind = r.amountCents < 0 ? "expense" : "income";
    const amount = Math.abs(r.amountCents);
    const s = suggestCategory(r.description, kind, (categories ?? []) as Array<{ id: string; name: string; kind: "income" | "expense" }>, historyIndex);
    // Mesma numeração de ocorrências usada em hashRows (para o hash da confirmação bater).
    const base = `${r.date}|${r.amountCents}|${normalizeDescription(r.description)}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const key = `${r.date}|${kind}|${amount}`;
    let duplicate: PreviewRow["duplicate"] = imported.has(hashes[index]) ? "imported" : null;
    if (!duplicate && (manual.get(key) ?? 0) > 0) {
      duplicate = "possible";
      manual.set(key, (manual.get(key) ?? 0) - 1);
    }
    return {
      index, date: r.date, description: r.description, amountCents: amount, kind,
      categoryId: s.categoryId, suggestion: s.source, occurrence, externalId: r.externalId, duplicate,
    };
  });

  return { ok: true, format: result.format, rows, skipped: result.skipped };
}

const confirmInput = z.object({
  accountId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  format: z.enum(["csv", "ofx"]),
  skippedCount: z.number().int().min(0).max(100_000),
  rows: z.array(z.object({
    date: z.string().refine(isISODate),
    description: z.string().trim().min(1).max(120),
    amountCents: z.number().int().positive().max(MAX_CENTS),
    kind: z.enum(["income", "expense"]),
    categoryId: z.uuid().nullable(),
    occurrence: z.number().int().min(0).max(MAX_IMPORT_ROWS),
    externalId: z.string().max(100).optional(),
  })).min(1).max(MAX_IMPORT_ROWS),
});

export async function confirmImport(input: z.input<typeof confirmInput>): Promise<{ ok: true; imported: number; skipped: number } | { ok: false; error: string }> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados da importação inválidos." };
  let ctx;
  try {
    ctx = await requireFeature("statement_import");
  } catch {
    return { ok: false, error: "A importação de extratos faz parte do Controle Fácil Pro." };
  }
  const { supabase } = ctx;
  const v = parsed.data;

  const { data: categories } = await supabase.from("categories").select("id, kind");
  const catKind = new Map((categories ?? []).map((c) => [c.id as string, c.kind as string]));

  const { data: imp, error: impError } = await supabase
    .from("statement_imports")
    .insert({ account_id: v.accountId, file_name: v.fileName, format: v.format })
    .select("id")
    .single();
  if (impError) return { ok: false, error: friendlyDbError(impError) };

  const rows = v.rows.map((r) => ({
    account_id: v.accountId,
    kind: r.kind,
    amount_cents: r.amountCents,
    description: r.description,
    occurred_on: r.date,
    status: "paid",
    // categoria só é aceita se existir e for do mesmo tipo
    category_id: r.categoryId && catKind.get(r.categoryId) === r.kind ? r.categoryId : null,
    import_id: imp.id,
    import_hash: importHash(v.accountId, {
      date: r.date,
      description: r.description,
      amountCents: r.kind === "expense" ? -r.amountCents : r.amountCents,
      externalId: r.externalId,
    }, r.occurrence),
  }));

  const { data: inserted, error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "user_id,import_hash", ignoreDuplicates: true })
    .select("id");
  if (error) {
    await supabase.from("statement_imports").delete().eq("id", imp.id);
    return { ok: false, error: friendlyDbError(error) };
  }
  const count = inserted?.length ?? 0;
  const skipped = v.skippedCount + (rows.length - count);
  await supabase.from("statement_imports").update({ rows_imported: count, rows_skipped: skipped }).eq("id", imp.id);
  revalidatePath("/app", "layout");
  return { ok: true, imported: count, skipped };
}

export async function undoImport(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Importação inválida." };
  const { supabase } = await authedClient();
  // Remove a importação e, em cascata, os lançamentos criados por ela.
  const { error } = await supabase.from("statement_imports").delete().eq("id", id.data);
  revalidatePath("/app", "layout");
  return error ? { error: friendlyDbError(error) } : { ok: true };
}
