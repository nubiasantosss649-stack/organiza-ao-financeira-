import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Verificação de saúde para a hospedagem/monitoramento: app no ar e banco respondendo. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let database = "not_configured";
  if (url && key) {
    try {
      const { error } = await createClient(url, key, { auth: { persistSession: false } })
        .from("plans").select("id", { head: true, count: "exact" }).limit(1);
      database = error ? "error" : "ok";
    } catch {
      database = "error";
    }
  }
  const ok = database === "ok";
  return NextResponse.json({ status: ok ? "ok" : "degraded", database }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
