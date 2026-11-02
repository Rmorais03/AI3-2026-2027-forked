const CACHE_INTERFACE = 'interface-v1';
const CACHE_CATEGORIAS = 'dados-publicos';
const ficheirosInterface = [
  '/',
  '/index.html',
  '/estilos.css',
  '/app.js',
  '/configuracoes.js',
  '/bd.js',
  '/pendentes.js',
  '/sw.js'
];
const caminhosInterface = new Set(ficheirosInterface);

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_INTERFACE).then((cache) => cache.addAll(ficheirosInterface))
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter((nome) => nome !== CACHE_INTERFACE && nome !== CACHE_CATEGORIAS)
      .map((nome) => caches.delete(nome)));
    await self.clients.claim();
  })());
});

async function interfaceCachePrimeiro(pedido) {
  const cache = await caches.open(CACHE_INTERFACE);
  const guardada = await cache.match(pedido, { ignoreSearch: true });
  if (guardada) return guardada;

  const resposta = await fetch(pedido);
  if (resposta.ok) await cache.put(pedido, resposta.clone());
  return resposta;
}

function categoriasComAtualizacao(evento) {
  const pedido = evento.request;
  const respostaRede = (async () => {
    const resposta = await fetch(pedido);
    if (resposta.ok) {
      const cache = await caches.open(CACHE_CATEGORIAS);
      await cache.put(pedido, resposta.clone());
    }
    return resposta;
  })();

  // Mantém a atualização ativa depois de devolver uma cópia guardada.
  evento.waitUntil(respostaRede.then(() => undefined, () => undefined));
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE_CATEGORIAS);
    const guardada = await cache.match(pedido);
    return guardada ?? respostaRede;
  })());
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/v2/categorias') {
    categoriasComAtualizacao(evento);
    return;
  }
  if (url.pathname.startsWith('/v2/')) return;
  if (caminhosInterface.has(url.pathname)) {
    evento.respondWith(interfaceCachePrimeiro(pedido));
  }
});

self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'ativar') self.skipWaiting();
});
