const CACHE_INTERFACE = 'interface-v1';
const CACHE_CATEGORIAS = 'dados-publicos';
// os ficheiros da interface não incluem dados pessoais; estes são preenchidos pela página.
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

// a nova versão remove caches antigas da interface e conserva dados-publicos.
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

// a Cache API não aplica max-age; devolvemos a cópia e tentamos atualizá-la para o próximo acesso.
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

  evento.waitUntil(respostaRede.then(() => undefined, () => undefined));
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE_CATEGORIAS);
    const guardada = await cache.match(pedido);
    return guardada ?? respostaRede;
  })());
}

// guardar só interface e categorias públicas; pedidos privados passam à rede, pois o cookie não separa entradas da Cache API.
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/v2/categorias') {
    categoriasComAtualizacao(evento);
    return;
  }
  // Só rede para o resto da API (/v2/sessao, /v2/sugestoes): estas respostas dependem do cookie.
  // A Cache API identifica cada resposta apenas pelo método e URL (o cookie não conta) e ignora o
  // Cache-Control, incluindo «private», que só proíbe caches partilhadas (proxies). Se a lista da Ana
  // fosse guardada, o Bruno, no mesmo browser, receberia a lista da Ana em vez da sua.
  if (url.pathname.startsWith('/v2/')) return;
  if (caminhosInterface.has(url.pathname)) {
    evento.respondWith(interfaceCachePrimeiro(pedido));
  }
});

// o botão de atualização pede à nova versão em espera para assumir o controlo.
self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'ativar') self.skipWaiting();
});
