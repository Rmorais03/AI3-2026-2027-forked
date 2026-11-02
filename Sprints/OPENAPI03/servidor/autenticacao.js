import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lerCookie } from './cookies.js';

const segredo = process.env.JWT_SEGREDO;
if (!segredo || segredo.length < 32) {
  throw new Error('Configuração inválida: JWT_SEGREDO é obrigatório e tem de ter pelo menos 32 caracteres.');
}

const validadeTexto = process.env.JWT_VALIDADE ?? '900';
if (!/^[1-9][0-9]*$/.test(validadeTexto) || !Number.isSafeInteger(Number(validadeTexto))) {
  throw new Error('Configuração inválida: JWT_VALIDADE tem de ser um inteiro positivo em segundos.');
}

const validade = Number(validadeTexto);
const caminhoUtilizadores = fileURLToPath(new URL('./dados/utilizadores.json', import.meta.url));
const utilizadores = JSON.parse(readFileSync(caminhoUtilizadores, 'utf8'));

if (
  !Array.isArray(utilizadores) ||
  utilizadores.length === 0 ||
  utilizadores.some((utilizador) =>
    typeof utilizador.utilizador !== 'string' ||
    typeof utilizador.nome !== 'string' ||
    !['aluno', 'servicos'].includes(utilizador.papel) ||
    typeof utilizador.hashPalavraPasse !== 'string' ||
    !utilizador.hashPalavraPasse.startsWith('$2')
  )
) {
  throw new Error('Configuração inválida: dados/utilizadores.json tem de conter utilizadores com hashes bcrypt.');
}

// Se o utilizador não existir, compara-se na mesma com o hash, para a
// resposta demorar o mesmo tempo e não se perceber que o utilizador não existe
const hashComparacaoUtilizadorInexistente = utilizadores[0].hashPalavraPasse;
const padraoUtilizador = /^(?:[0-9]{5,8}|[a-z]+\.[a-z]+)$/;

export function enviarErro(res, codigo, mensagem, detalhes) {
  const corpo = { codigo, mensagem };
  if (detalhes?.length) corpo.detalhes = detalhes;
  return res.status(codigo).json(corpo);
}

const erroCredenciaisInvalidas = {
  codigo: 401,
  mensagem: 'Utilizador ou palavra-passe inválidos.'
};

// Usada por POST /v2/tokens e POST /v2/sessao. Devolve o utilizador ou, se as
// credenciais forem inválidas, envia a resposta de erro e devolve null
async function verificarCredenciais(req, res) {
  const corpo = req.body;
  const detalhes = [];
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    detalhes.push({ campo: 'body', problema: 'Tem de ser um objeto JSON.' });
  } else {
    if (typeof corpo.utilizador !== 'string' || !padraoUtilizador.test(corpo.utilizador)) {
      detalhes.push({ campo: 'utilizador', problema: 'Tem de ser um número de aluno válido ou um identificador nome.apelido.' });
    }

    const comprimentoPalavraPasse = typeof corpo.palavraPasse === 'string'
      ? Array.from(corpo.palavraPasse).length
      : 0;
    if (typeof corpo.palavraPasse !== 'string' || comprimentoPalavraPasse < 8 || comprimentoPalavraPasse > 128) {
      detalhes.push({ campo: 'palavraPasse', problema: 'Tem de ter entre 8 e 128 caracteres.' });
    }
  }

  if (detalhes.length > 0) {
    enviarErro(res, 400, 'O corpo do pedido não cumpre o schema Credenciais.', detalhes);
    return null;
  }

  const utilizador = utilizadores.find((registo) => registo.utilizador === corpo.utilizador);
  const hash = utilizador?.hashPalavraPasse ?? hashComparacaoUtilizadorInexistente;
  const palavraPasseValida = await bcrypt.compare(corpo.palavraPasse, hash);

  if (!utilizador || !palavraPasseValida) {
    res.status(401).json(erroCredenciaisInvalidas);
    return null;
  }

  return utilizador;
}

function emitirToken(utilizador) {
  return jwt.sign(
    {
      sub: utilizador.utilizador,
      nome: utilizador.nome,
      papel: utilizador.papel
    },
    segredo,
    {
      algorithm: 'HS256',
      expiresIn: validade
    }
  );
}

function criarDadosSessao(sub, nome, papel, exp) {
  return {
    utilizador: sub,
    nome,
    papel,
    expiracao: new Date(exp * 1000).toISOString()
  };
}

export async function criarToken(req, res) {
  res.set('Cache-Control', 'no-store');

  const utilizador = await verificarCredenciais(req, res);
  if (!utilizador) return;

  return res.status(200).json({
    token: emitirToken(utilizador),
    tipo: 'Bearer',
    expiraEm: validade
  });
}

export async function criarSessao(req, res) {
  res.set('Cache-Control', 'no-store');

  const utilizador = await verificarCredenciais(req, res);
  if (!utilizador) return;

  const token = emitirToken(utilizador);
  // Vai-se buscar o exp ao próprio token para a expiração bater certo
  const { exp } = jwt.decode(token);

  res.cookie('sessao', token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/v2',
    maxAge: validade * 1000
  });

  return res.status(200).json(
    criarDadosSessao(utilizador.utilizador, utilizador.nome, utilizador.papel, exp)
  );
}

export function obterSessao(req, res) {
  res.set('Cache-Control', 'no-store');
  const { sub, nome, papel, exp } = req.utilizador;
  return res.status(200).json(criarDadosSessao(sub, nome, papel, exp));
}

// Apenas pede ao browser que apague o cookie: o token não é revogado
export function terminarSessao(req, res) {
  res.set('Cache-Control', 'no-store');
  // O path tem de ser o mesmo de quando o cookie foi criado, senão o browser não o apaga
  res.clearCookie('sessao', { path: '/v2' });
  return res.status(204).end();
}

function enviarNaoAutenticado(res, tokenInvalido) {
  res.set('Cache-Control', 'no-store');
  res.set('WWW-Authenticate', tokenInvalido ? 'Bearer error="invalid_token"' : 'Bearer');
  return enviarErro(
    res,
    401,
    tokenInvalido ? 'Token inválido ou expirado.' : 'É necessária autenticação (Bearer ou cookie de sessão).'
  );
}

export function exigirToken(req, res, next) {
  // Sem cabeçalho Authorization, o token é lido do cookie sessao
  let token;
  const cabecalho = req.get('Authorization');
  if (cabecalho) {
    const correspondencia = /^Bearer\s+(\S+)$/i.exec(cabecalho);
    if (!correspondencia) return enviarNaoAutenticado(res, false);
    token = correspondencia[1];
  } else {
    token = lerCookie(req, 'sessao');
    if (!token) return enviarNaoAutenticado(res, false);
  }

  let payload;
  try {
    payload = jwt.verify(token, segredo, { algorithms: ['HS256'] });
  } catch {
    return enviarNaoAutenticado(res, true);
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.sub !== 'string' ||
    typeof payload.nome !== 'string' ||
    !['aluno', 'servicos'].includes(payload.papel) ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp)
  ) {
    return enviarNaoAutenticado(res, true);
  }

  req.utilizador = {
    sub: payload.sub,
    nome: payload.nome,
    papel: payload.papel,
    exp: payload.exp
  };
  return next();
}

export function exigirPapel(papel) {
  return (req, res, next) => {
    if (req.utilizador?.papel !== papel) {
      res.set('Cache-Control', 'no-store');
      return enviarErro(res, 403, 'O utilizador autenticado não tem autorização para esta operação.');
    }
    return next();
  };
}
