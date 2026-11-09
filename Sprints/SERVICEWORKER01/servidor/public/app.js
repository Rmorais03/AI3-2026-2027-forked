import { guardarConfiguracoes, lerConfiguracoes } from './configuracoes.js';
import {
  acrescentarPendente, adicionarSugestao, descartarPendente, guardarProprietario,
  lerPendentes, lerProprietario, lerSugestoes, limparBD, substituirSugestoes
} from './bd.js';
import { cancelarEnvioPendentes, enviarPendentes } from './pendentes.js';

const formulario = document.querySelector('#formulario-entrada');
const campoUtilizador = document.querySelector('#utilizador');
const campoPalavraPasse = document.querySelector('#palavra-passe');
const botaoEntrar = document.querySelector('#botao-entrar');
const areaEntrada = document.querySelector('#area-entrada');
const areaSessao = document.querySelector('#area-sessao');
const areaVerificacao = document.querySelector('#area-verificacao');
const areaSemLigacao = document.querySelector('#area-sem-ligacao');
const areaConfiguracoes = document.querySelector('#area-configuracoes');
const estadoLigacao = document.querySelector('#estado-ligacao');
const avisoSemLigacao = document.querySelector('#aviso-sem-ligacao');
const tituloSessao = document.querySelector('#titulo-sessao');
const dialogoPendentes = document.querySelector('#dialogo-pendentes');
const textoDialogoPendentes = document.querySelector('#texto-dialogo-pendentes');
const botaoAtualizar = document.querySelector('#botao-atualizar');
const mensagem = document.querySelector('#mensagem');
const textoMensagem = document.querySelector('#mensagem-texto');
const nomeUtilizador = document.querySelector('#nome-utilizador');
const papelUtilizador = document.querySelector('#papel-utilizador');
const horaExpiracao = document.querySelector('#hora-expiracao');
const tempoRestante = document.querySelector('#tempo-restante');
const botaoSugestoes = document.querySelector('#botao-sugestoes');
const botaoTerminar = document.querySelector('#botao-terminar');
const listaSugestoes = document.querySelector('#lista-sugestoes');
const estadoLista = document.querySelector('#estado-lista');
const copiaLocal = document.querySelector('#copia-local');
const areaNovaSugestao = document.querySelector('#area-nova-sugestao');
const formularioSugestao = document.querySelector('#formulario-sugestao');
const campoTitulo = document.querySelector('#sugestao-titulo');
const campoDescricao = document.querySelector('#sugestao-descricao');
const campoCategoria = document.querySelector('#sugestao-categoria');
const avisoCategorias = document.querySelector('#aviso-categorias');
const botaoSubmeter = document.querySelector('#botao-submeter');
const estadoSugestao = document.querySelector('#estado-sugestao');
const formularioConfiguracoes = document.querySelector('#formulario-configuracoes');
const campoTema = document.querySelector('#configuracao-tema');
const campoOrdenacao = document.querySelector('#configuracao-ordenacao');

const chaveRascunho = 'rascunhoSugestao';

let instanteExpiracao = null;
let temporizador = null;
let configuracoes = lerConfiguracoes();
let sessaoAtual = null;
let proprietarioLocal = null;
let categoriasDisponiveis = [];
let sessaoConfirmada = false;
let verificacaoAtual = 0;
let registoServiceWorker = null;
let atualizarAoMudarControlador = false;
let temporizadorCopia = null;

function apresentarMensagem(texto) {
  textoMensagem.textContent = texto;
  mensagem.hidden = texto.length === 0;
}

function atualizarIndicacaoLigacao() {
  // navigator.onLine informa sobre a rede do dispositivo, não sobre a resposta do servidor.
  const estado = document.body.dataset.estado;
  estadoLigacao.textContent = estado === 'a-verificar' ? ''
    : estado === 'sem-ligacao' ? 'Sem ligação ao servidor.'
    : navigator.onLine ? 'Rede disponível.' : 'O dispositivo indica que está sem rede.';
}

function mudarEstado(estado) {
  if (!['a-verificar', 'sem-sessao', 'com-sessao', 'sem-ligacao'].includes(estado)) {
    throw new Error(`Estado desconhecido: ${estado}`);
  }
  document.body.dataset.estado = estado;
  areaVerificacao.hidden = estado !== 'a-verificar';
  areaEntrada.hidden = estado !== 'sem-sessao';
  areaSessao.hidden = estado !== 'com-sessao';
  areaSemLigacao.hidden = estado !== 'sem-ligacao';
  areaConfiguracoes.hidden = !['com-sessao', 'sem-ligacao'].includes(estado);
  // sem ligação, não é possível pedir ao servidor que apague o cookie HttpOnly.
  botaoTerminar.disabled = estado === 'sem-ligacao';
  if (temporizadorCopia !== null) {
    window.clearTimeout(temporizadorCopia);
    temporizadorCopia = null;
  }
  if (estado === 'com-sessao') {
    areaSessao.append(areaNovaSugestao, estadoLista, listaSugestoes);
    copiaLocal.hidden = true;
  } else if (estado === 'sem-ligacao') {
    copiaLocal.hidden = true;
    void mostrarCopiaLocal();
  }
  atualizarIndicacaoLigacao();
}

function formatarTempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

function aplicarConfiguracoes() {
  document.documentElement.dataset.tema = configuracoes.tema;
  campoTema.value = configuracoes.tema;
  campoOrdenacao.value = configuracoes.ordenacao;
}

formularioConfiguracoes.addEventListener('change', async () => {
  configuracoes = { tema: campoTema.value, ordenacao: campoOrdenacao.value };
  guardarConfiguracoes(configuracoes);
  aplicarConfiguracoes();
  try {
    await apresentarSugestoesDaBD();
  } catch (erro) {
    apresentarMensagem(`Não foi possível reordenar as sugestões: ${erro.message}`);
  }
});

function guardarRascunho() {
  try {
    sessionStorage.setItem(chaveRascunho, JSON.stringify({
      titulo: campoTitulo.value,
      descricao: campoDescricao.value,
      categoria: campoCategoria.value
    }));
  } catch {
  }
}

function reporRascunho() {
  formularioSugestao.reset();

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
  }
  formularioSugestao.reset();
}

formularioSugestao.addEventListener('input', guardarRascunho);

function limparSessaoVisual() {
  sessaoAtual = null;
  instanteExpiracao = null;
  if (temporizador !== null) {
    window.clearInterval(temporizador);
    temporizador = null;
  }

  estadoSugestao.textContent = '';
  listaSugestoes.replaceChildren();
  estadoLista.textContent = '';
  areaNovaSugestao.hidden = true;
}

// a expiração conserva rascunho e dados locais para permitir retomar após nova entrada.
function expirarSessao() {
  cancelarEnvioPendentes();
  limparSessaoVisual();
  mudarEstado('sem-sessao');
  apresentarMensagem('A sessão expirou. Entre de novo.');
}

function atualizarTempoRestante() {
  const segundos = Math.ceil((instanteExpiracao - Date.now()) / 1000);
  if (segundos <= 0) {
    expirarSessao();
    return;
  }

  tempoRestante.textContent = formatarTempo(segundos);
}

function validarSessao(sessao) {
  const expiracao = Date.parse(sessao?.expiracao);
  if (
    typeof sessao?.utilizador !== 'string' ||
    typeof sessao?.nome !== 'string' ||
    !['aluno', 'servicos'].includes(sessao.papel) ||
    Number.isNaN(expiracao)
  ) {
    throw new Error('O servidor não devolveu os dados de sessão esperados.');
  }
  return expiracao;
}

function iniciarSessao(sessao) {
  const expiracao = validarSessao(sessao);
  sessaoAtual = sessao;
  sessaoConfirmada = true;
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
  mudarEstado('com-sessao');
  if (temporizador !== null) window.clearInterval(temporizador);
  atualizarTempoRestante();
  if (document.body.dataset.estado === 'com-sessao') {
    temporizador = window.setInterval(atualizarTempoRestante, 1000);
    void prepararDadosDaSessao(sessao);
  }
}

async function prepararDadosDaSessao(sessao) {
  try {
    await carregarCategorias();
    if (sessaoAtual !== sessao || document.body.dataset.estado !== 'com-sessao') return;
    await carregarSugestoes();
    if (sessaoAtual === sessao && document.body.dataset.estado === 'com-sessao') {
      await enviarPendentesDaSessao();
    }
  } catch (erro) {
    apresentarMensagem(`Não foi possível preparar os dados da sessão: ${erro.message}`);
  }
}

// ao confirmar outra conta, apagar a cópia e as pendentes antes de guardar o novo proprietário.
async function registarProprietario(sessao) {
  validarSessao(sessao);
  const proprietario = await lerProprietario();
  if (!proprietario || proprietario.utilizador !== sessao.utilizador) {
    cancelarEnvioPendentes();
    await limparBD();
  }
  await guardarProprietario(sessao);
}

async function enviarPendentesDaSessao() {
  const sessao = sessaoAtual;
  if (!sessao) return;
  try {
    const resultado = await enviarPendentes(sessao);
    if (sessaoAtual !== sessao) return;
    if (resultado.estado === 'sem-sessao') {
      limparSessaoVisual();
      mudarEstado('sem-sessao');
      apresentarMensagem(`Há ${resultado.quantidade} sugestões por enviar. Entre de novo para as enviar.`);
    } else if (resultado.estado === 'sem-ligacao') {
      avisoSemLigacao.textContent = 'Sem ligação: as sugestões pendentes continuam guardadas.';
      mudarEstado('sem-ligacao');
    } else if (resultado.estado === 'erro') {
      apresentarMensagem('Não foi possível enviar todas as sugestões pendentes.');
    }
    if (document.body.dataset.estado === 'com-sessao') await apresentarSugestoesDaBD();
  } catch (erro) {
    apresentarMensagem(`Não foi possível consultar as sugestões pendentes: ${erro.message}`);
  }
}

async function lerRespostaJson(resposta) {
  try {
    return await resposta.json();
  } catch {
    throw new Error('O servidor devolveu uma resposta que não é JSON válido.');
  }
}

// no arranque, GET /v2/sessao confirma a sessão; até à resposta mostra-se «a-verificar».
// O cookie é HttpOnly, por isso a página não o lê: o browser junta-o a este pedido e é o servidor
// que valida o token. Enquanto espera, só se vê «A verificar sessão…».
// 200 → com-sessao; 401 → sem-sessao; fetch rejeitado → sem-ligacao.
async function verificarSessao() {
  const numeroVerificacao = ++verificacaoAtual;
  apresentarMensagem('');
  mudarEstado('a-verificar');
  let resposta;
  try {
    resposta = await fetch('/v2/sessao');
  } catch {
    // sem resposta do servidor, não se sabe se a sessão ainda é válida.
    if (numeroVerificacao !== verificacaoAtual) return;
    avisoSemLigacao.textContent = 'Não é possível confirmar a sessão neste momento.';
    mudarEstado('sem-ligacao');
    return;
  }
  if (numeroVerificacao !== verificacaoAtual) return;

  // o 401 é uma resposta do servidor que confirma a ausência de sessão válida.
  if (resposta.status === 401) {
    if (sessaoConfirmada) expirarSessao();
    else {
      limparSessaoVisual();
      mudarEstado('sem-sessao');
    }
    return;
  }

  try {
    const dados = await lerRespostaJson(resposta);
    if (!resposta.ok) {
      apresentarMensagem(dados.mensagem ?? 'Não foi possível obter a sessão.');
      return;
    }
    await registarProprietario(dados);
    if (numeroVerificacao !== verificacaoAtual) return;
    iniciarSessao(dados);
  } catch (erro) {
    apresentarMensagem(erro.message);
  }
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  ++verificacaoAtual;
  apresentarMensagem('');
  botaoEntrar.disabled = true;
  botaoEntrar.textContent = 'A entrar…';

  let resposta;
  try {
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
      avisoSemLigacao.textContent = 'Sem ligação: não é possível entrar.';
      mudarEstado('sem-ligacao');
      return;
    }
    const dados = await lerRespostaJson(resposta);
    if (resposta.status === 400 || resposta.status === 401) {
      apresentarMensagem(dados.mensagem ?? 'Não foi possível iniciar sessão.');
      campoPalavraPasse.value = '';
      campoPalavraPasse.focus();
      return;
    }
    // no POST de entrada, só 200 prossegue para iniciarSessao; os restantes códigos são erro.
    if (resposta.status !== 200) {
      apresentarMensagem(dados.mensagem ?? 'Não foi possível iniciar sessão.');
      return;
    }
    await registarProprietario(dados);
    campoPalavraPasse.value = '';
    iniciarSessao(dados);
    // o foco no título orienta quem usa teclado ou leitor de ecrã após a entrada.
    tituloSessao.focus();
  } catch (erro) {
    apresentarMensagem(erro.message);
  } finally {
    botaoEntrar.disabled = false;
    botaoEntrar.textContent = 'Entrar';
  }
});

function confirmarSaida(quantidade) {
  textoDialogoPendentes.textContent = `Há ${quantidade} sugestões por enviar, que serão apagadas. Terminar sessão?`;
  return new Promise((resolve) => {
    dialogoPendentes.addEventListener('close', () => resolve(dialogoPendentes.returnValue === 'confirmar'), { once: true });
    dialogoPendentes.returnValue = 'cancelar';
    dialogoPendentes.showModal();
  });
}

// DELETE precisa do servidor para apagar o cookie HttpOnly; saída confirmada apaga dados locais.
botaoTerminar.addEventListener('click', async () => {
  botaoTerminar.disabled = true;
  let cookieApagado = false;
  try {
    const pendentes = await lerPendentes();
    if (pendentes.length > 0 && !(await confirmarSaida(pendentes.length))) return;
    cancelarEnvioPendentes();
    let resposta;
    try {
      resposta = await fetch('/v2/sessao', { method: 'DELETE' });
    } catch {
      avisoSemLigacao.textContent = 'Sem ligação: não foi possível terminar sessão.';
      mudarEstado('sem-ligacao');
      return;
    }
    if (resposta.status === 401) {
      expirarSessao();
      return;
    }
    if (resposta.status !== 204) {
      apresentarMensagem('Não foi possível terminar a sessão.');
      return;
    }
    cookieApagado = true;
    await limparBD();
    apagarRascunho();
    limparSessaoVisual();
    sessaoConfirmada = false;
    formulario.reset();
    apresentarMensagem('');
    mudarEstado('sem-sessao');
    // depois da saída, o foco regressa ao primeiro campo do formulário.
    campoUtilizador.focus();
  } catch (erro) {
    if (cookieApagado) {
      apagarRascunho();
      limparSessaoVisual();
      sessaoConfirmada = false;
      mudarEstado('sem-sessao');
      campoUtilizador.focus();
      apresentarMensagem(`A sessão terminou, mas não foi possível apagar os dados locais: ${erro.message}`);
    } else {
      apresentarMensagem(`Não foi possível consultar os dados locais: ${erro.message}`);
    }
  } finally {
    if (document.body.dataset.estado === 'com-sessao') botaoTerminar.disabled = false;
  }
});

export async function pedidoAutenticado(url, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, opcoes);
  } catch (erro) {
    avisoSemLigacao.textContent = 'Sem ligação: não foi possível concluir o pedido.';
    mudarEstado('sem-ligacao');
    throw erro;
  }

  if (resposta.status === 401) {
    expirarSessao();
    return null;
  }
  return resposta;
}

function disponibilidadeDoFormulario(disponivel) {
  for (const campo of [campoTitulo, campoDescricao, campoCategoria, botaoSubmeter]) {
    campo.disabled = !disponivel;
  }
  avisoCategorias.hidden = disponivel;
  if (!disponivel) avisoCategorias.textContent = 'Sem categorias disponíveis: não é possível criar sugestões.';
}

async function carregarCategorias() {
  let resposta;
  try {
    resposta = await fetch('/v2/categorias');
  } catch {
    if (categoriasDisponiveis.length === 0) disponibilidadeDoFormulario(false);
    if (document.body.dataset.estado === 'com-sessao') {
      avisoSemLigacao.textContent = 'Sem ligação: não foi possível obter as categorias.';
      mudarEstado('sem-ligacao');
    }
    return;
  }
  try {
    if (!resposta.ok) throw new Error('Não foi possível obter as categorias.');
    const categorias = await lerRespostaJson(resposta);
    if (!Array.isArray(categorias) || categorias.length === 0 ||
      categorias.some((item) => typeof item.codigo !== 'string' || typeof item.descricao !== 'string')) {
      throw new Error('As categorias recebidas são inválidas.');
    }
    categoriasDisponiveis = categorias;
    const escolha = document.createElement('option');
    escolha.value = '';
    escolha.textContent = 'Escolha uma categoria';
    const opcoes = categorias.map(({ codigo, descricao }) => {
      const opcao = document.createElement('option');
      opcao.value = codigo;
      opcao.textContent = descricao;
      return opcao;
    });
    const categoriaAtual = campoCategoria.value;
    campoCategoria.replaceChildren(escolha, ...opcoes);
    let categoriaRascunho = '';
    try { categoriaRascunho = JSON.parse(sessionStorage.getItem(chaveRascunho))?.categoria ?? ''; } catch {}
    campoCategoria.value = categoriaAtual || categoriaRascunho;
    disponibilidadeDoFormulario(true);
  } catch {
    if (categoriasDisponiveis.length === 0) disponibilidadeDoFormulario(false);
  }
}

function itemDaSugestao(sugestao) {
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
  return item;
}

function itemPendente(pendente) {
  const item = document.createElement('li');
  item.className = 'item-sugestao';
  const titulo = document.createElement('h3');
  titulo.textContent = pendente.titulo;
  const estado = document.createElement('p');
  estado.textContent = pendente.erro ?? 'Por enviar';
  const data = document.createElement('p');
  data.textContent = `Criada em: ${new Date(pendente.criadaEm).toLocaleString('pt-PT')}`;
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao-secundario';
  botao.textContent = 'Descartar';
  botao.addEventListener('click', async () => {
    try {
      await descartarPendente(pendente.idLocal);
      await apresentarSugestoesDaBD();
    } catch (erro) {
      apresentarMensagem(`Não foi possível descartar a sugestão: ${erro.message}`);
    }
  });
  item.append(titulo, estado, data, botao);
  return item;
}

async function apresentarSugestoesDaBD() {
  const estado = document.body.dataset.estado;
  const proprietario = estado === 'com-sessao' ? sessaoAtual : estado === 'sem-ligacao' ? proprietarioLocal : null;
  if (!proprietario) return;
  const [pendentes, sugestoes] = await Promise.all([
    lerPendentes(), lerSugestoes(configuracoes.ordenacao)
  ]);
  if (document.body.dataset.estado !== estado) return;
  listaSugestoes.replaceChildren();
  for (const pendente of pendentes.filter((item) => item.utilizador === proprietario.utilizador)) {
    listaSugestoes.append(itemPendente(pendente));
  }
  for (const sugestao of sugestoes) listaSugestoes.append(itemDaSugestao(sugestao));
  if (listaSugestoes.childElementCount === 0) {
    const vazio = document.createElement('li');
    vazio.textContent = 'Ainda não há sugestões.';
    listaSugestoes.append(vazio);
  }
}

// identificar proprietário e hora; mostrar a cópia offline só até à expiração conhecida.
async function mostrarCopiaLocal() {
  try {
    const proprietario = await lerProprietario();
    if (document.body.dataset.estado !== 'sem-ligacao') return;
    const expiracao = Date.parse(proprietario?.expiracao);
    if (!proprietario || !Number.isFinite(expiracao) || expiracao <= Date.now()) {
      proprietarioLocal = null;
      copiaLocal.hidden = true;
      return;
    }
    proprietarioLocal = proprietario;
    temporizadorCopia = window.setTimeout(() => {
      if (document.body.dataset.estado === 'sem-ligacao') {
        copiaLocal.hidden = true;
        proprietarioLocal = null;
      }
    }, expiracao - Date.now());
    const identificacao = document.createElement('p');
    identificacao.textContent = `Cópia local de ${proprietario.nome}.`;
    const hora = proprietario.atualizadoEm
      ? new Date(proprietario.atualizadoEm).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    const aviso = document.createElement('p');
    aviso.textContent = `Cópia de ${hora} — pode estar desatualizada.`;
    estadoLista.textContent = '';
    copiaLocal.replaceChildren(identificacao, aviso, areaNovaSugestao, estadoLista, listaSugestoes);
    copiaLocal.hidden = false;
    areaNovaSugestao.hidden = proprietario.papel !== 'aluno';
    if (proprietario.papel === 'aluno') reporRascunho();
    await carregarCategorias();
    await apresentarSugestoesDaBD();
  } catch (erro) {
    copiaLocal.hidden = true;
    apresentarMensagem(`Não foi possível ler a cópia local: ${erro.message}`);
  }
}

async function carregarSugestoes() {
  const sessao = sessaoAtual;
  if (!sessao) return;
  try {
    const resposta = await pedidoAutenticado('/v2/sugestoes');
    if (!resposta || sessaoAtual !== sessao) return;
    const dados = await lerRespostaJson(resposta);
    if (resposta.status !== 200) {
      apresentarMensagem(dados.mensagem ?? 'Não foi possível obter as sugestões.');
      return;
    }
    if (sessaoAtual !== sessao) return;
    if (!Array.isArray(dados.itens)) throw new Error('A lista recebida é inválida.');
    await substituirSugestoes(dados.itens);
    estadoLista.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
    await apresentarSugestoesDaBD();
  } catch (erro) {
    if (document.body.dataset.estado === 'com-sessao') {
      apresentarMensagem(`Não foi possível obter as sugestões: ${erro.message}`);
      try { await apresentarSugestoesDaBD(); } catch {}
    }
  }
}

botaoSugestoes.addEventListener('click', () => { void carregarSugestoes(); });

// a submissão passa do rascunho deste separador para uma pendente persistente.
async function guardarPendenteLocal(dados) {
  const proprietario = sessaoAtual ?? proprietarioLocal;
  const expiracao = Date.parse(proprietario?.expiracao);
  if (!proprietario || !Number.isFinite(expiracao) || expiracao <= Date.now()) {
    throw new Error('A cópia local já não tem um proprietário com sessão válida.');
  }
  await acrescentarPendente(dados, proprietario.utilizador);
  apagarRascunho();
  estadoSugestao.textContent = `Sugestão «${dados.titulo}» guardada como «Por enviar».`;
  await apresentarSugestoesDaBD();
}

formularioSugestao.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  apresentarMensagem('');
  estadoSugestao.textContent = '';
  botaoSubmeter.disabled = true;
  const dados = {
    titulo: campoTitulo.value,
    descricao: campoDescricao.value,
    categoria: campoCategoria.value
  };

  try {
    if (document.body.dataset.estado === 'sem-ligacao') {
      await guardarPendenteLocal(dados);
      return;
    }
    if (document.body.dataset.estado !== 'com-sessao') return;
    let resposta;
    try {
      resposta = await pedidoAutenticado('/v2/sugestoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
    } catch {
      // o POST pode ter sido criado antes da falha; sem idempotência, o reenvio pode duplicá-lo.
      if (document.body.dataset.estado === 'sem-ligacao') await guardarPendenteLocal(dados);
      return;
    }
    if (!resposta) return;
    const criada = await lerRespostaJson(resposta);
    if (resposta.status !== 201) {
      const detalhes = Array.isArray(criada.detalhes)
        ? criada.detalhes.map((detalhe) => `${detalhe.campo}: ${detalhe.problema}`).join(' ')
        : '';
      apresentarMensagem(`${criada.mensagem ?? 'Não foi possível criar a sugestão.'} ${detalhes}`.trim());
      return;
    }
    await adicionarSugestao(criada);
    apagarRascunho();
    estadoSugestao.textContent = `Sugestão «${criada.titulo}» criada com o número ${criada.id}.`;
    await apresentarSugestoesDaBD();
  } catch (erro) {
    apresentarMensagem(`Não foi possível guardar a sugestão: ${erro.message}`);
  } finally {
    botaoSubmeter.disabled = categoriasDisponiveis.length === 0;
  }
});

window.addEventListener('online', () => {
  atualizarIndicacaoLigacao();
  void verificarSessao();
});
window.addEventListener('offline', atualizarIndicacaoLigacao);

function mostrarAtualizacaoSeDisponivel(registo) {
  botaoAtualizar.hidden = !registo.waiting;
}

function observarInstalacao(registo, novo) {
  novo?.addEventListener('statechange', () => {
    if (novo.state === 'installed') {
      window.setTimeout(() => mostrarAtualizacaoSeDisponivel(registo), 0);
    }
  });
}

botaoAtualizar.addEventListener('click', () => {
  const emEspera = registoServiceWorker?.waiting;
  if (!emEspera) {
    botaoAtualizar.hidden = true;
    return;
  }
  botaoAtualizar.disabled = true;
  atualizarAoMudarControlador = true;
  emEspera.postMessage({ tipo: 'ativar' });
});

aplicarConfiguracoes();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (atualizarAoMudarControlador) {
      atualizarAoMudarControlador = false;
      window.location.reload();
    }
  });
  navigator.serviceWorker.register('/sw.js').then((registo) => {
    registoServiceWorker = registo;
    mostrarAtualizacaoSeDisponivel(registo);
    observarInstalacao(registo, registo.installing);
    registo.addEventListener('updatefound', () => observarInstalacao(registo, registo.installing));
  }).catch((erro) => {
    console.error('Não foi possível registar o service worker:', erro);
  });
}
mudarEstado('a-verificar');
void verificarSessao();
