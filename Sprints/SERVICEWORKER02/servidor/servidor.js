import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  criarSessao,
  criarToken,
  enviarErro,
  exigirPapel,
  exigirToken,
  obterSessao,
  terminarSessao
} from './autenticacao.js';

const app = express();
const porta = 3000;
const caminhoPublico = fileURLToPath(new URL('./public/', import.meta.url));
const caminhoSugestoes = fileURLToPath(new URL('./dados/sugestoes.json', import.meta.url));
const caminhoOpenApi = fileURLToPath(new URL('../sugestoes.openapi.yaml', import.meta.url));
const sugestoes = JSON.parse(readFileSync(caminhoSugestoes, 'utf8'));

// Atribuir versão inicial às sugestões já existentes no JSON caso não venham com ela
sugestoes.forEach((s, index) => {
  if (!s.versao) s.versao = index + 1;
});

const categoriasPublicas = [
  { codigo: 'instalacoes', descricao: 'Instalações e espaços da escola.' },
  { codigo: 'ensino', descricao: 'Ensino e aprendizagem.' },
  { codigo: 'servicos', descricao: 'Serviços de apoio aos estudantes.' },
  { codigo: 'atividades', descricao: 'Atividades académicas e culturais.' },
  { codigo: 'outra', descricao: 'Outras sugestões.' }
];
const categorias = categoriasPublicas.map(({ codigo }) => codigo);

let contadorVersao = sugestoes.length;

// Cache de idempotência em memória (válida por 24h)
const idempotenciaCache = new Map();
const regexUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.disable('x-powered-by');
app.use(express.json());

app.post('/v2/tokens', criarToken);

app.post('/v2/sessao', criarSessao);
app.get('/v2/sessao', exigirToken, obterSessao);
app.delete('/v2/sessao', terminarSessao);

app.get('/v2/categorias', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  return res.json(categoriasPublicas);
});

app.get('/v2/sugestoes', exigirToken, (req, res) => {
  const itens = req.utilizador.papel === 'aluno'
    ? sugestoes.filter((sugestao) => sugestao.numeroAluno === req.utilizador.sub)
    : sugestoes;

  res.set('Cache-Control', 'private, no-cache');
  return res.json({
    pagina: 1,
    tamanhoPagina: 20,
    total: itens.length,
    itens
  });
});

app.get('/v2/sugestoes/alteracoes', exigirToken, (req, res) => {
  res.set('Cache-Control', 'private, no-store');

  const desdeStr = req.query.desde;
  const desde = Number(desdeStr);

  if (desdeStr === undefined || !Number.isInteger(desde) || desde < 0) {
    return enviarErro(res, 400, 'O parâmetro desde é obrigatório e tem de ser um inteiro maior ou igual a 0.');
  }

  const utilizadorAtual = req.utilizador.sub;
  const papel = req.utilizador.papel;

  const alteracoes = sugestoes.filter((s) => {
    const pertenceAoUtilizador = papel === 'servicos' || s.numeroAluno === utilizadorAtual;
    return pertenceAoUtilizador && s.versao > desde;
  });

  alteracoes.sort((a, b) => a.versao - b.versao);
  const cursor = alteracoes.length > 0 ? alteracoes[alteracoes.length - 1].versao : desde;

  return res.json({
    alteracoes,
    cursor
  });
});

function validarTexto(valor, minimo, maximo) {
  if (typeof valor !== 'string') return false;
  const comprimento = Array.from(valor).length;
  return comprimento >= minimo && comprimento <= maximo;
}

app.post('/v2/sugestoes', exigirToken, exigirPapel('aluno'), (req, res) => {
  res.set('Cache-Control', 'no-store');

  // 1. Simulação de erro 503
  const simular503 = parseInt(process.env.SIMULAR_503 || '0', 10);
  if (simular503 > 0) {
    process.env.SIMULAR_503 = simular503 - 1;
    res.set('Retry-After', '2');
    return res.status(503).json({
      codigo: 503,
      mensagem: 'Serviço temporariamente indisponível para testes.'
    });
  }

  // 2. Validação da Idempotency-Key
  const idempotencyKey = req.headers['idempotency-key'];
  const utilizadorSub = req.utilizador.sub;

  if (idempotencyKey) {
    if (!regexUUID.test(idempotencyKey)) {
      return enviarErro(res, 400, 'O cabeçalho Idempotency-Key tem de ser um UUID válido.');
    }

    const cacheKey = `${utilizadorSub}:${idempotencyKey}`;
    const registoAnterior = idempotenciaCache.get(cacheKey);

    if (registoAnterior) {
      const corpoIgual = JSON.stringify(registoAnterior.corpoPedido) === JSON.stringify(req.body);
      if (!corpoIgual) {
        return res.status(409).json({
          codigo: 409,
          mensagem: 'Conflito: A chave de idempotência já foi utilizada com um corpo de pedido diferente.'
        });
      }

      res.set('Idempotent-Replayed', 'true');
      if (registoAnterior.location) {
        res.set('Location', registoAnterior.location);
      }
      return res.status(registoAnterior.status).json(registoAnterior.resposta);
    }
  }

  // 3. Validação do corpo
  const corpo = req.body;
  const detalhes = [];
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    detalhes.push({ campo: 'body', problema: 'Tem de ser um objeto JSON.' });
  } else {
    if (!validarTexto(corpo.titulo, 10, 120)) {
      detalhes.push({ campo: 'titulo', problema: 'Tem de ter entre 10 e 120 caracteres.' });
    }
    if (!validarTexto(corpo.descricao, 20, 2000)) {
      detalhes.push({ campo: 'descricao', problema: 'Tem de ter entre 20 e 2000 caracteres.' });
    }
    if (!categorias.includes(corpo.categoria)) {
      detalhes.push({ campo: 'categoria', problema: `Tem de ser um dos valores: ${categorias.join(', ')}.` });
    }
  }

  if (detalhes.length > 0) {
    return enviarErro(res, 400, 'O corpo do pedido não cumpre o schema SugestaoNova.', detalhes);
  }

  // 4. Criar sugestão
  const agora = new Date().toISOString();
  const sugestao = {
    id: Math.max(0, ...sugestoes.map((existente) => existente.id)) + 1,
    titulo: corpo.titulo,
    descricao: corpo.descricao,
    categoria: corpo.categoria,
    numeroAluno: utilizadorSub,
    estado: 'submetida',
    dataCriacao: agora,
    dataAtualizacao: agora,
    dataResolucao: null,
    versao: ++contadorVersao
  };
  sugestoes.push(sugestao);

  const locationUrl = `/v2/sugestoes/${sugestao.id}`;

  // 5. Simular perda de resposta
  const simularPerda = process.env.SIMULAR_PERDA_RESPOSTA === '1';
  if (simularPerda && idempotencyKey) {
    idempotenciaCache.set(`${utilizadorSub}:${idempotencyKey}`, {
      corpoPedido: corpo,
      status: 201,
      resposta: sugestao,
      location: locationUrl
    });
    return req.socket.destroy();
  }

  if (idempotencyKey) {
    idempotenciaCache.set(`${utilizadorSub}:${idempotencyKey}`, {
      corpoPedido: corpo,
      status: 201,
      resposta: sugestao,
      location: locationUrl
    });
  }

  res.set('Location', locationUrl);
  return res.status(201).json(sugestao);
});

app.get('/v2/openapi.yaml', (req, res, next) => {
  try {
    res.type('application/yaml').send(readFileSync(caminhoOpenApi, 'utf8'));
  } catch (erro) {
    next(erro);
  }
});

app.use(express.static(caminhoPublico));

app.use((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(404).json({
    codigo: 404,
    mensagem: 'O recurso pedido não existe.'
  });
});

app.listen(porta, () => {
  console.log(`Servidor disponível em http://localhost:${porta}`);
});
