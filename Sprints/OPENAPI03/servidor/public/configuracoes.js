// Chave fixa, que não depende de quem tem sessão iniciada. O localStorage pertence a este browser,
// neste computador e nesta origem (http://localhost:3000): todos os utilizadores deste browser leem o mesmo valor.
const chave = 'configuracoes';

export const valoresPermitidos = {
  tema: ['claro', 'escuro'],
  ordenacao: ['recentes', 'estado']
};

export const configuracoesPorOmissao = Object.freeze({
  tema: 'claro',
  ordenacao: 'recentes'
});

// O utilizador pode alterar o valor guardado nas ferramentas de programador,
// por isso cada opção é validada e, se for inválida, usa-se o valor por omissão
// Chave inexistente ou JSON inválido: valores por omissão. Opção fora de valoresPermitidos
// (ex: {"tema":"roxo"}): só essa opção volta ao valor por omissão. Esta função só lê, por isso
// o valor inválido continua guardado até o utilizador mudar uma configuração
export function lerConfiguracoes() {
  let guardadas;
  try {
    guardadas = JSON.parse(localStorage.getItem(chave));
  } catch {
    guardadas = null;
  }

  if (!guardadas || typeof guardadas !== 'object' || Array.isArray(guardadas)) {
    return { ...configuracoesPorOmissao };
  }

  // Valida opção a opção: se só o tema estiver mal, a ordenação guardada mantém-se
  const configuracoes = {};
  for (const [opcao, valores] of Object.entries(valoresPermitidos)) {
    configuracoes[opcao] = valores.includes(guardadas[opcao])
      ? guardadas[opcao]
      : configuracoesPorOmissao[opcao];
  }
  return configuracoes;
}

// localStorage: mantém-se depois de fechar o separador e o browser, é partilhado por
// todos os separadores da mesma origem e nunca é enviado ao servidor.
export function guardarConfiguracoes(configuracoes) {
  // O localStorage só guarda texto, daí o JSON.stringify
  try {
    localStorage.setItem(chave, JSON.stringify({
      tema: configuracoes.tema,
      ordenacao: configuracoes.ordenacao
    }));
  } catch {
    // Sem localStorage (por exemplo, bloqueado pelo browser), a configuração aplica-se só a esta página
  }
}
