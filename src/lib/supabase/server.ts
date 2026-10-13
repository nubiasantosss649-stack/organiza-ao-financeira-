import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Cliente com a sessão do usuário logado. Todas as consultas passam pelo RLS,
 * portanto só retornam dados do próprio usuário.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = publicEnv();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

/**
 * Cliente administrativo (ignora RLS). Uso restrito a operações do servidor
 * que exigem privilégio, como excluir a conta do próprio usuário autenticado.
 * NUNCA importar em componentes de cliente.
 */
export function createAdminClient() {
  const { supabaseUrl } = publicEnv();
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SECRET_KEY não configurada.");
  }
  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
