import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const AUTH_PAGES = ["/entrar", "/cadastro", "/recuperar-senha"];

/**
 * Renova a sessão do Supabase a cada requisição e protege a área logada.
 * A autorização real dos dados é feita pelo RLS no banco; aqui só evitamos
 * renderizar páginas privadas para quem não está logado.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Não colocar código entre a criação do cliente e esta chamada.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const isPrivate = ["/app", "/admin"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isLoggedIn && isPrivate) {
    const target = request.nextUrl.clone();
    target.pathname = "/entrar";
    target.search = `?next=${encodeURIComponent(pathname + search)}`;
    return copyCookies(response, NextResponse.redirect(target));
  }

  if (isLoggedIn && AUTH_PAGES.includes(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/app";
    target.search = "";
    return copyCookies(response, NextResponse.redirect(target));
  }

  if (isPrivate || pathname.startsWith("/api")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}

export const config = {
  matcher: [
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
