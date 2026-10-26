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

let tokenSessao = null;
let instanteExpiracao = null;
let temporizador = null;

export function descodificarPayload(token) {
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) {
    throw new Error('O token não tem três partes válidas.');
  }

  const base64 = partes[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(partes[1].length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(base64), (carater) => carater.charCodeAt(0));
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(json);
}

function apresentarMensagem(texto) {
  textoMensagem.textContent = texto;
  mensagem.hidden = texto.length === 0;
}

function formatarTempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

function terminarSessao(texto = '') {
  tokenSessao = null;
  instanteExpiracao = null;
  if (temporizador !== null) {
    window.clearInterval(temporizador);
    temporizador = null;
  }

  formulario.reset();
  listaSugestoes.replaceChildren();
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

function iniciarSessao(dadosToken) {
  let payload;
  try {
    payload = descodificarPayload(dadosToken.token);
  } catch {
    apresentarMensagem('O servidor devolveu um token que não pode ser interpretado.');
    return;
  }

  if (
    typeof payload.nome !== 'string' ||
    !['aluno', 'servicos'].includes(payload.papel) ||
    !Number.isInteger(payload.exp) ||
    !Number.isInteger(dadosToken.expiraEm) ||
    dadosToken.expiraEm <= 0
  ) {
    apresentarMensagem('O servidor não devolveu os dados de sessão esperados.');
    return;
  }

  tokenSessao = dadosToken.token;
  instanteExpiracao = Math.min(
    payload.exp * 1000,
    Date.now() + dadosToken.expiraEm * 1000
  );
  nomeUtilizador.textContent = payload.nome;
  papelUtilizador.textContent = payload.papel;
  horaExpiracao.textContent = new Date(instanteExpiracao).toLocaleTimeString('pt-PT');
  botaoSugestoes.textContent = payload.papel === 'servicos'
    ? 'Todas as sugestões'
    : 'As minhas sugestões';

  apresentarMensagem('');
  areaEntrada.hidden = true;
  areaSessao.hidden = false;
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

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  apresentarMensagem('');
  botaoEntrar.disabled = true;

  let resposta;
  try {
    resposta = await fetch('/v2/tokens', {
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
  if (resposta.status === 400 || resposta.status === 401) {
    apresentarMensagem(dados.mensagem);
    return;
  }
  if (!resposta.ok) {
    apresentarMensagem(dados.mensagem ?? 'Não foi possível iniciar sessão.');
    return;
  }
  if (dados.tipo !== 'Bearer' || typeof dados.token !== 'string') {
    apresentarMensagem('O servidor devolveu uma resposta de autenticação inválida.');
    return;
  }

  campoPalavraPasse.value = '';
  iniciarSessao(dados);
});

export async function pedidoAutenticado(url) {
  if (!tokenSessao) {
    terminarSessao('Sessão expirada. É necessária nova autenticação.');
    return null;
  }

  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${tokenSessao}` }
  });

  if (resposta.status === 401) {
    terminarSessao('Sessão expirada. É necessária nova autenticação.');
    return null;
  }
  return resposta;
}

function apresentarSugestoes(itens) {
  listaSugestoes.replaceChildren();

  for (const sugestao of itens) {
    const item = document.createElement('li');
    item.className = 'item-sugestao';

    const titulo = document.createElement('h3');
    titulo.textContent = sugestao.titulo;

    const categoria = document.createElement('p');
    categoria.textContent = `Categoria: ${sugestao.categoria}`;

    const estado = document.createElement('p');
    estado.textContent = `Estado: ${sugestao.estado}`;

    item.append(titulo, categoria, estado);
    listaSugestoes.append(item);
  }
}

botaoSugestoes.addEventListener('click', async () => {
  apresentarMensagem('');
  try {
    const resposta = await pedidoAutenticado('/v2/sugestoes');
    if (!resposta) return;

    const dados = await lerRespostaJson(resposta);
    if (!resposta.ok) {
      apresentarMensagem(dados.mensagem ?? 'Não foi possível obter as sugestões.');
      return;
    }

    apresentarSugestoes(dados.itens);
  } catch (erro) {
    apresentarMensagem(`Não foi possível obter as sugestões: ${erro.message}`);
  }
});

botaoTerminar.addEventListener('click', () => terminarSessao());
