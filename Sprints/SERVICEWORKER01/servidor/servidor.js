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
const categoriasPublicas = [
  { codigo: 'instalacoes', descricao: 'Instalações e espaços da escola.' },
  { codigo: 'ensino', descricao: 'Ensino e aprendizagem.' },
  { codigo: 'servicos', descricao: 'Serviços de apoio aos estudantes.' },
  { codigo: 'atividades', descricao: 'Atividades académicas e culturais.' },
  { codigo: 'outra', descricao: 'Outras sugestões.' }
];
const categorias = categoriasPublicas.map(({ codigo }) => codigo);

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

function validarTexto(valor, minimo, maximo) {
  if (typeof valor !== 'string') return false;
  const comprimento = Array.from(valor).length;
  return comprimento >= minimo && comprimento <= maximo;
}

app.post('/v2/sugestoes', exigirToken, exigirPapel('aluno'), (req, res) => {
  res.set('Cache-Control', 'no-store');

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

  const agora = new Date().toISOString();
  const sugestao = {
    id: Math.max(0, ...sugestoes.map((existente) => existente.id)) + 1,
    titulo: corpo.titulo,
    descricao: corpo.descricao,
    categoria: corpo.categoria,
    // o número vem do token validado, nunca do corpo enviado pelo cliente.
    numeroAluno: req.utilizador.sub,
    estado: 'submetida',
    dataCriacao: agora,
    dataAtualizacao: agora,
    dataResolucao: null
  };
  sugestoes.push(sugestao);

  res.set('Location', `/v2/sugestoes/${sugestao.id}`);
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

app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);

  res.set('Cache-Control', 'no-store');
  if (erro?.type === 'entity.parse.failed') {
    return res.status(400).json({
      codigo: 400,
      mensagem: 'O corpo do pedido não contém JSON válido.'
    });
  }

  console.error('Erro interno ao processar o pedido:', erro);
  return res.status(500).json({
    codigo: 500,
    mensagem: 'Ocorreu um erro interno.'
  });
});

app.listen(porta, () => {
  console.log(`Servidor disponível em http://localhost:${porta}`);
});
