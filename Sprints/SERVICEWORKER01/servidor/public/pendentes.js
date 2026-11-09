import { confirmarPendente, lerPendentes, marcarErro } from './bd.js';

let envioEmCurso = false;
let controlador = null;
let versaoEnvio = 0;

export function cancelarEnvioPendentes() {
  versaoEnvio += 1;
  controlador?.abort();
}

export async function enviarPendentes(sessao) {
  if (envioEmCurso) return { estado: 'em-curso' };
  envioEmCurso = true;
  const versaoAtual = versaoEnvio;
  try {
    const pendentes = (await lerPendentes())
      .filter((item) => item.utilizador === sessao.utilizador && !item.erro)
      .sort((a, b) => a.idLocal - b.idLocal);

    for (const pendente of pendentes) {
      if (versaoAtual !== versaoEnvio) return { estado: 'cancelado' };
      let resposta;
      try {
        controlador = new AbortController();
        resposta = await fetch('/v2/sugestoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controlador.signal,
          body: JSON.stringify({
            titulo: pendente.titulo,
            descricao: pendente.descricao,
            categoria: pendente.categoria
          })
        });
      } catch {
        return { estado: versaoAtual === versaoEnvio ? 'sem-ligacao' : 'cancelado' };
      }
      controlador = null;
      if (versaoAtual !== versaoEnvio) return { estado: 'cancelado' };

      if (resposta.status === 401) {
        const restantes = await lerPendentes();
        return {
          estado: 'sem-sessao',
          quantidade: restantes.filter((item) => item.utilizador === sessao.utilizador).length
        };
      }
      if (resposta.status === 201) {
        const sugestao = await resposta.json();
        if (versaoAtual !== versaoEnvio) return { estado: 'cancelado' };
        await confirmarPendente(pendente.idLocal, sugestao);
      } else if (resposta.status === 400) {
        const erro = await resposta.json();
        if (versaoAtual !== versaoEnvio) return { estado: 'cancelado' };
        await marcarErro(pendente.idLocal, erro.mensagem ?? 'Sugestão inválida.');
      } else {
        return { estado: 'erro' };
      }
    }
    return { estado: 'concluido' };
  } finally {
    controlador = null;
    envioEmCurso = false;
  }
}
