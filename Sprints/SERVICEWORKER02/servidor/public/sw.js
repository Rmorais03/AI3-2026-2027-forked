import {
  abrirBD,
  lerProprietario,
  lerPendentesDe,
  descartarPendente,
  confirmarPendente,
  marcarErro,
  registarTentativa,
  lerCursor,
  aplicarAlteracoes
} from './bd.js';

const CACHE_INTERFACE = 'interface-v3';
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

  evento.waitUntil(respostaRede.then(() => undefined, () => undefined));
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE_CATEGORIAS);
    const guardada = await cache.match(pedido);
    return guardada ?? respostaRede;
  })());
}

// --- SINCRONIZAÇÃO BIDIRECIONAL (PUSH & PULL) ---

async function sincronizarTudo() {
  try {
    const proprietario = await lerProprietario();
    if (!proprietario || !proprietario.utilizador) return;

    const utilizador = proprietario.utilizador;

    // 1. FASE PUSH (Enviar pendentes para o servidor)
    const pendentes = await lerPendentesDe(utilizador);
    for (const p of pendentes) {
      // Backoff exponencial simples baseado no número de tentativas
      if (p.ultimaTentativa && p.tentativas > 0) {
        const tempoEspera = Math.min(30000, 1000 * Math.pow(2, p.tentativas - 1));
        const agora = Date.now();
        const ultima = new Date(p.ultimaTentativa).getTime();
        if (agora - ultima < tempoEspera) {
          continue; // Ainda está em período de espera (backoff)
        }
      }

      try {
        await registarTentativa(p.idLocal);

        const resposta = await fetch('/v2/sugestoes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': p.chave
          },
          body: JSON.stringify({
            titulo: p.titulo,
            descricao: p.descricao,
            categoria: p.categoria
          })
        });

        if (resposta.status === 201 || resposta.headers.get('Idempotent-Replayed') === 'true') {
          const sugestaoCriada = await resposta.json();
          await confirmarPendente(p.idLocal, sugestaoCriada);
        } else if (resposta.status === 409) {
          // Conflito de idempotência (já processado anteriormente) - descartar pendente local
          await descartarPendente(p.idLocal);
        } else if (resposta.status >= 400 && resposta.status < 500) {
          // Erro do cliente (ex: 400 Bad Request) - não vale a pena insistir
          const erroJson = await resposta.json().catch(() => ({}));
          await marcarErro(p.idLocal, erroJson.mensagem || 'Erro de validação no servidor.');
        } else {
          // Erro 5xx ou outro - será tentado novamente mais tarde (backoff)
          await marcarErro(p.idLocal, `Erro temporário do servidor (${resposta.status}).`);
        }
      } catch (erroRede) {
        // Falha de rede - aguarda próxima tentativa
        await marcarErro(p.idLocal, 'Sem ligação à rede.');
      }
    }

    // 2. FASE PULL (Buscar alterações do servidor usando o cursor)
    const cursor = await lerCursor();
    const respostaAlteracoes = await fetch(`/v2/sugestoes/alteracoes?desde=${cursor}`);
    if (respostaAlteracoes.ok) {
      const dados = await respostaAlteracoes.json();
      if (dados.alteracoes && dados.alteracoes.length > 0) {
        await aplicarAlteracoes(dados.alteracoes, dados.cursor);
      }
    }
  } catch (erro) {
    console.error('Erro na sincronização em segundo plano:', erro);
  }
}

// Ouvir o evento de Background Sync (se suportado pelo browser)
self.addEventListener('sync', (evento) => {
  if (evento.tag === 'sincronizar-sugestoes') {
    evento.waitUntil(sincronizarTudo());
  }
});

// --- INTERCEPTAÇÃO DE FETCH ---

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

// --- COMUNICAÇÃO COM A PÁGINA ---

self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'ativar') {
    self.skipWaiting();
  } else if (evento.data?.tipo === 'sincronizar') {
    evento.waitUntil(sincronizarTudo());
  }
});