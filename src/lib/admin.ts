import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

/** Garante que o usuário logado é administrador; caso contrário, 404 (não revela a área). */
export async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) notFound();
  return { user, supabase };
}
