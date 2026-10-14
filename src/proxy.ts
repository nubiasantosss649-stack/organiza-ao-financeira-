import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const AUTH_PAGES = ["/entrar", "/cadastro", "/recuperar-senha"];

/**
 * Content Security Policy com nonce por requisição: só executam scripts do
 * próprio site emitidos pelo servidor nesta resposta. Estilos inline são
 * permitidos porque gráficos e barras de progresso usam o atributo `style`.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const https = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * Renova a sessão do Supabase a cada requisição, aplica a CSP e protege as
 * áreas logadas. A autorização real dos dados é feita pelo RLS no banco.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  const finish = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  let response = next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return finish(response);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
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
    return finish(copyCookies(response, NextResponse.redirect(target)));
  }

  if (isLoggedIn && AUTH_PAGES.includes(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/app";
    target.search = "";
    return finish(copyCookies(response, NextResponse.redirect(target)));
  }

  if (isPrivate || pathname.startsWith("/api")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return finish(response);
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}

export const config = {
  matcher: [
    "/((?!api/webhooks|api/cron|_next/static|_next/image|favicon.ico|icons/|screenshots/|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
