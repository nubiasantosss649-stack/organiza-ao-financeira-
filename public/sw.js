/* Service worker do Controle Fácil.
 * Política de privacidade e honestidade:
 *  - Guarda em cache SOMENTE arquivos estáticos públicos (JS/CSS/fontes/ícones) e a página /offline.
 *  - NUNCA guarda páginas do app (/app, /admin), respostas de API nem dados financeiros.
 *  - Sem internet, navegações mostram /offline; o app não funciona offline.
 */
const VERSION = "cf-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/screenshots/"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    // Páginas sempre da rede (dados sempre atuais e privados); fallback honesto offline.
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }

  if (isStaticAsset(url)) {
    // Arquivos com hash no nome: cache primeiro.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
  // Demais requisições (API, server actions, dados): rede direta, sem cache.
});
