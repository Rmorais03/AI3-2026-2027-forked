const nomeBD = 'sugestoes-bd';

export function abrirBD() {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(nomeBD, 2);

    pedido.onupgradeneeded = (evento) => {
      const bd = pedido.result;
      const tx = pedido.transaction;

      let sugestoesStore;
      if (!bd.objectStoreNames.contains('sugestoes')) {
        sugestoesStore = bd.createObjectStore('sugestoes', { keyPath: 'id' });
        sugestoesStore.createIndex('porEstado', 'estado');
        sugestoesStore.createIndex('porData', 'dataCriacao');
      }

      let pendentesStore;
      if (!bd.objectStoreNames.contains('pendentes')) {
        pendentesStore = bd.createObjectStore('pendentes', { keyPath: 'idLocal', autoIncrement: true });
      } else {
        pendentesStore = tx.objectStore('pendentes');
      }

      if (!pendentesStore.indexNames.contains('porUtilizador')) {
        pendentesStore.createIndex('porUtilizador', 'utilizador');
      }

      if (!bd.objectStoreNames.contains('meta')) {
        bd.createObjectStore('meta', { keyPath: 'chave' });
      }

      // Migração de pendentes antigas (versão 1 para 2)
      if (evento.oldVersion < 2) {
        const cursorRequest = pendentesStore.openCursor();
        cursorRequest.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const p = cursor.value;
            if (!p.chave) {
              p.chave = crypto.randomUUID();
              p.tentativas = p.tentativas ?? 0;
              p.ultimaTentativa = p.ultimaTentativa ?? null;
              cursor.update(p);
            }
            cursor.continue();
          }
        };
      }
    };

    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function transacao(lojas, modo, executar) {
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = bd.transaction(lojas, modo);
    } catch (erro) {
      bd.close();
      reject(erro);
      return;
    }
    let resultado;
    tx.oncomplete = () => {
      bd.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      bd.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      bd.close();
      reject(tx.error ?? new Error('A transação foi cancelada.'));
    };
    try {
      executar(tx, (valor) => { resultado = valor; });
    } catch (erro) {
      tx.abort();
      reject(erro);
    }
  });
}

export function substituirSugestoes(lista) {
  return transacao(['sugestoes', 'meta'], 'readwrite', (tx) => {
    const loja = tx.objectStore('sugestoes');
    loja.clear();
    for (const sugestao of lista) loja.put(sugestao);

    const meta = tx.objectStore('meta');
    const pedido = meta.get('proprietario');
    pedido.onsuccess = () => {
      if (pedido.result) {
        meta.put({ ...pedido.result, atualizadoEm: new Date().toISOString() });
      }
    };
  });
}

export function lerSugestoes(ordenacao) {
  return transacao(['sugestoes'], 'readonly', (tx, guardarResultado) => {
    const itens = [];
    const indice = ordenacao === 'estado' ? 'porEstado' : 'porData';
    const sentido = ordenacao === 'estado' ? 'next' : 'prev';
    const pedido = tx.objectStore('sugestoes').index(indice).openCursor(null, sentido);
    pedido.onsuccess = () => {
      const cursor = pedido.result;
      if (cursor) {
        itens.push(cursor.value);
        cursor.continue();
      } else {
        guardarResultado(itens);
      }
    };
  });
}

export function adicionarSugestao(sugestao) {
  return transacao(['sugestoes'], 'readwrite', (tx) => {
    tx.objectStore('sugestoes').put(sugestao);
  });
}

export function lerProprietario() {
  return transacao(['meta'], 'readonly', (tx, guardarResultado) => {
    const pedido = tx.objectStore('meta').get('proprietario');
    pedido.onsuccess = () => guardarResultado(pedido.result ?? null);
  });
}

export function guardarProprietario(sessao) {
  return transacao(['meta'], 'readwrite', (tx) => {
    const meta = tx.objectStore('meta');
    const pedido = meta.get('proprietario');
    pedido.onsuccess = () => {
      const anterior = pedido.result;
      meta.put({
        chave: 'proprietario',
        utilizador: sessao.utilizador,
        nome: sessao.nome,
        papel: sessao.papel,
        expiracao: sessao.expiracao,
        atualizadoEm: anterior?.utilizador === sessao.utilizador && anterior.atualizadoEm
          ? anterior.atualizadoEm
          : new Date().toISOString()
      });
    };
  });
}

export function acrescentarPendente(dados, utilizador) {
  return transacao(['pendentes'], 'readwrite', (tx, guardarResultado) => {
    const pedido = tx.objectStore('pendentes').add({
      utilizador,
      titulo: dados.titulo,
      descricao: dados.descricao,
      categoria: dados.categoria,
      criadaEm: new Date().toISOString(),
      erro: null,
      chave: crypto.randomUUID(), // Chave de idempotência única para cada pendente
      tentativas: 0,
      ultimaTentativa: null
    });
    pedido.onsuccess = () => guardarResultado(pedido.result);
  });
}

export function lerPendentes() {
  return transacao(['pendentes'], 'readonly', (tx, guardarResultado) => {
    const pedido = tx.objectStore('pendentes').getAll();
    pedido.onsuccess = () => guardarResultado(pedido.result);
  });
}

// Nova função para ler pendentes filtradas por utilizador usando o índice
export function lerPendentesDe(utilizador) {
  return transacao(['pendentes'], 'readonly', (tx, guardarResultado) => {
    const indice = tx.objectStore('pendentes').index('porUtilizador');
    const pedido = indice.getAll(utilizador);
    pedido.onsuccess = () => guardarResultado(pedido.result);
  });
}

export function marcarErro(idLocal, mensagem) {
  return transacao(['pendentes'], 'readwrite', (tx) => {
    const loja = tx.objectStore('pendentes');
    const pedido = loja.get(idLocal);
    pedido.onsuccess = () => {
      if (pedido.result) loja.put({ ...pedido.result, erro: mensagem });
    };
  });
}

// Nova função para registar tentativa de envio (Backoff / Retry)
export function registarTentativa(idLocal) {
  return transacao(['pendentes'], 'readwrite', (tx) => {
    const loja = tx.objectStore('pendentes');
    const pedido = loja.get(idLocal);
    pedido.onsuccess = () => {
      if (pedido.result) {
        const p = pedido.result;
        loja.put({
          ...p,
          tentativas: (p.tentativas || 0) + 1,
          ultimaTentativa: new Date().toISOString()
        });
      }
    };
  });
}

export function descartarPendente(idLocal) {
  return transacao(['pendentes'], 'readwrite', (tx) => {
    tx.objectStore('pendentes').delete(idLocal);
  });
}

export function confirmarPendente(idLocal, sugestao) {
  return transacao(['pendentes', 'sugestoes'], 'readwrite', (tx) => {
    tx.objectStore('pendentes').delete(idLocal);
    tx.objectStore('sugestoes').put(sugestao);
  });
}

// Gestão do Cursor de Sincronização
export function lerCursor() {
  return transacao(['meta'], 'readonly', (tx, guardarResultado) => {
    const pedido = tx.objectStore('meta').get('cursor');
    pedido.onsuccess = () => guardarResultado(pedido.result?.valor ?? 0);
  });
}

export function aplicarAlteracoes(alteracoes, novoCursor) {
  return transacao(['sugestoes', 'meta'], 'readwrite', (tx) => {
    const loja = tx.objectStore('sugestoes');
    for (const item of alteracoes) {
      loja.put(item);
    }
    const meta = tx.objectStore('meta');
    meta.put({ chave: 'cursor', valor: novoCursor });
  });
}

export function limparBD() {
  return transacao(['sugestoes', 'pendentes', 'meta'], 'readwrite', (tx) => {
    for (const loja of ['sugestoes', 'pendentes', 'meta']) {
      tx.objectStore(loja).clear();
    }
  });
}