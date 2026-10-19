import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarToken, exigirToken } from './autenticacao.js';

const app = express();
const porta = 3000;
const caminhoPublico = fileURLToPath(new URL('./public/', import.meta.url));
const caminhoSugestoes = fileURLToPath(new URL('./dados/sugestoes.json', import.meta.url));
const caminhoOpenApi = fileURLToPath(new URL('../sugestoes.openapi.yaml', import.meta.url));
const sugestoes = JSON.parse(readFileSync(caminhoSugestoes, 'utf8'));

app.disable('x-powered-by');
app.use(express.json());

app.post('/v2/tokens', criarToken);

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
