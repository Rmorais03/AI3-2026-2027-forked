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
