import { guardarConfiguracoes, lerConfiguracoes } from './configuracoes.js';

const formulario = document.querySelector('#formulario-entrada');
const campoUtilizador = document.querySelector('#utilizador');
const campoPalavraPasse = document.querySelector('#palavra-passe');
const botaoEntrar = document.querySelector('#botao-entrar');
const areaEntrada = document.querySelector('#area-entrada');
const areaSessao = document.querySelector('#area-sessao');
const mensagem = document.querySelector('#mensagem');
const textoMensagem = document.querySelector('#mensagem-texto');
const nomeUtilizador = document.querySelector('#nome-utilizador');
const papelUtilizador = document.querySelector('#papel-utilizador');
const horaExpiracao = document.querySelector('#hora-expiracao');
const tempoRestante = document.querySelector('#tempo-restante');
const botaoSugestoes = document.querySelector('#botao-sugestoes');
const botaoTerminar = document.querySelector('#botao-terminar');
const listaSugestoes = document.querySelector('#lista-sugestoes');
const areaNovaSugestao = document.querySelector('#area-nova-sugestao');
const formularioSugestao = document.querySelector('#formulario-sugestao');
const campoTitulo = document.querySelector('#sugestao-titulo');
const campoDescricao = document.querySelector('#sugestao-descricao');
const campoCategoria = document.querySelector('#sugestao-categoria');
const botaoSubmeter = document.querySelector('#botao-submeter');
const estadoSugestao = document.querySelector('#estado-sugestao');
const formularioConfiguracoes = document.querySelector('#formulario-configuracoes');
const campoTema = document.querySelector('#configuracao-tema');
const campoOrdenacao = document.querySelector('#configuracao-ordenacao');

const chaveRascunho = 'rascunhoSugestao';
const ordemEstados = ['submetida', 'em_analise', 'aceite', 'rejeitada', 'resolvida'];

// O token está no cookie HttpOnly: o cliente não o guarda nem o consegue ler.
let instanteExpiracao = null;
let temporizador = null;
let configuracoes = lerConfiguracoes();
let sugestoes = [];

function apresentarMensagem(texto) {
  textoMensagem.textContent = texto;
  mensagem.hidden = texto.length === 0;
}

function formatarTempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

// Configurações (localStorage)

function aplicarConfiguracoes() {
  document.documentElement.dataset.tema = configuracoes.tema;
  campoTema.value = configuracoes.tema;
  campoOrdenacao.value = configuracoes.ordenacao;
  apresentarSugestoes();
}

formularioConfiguracoes.addEventListener('change', () => {
  configuracoes = { tema: campoTema.value, ordenacao: campoOrdenacao.value };
  guardarConfiguracoes(configuracoes);
  aplicarConfiguracoes();
});

// Rascunho (sessionStorage)

function guardarRascunho() {
  try {
    sessionStorage.setItem(chaveRascunho, JSON.stringify({
      titulo: campoTitulo.value,
      descricao: campoDescricao.value,
      categoria: campoCategoria.value
    }));
  } catch {
    // Sem sessionStorage, o rascunho apenas não é guardado.
  }
}

function reporRascunho() {
  formularioSugestao.reset();

  // O valor pode ter sido mexido à mão, por isso cada campo é confirmado antes de ser usado.
  let rascunho;
  try {
    rascunho = JSON.parse(sessionStorage.getItem(chaveRascunho));
  } catch {
    rascunho = null;
  }
  if (!rascunho || typeof rascunho !== 'object') return;

  if (typeof rascunho.titulo === 'string') campoTitulo.value = rascunho.titulo;
  if (typeof rascunho.descricao === 'string') campoDescricao.value = rascunho.descricao;
  if (Array.from(campoCategoria.options).some((opcao) => opcao.value === rascunho.categoria)) {
    campoCategoria.value = rascunho.categoria;
  }
}

function apagarRascunho() {
  try {
    sessionStorage.removeItem(chaveRascunho);
  } catch {
    // Sem sessionStorage, não há rascunho para apagar.
  }
  formularioSugestao.reset();
}

// Guarda a cada alteração. O evento input também apanha a mudança no select.
formularioSugestao.addEventListener('input', guardarRascunho);

// Sessão (cookie)

function terminarSessao(texto = '') {
  instanteExpiracao = null;
  if (temporizador !== null) {
    window.clearInterval(temporizador);
    temporizador = null;
  }

  // O rascunho é de quem saiu; não deve aparecer a quem entrar a seguir.
  apagarRascunho();
  estadoSugestao.textContent = '';
  formulario.reset();
  sugestoes = [];
  listaSugestoes.replaceChildren();
  areaNovaSugestao.hidden = true;
  areaSessao.hidden = true;
  areaEntrada.hidden = false;
  apresentarMensagem(texto);
}

function atualizarTempoRestante() {
  const segundos = Math.ceil((instanteExpiracao - Date.now()) / 1000);
  if (segundos <= 0) {
    terminarSessao('Sessão expirada. É necessária nova autenticação.');
    return;
  }

  tempoRestante.textContent = formatarTempo(segundos);
}

function iniciarSessao(sessao) {
  const expiracao = Date.parse(sessao?.expiracao);
  if (
    typeof sessao?.nome !== 'string' ||
    !['aluno', 'servicos'].includes(sessao.papel) ||
    Number.isNaN(expiracao)
  ) {
    terminarSessao('O servidor não devolveu os dados de sessão esperados.');
    return;
  }

  instanteExpiracao = expiracao;
  nomeUtilizador.textContent = sessao.nome;
  papelUtilizador.textContent = sessao.papel;
  horaExpiracao.textContent = new Date(instanteExpiracao).toLocaleTimeString('pt-PT');
  botaoSugestoes.textContent = sessao.papel === 'servicos'
    ? 'Todas as sugestões'
    : 'As minhas sugestões';

  areaNovaSugestao.hidden = sessao.papel !== 'aluno';
  if (sessao.papel === 'aluno') reporRascunho();

  apresentarMensagem('');
  areaEntrada.hidden = true;
  areaSessao.hidden = false;
  if (temporizador !== null) window.clearInterval(temporizador);
  atualizarTempoRestante();
  temporizador = window.setInterval(atualizarTempoRestante, 1000);
}

async function lerRespostaJson(resposta) {
  try {
    return await resposta.json();
  } catch {
    throw new Error('O servidor devolveu uma resposta que não é JSON válido.');
  }
}

// Ao abrir a página, o browser envia o cookie sessao (se existir) em GET /v2/sessao.
async function verificarSessao() {
  // Se o servidor falhar, não se sabe se a sessão terminou, por isso só se mostra
  // o erro. Assim o rascunho não se perde.
  let resposta;
  try {
    resposta = await fetch('/v2/sessao');
  } catch {
    apresentarMensagem('Não foi possível contactar o servidor. Recarregue a página para tentar novamente.');
    return;
  }

  // 401: não há cookie ou já expirou, por isso mostra-se o formulário de entrada.
  if (resposta.status === 401) {
    terminarSessao();
    return;
  }

  try {
    const dados = await lerRespostaJson(resposta);
    if (!resposta.ok) {
      apresentarMensagem(dados.mensagem ?? 'Não foi possível obter a sessão.');
      return;
    }
    iniciarSessao(dados);
  } catch (erro) {
    apresentarMensagem(erro.message);
  }
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  apresentarMensagem('');
  botaoEntrar.disabled = true;

  let resposta;
  try {
    resposta = await fetch('/v2/sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utilizador: campoUtilizador.value,
        palavraPasse: campoPalavraPasse.value
      })
    });
  } catch {
    apresentarMensagem('Não foi possível contactar o servidor. Verifique a ligação e tente novamente.');
    botaoEntrar.disabled = false;
    return;
  }

  let dados;
  try {
    dados = await lerRespostaJson(resposta);
  } catch (erro) {
    apresentarMensagem(erro.message);
    botaoEntrar.disabled = false;
    return;
  }

  botaoEntrar.disabled = false;
  if (!resposta.ok) {
    apresentarMensagem(dados.mensagem ?? 'Não foi possível iniciar sessão.');
    return;
  }

  campoPalavraPasse.value = '';
  iniciarSessao(dados);
});

botaoTerminar.addEventListener('click', async () => {
  botaoTerminar.disabled = true;
  try {
    // O cookie é HttpOnly: o JavaScript não o consegue apagar, tem de ser o servidor.
    const resposta = await fetch('/v2/sessao', { method: 'DELETE' });
    if (resposta.status !== 204) {
      apresentarMensagem('Não foi possível terminar a sessão.');
      return;
    }
    terminarSessao();
  } catch {
    apresentarMensagem('Não foi possível contactar o servidor. A sessão não foi terminada.');
  } finally {
    botaoTerminar.disabled = false;
  }
});

// O browser junta o cookie sessao ao pedido; não é preciso cabeçalho Authorization.
export async function pedidoAutenticado(url, opcoes = {}) {
  const resposta = await fetch(url, opcoes);

  if (resposta.status === 401) {
    terminarSessao('Sessão expirada. É necessária nova autenticação.');
    return null;
  }
  return resposta;
}

// Sugestões

function ordenarSugestoes(itens) {
  const maisRecentePrimeiro = (a, b) => Date.parse(b.dataCriacao) - Date.parse(a.dataCriacao);
  if (configuracoes.ordenacao === 'estado') {
    return [...itens].sort((a, b) =>
      ordemEstados.indexOf(a.estado) - ordemEstados.indexOf(b.estado) || maisRecentePrimeiro(a, b)
    );
  }
  return [...itens].sort(maisRecentePrimeiro);
}

function apresentarSugestoes() {
  listaSugestoes.replaceChildren();

  for (const sugestao of ordenarSugestoes(sugestoes)) {
    const item = document.createElement('li');
    item.className = 'item-sugestao';

    const titulo = document.createElement('h3');
    titulo.textContent = sugestao.titulo;

    const categoria = document.createElement('p');
    categoria.textContent = `Categoria: ${sugestao.categoria}`;

    const estado = document.createElement('p');
    estado.textContent = `Estado: ${sugestao.estado}`;

    const data = document.createElement('p');
    data.textContent = `Criada em: ${new Date(sugestao.dataCriacao).toLocaleString('pt-PT')}`;

    item.append(titulo, categoria, estado, data);
    listaSugestoes.append(item);
  }
}

async function carregarSugestoes() {
  const resposta = await pedidoAutenticado('/v2/sugestoes');
  if (!resposta) return;

  const dados = await lerRespostaJson(resposta);
  if (!resposta.ok) {
    apresentarMensagem(dados.mensagem ?? 'Não foi possível obter as sugestões.');
    return;
  }

  sugestoes = dados.itens;
  apresentarSugestoes();
}

botaoSugestoes.addEventListener('click', async () => {
  apresentarMensagem('');
  try {
    await carregarSugestoes();
  } catch (erro) {
    apresentarMensagem(`Não foi possível obter as sugestões: ${erro.message}`);
  }
});

formularioSugestao.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  apresentarMensagem('');
  estadoSugestao.textContent = '';
  botaoSubmeter.disabled = true;

  try {
    const resposta = await pedidoAutenticado('/v2/sugestoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: campoTitulo.value,
        descricao: campoDescricao.value,
        categoria: campoCategoria.value
      })
    });
    if (!resposta) return;

    const dados = await lerRespostaJson(resposta);
    if (resposta.status !== 201) {
      const detalhes = Array.isArray(dados.detalhes)
        ? dados.detalhes.map((detalhe) => `${detalhe.campo}: ${detalhe.problema}`).join(' ')
        : '';
      apresentarMensagem(`${dados.mensagem ?? 'Não foi possível criar a sugestão.'} ${detalhes}`.trim());
      return;
    }

    apagarRascunho();
    estadoSugestao.textContent = `Sugestão «${dados.titulo}» criada com o número ${dados.id}.`;
    await carregarSugestoes();
  } catch (erro) {
    apresentarMensagem(`Não foi possível criar a sugestão: ${erro.message}`);
  } finally {
    botaoSubmeter.disabled = false;
  }
});

// As configurações aplicam-se logo, mesmo antes de se saber se há sessão.
aplicarConfiguracoes();
verificarSessao();
