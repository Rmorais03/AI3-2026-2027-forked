const chave = 'configuracoes';

export const valoresPermitidos = {
  tema: ['claro', 'escuro'],
  ordenacao: ['recentes', 'estado']
};

export const configuracoesPorOmissao = Object.freeze({
  tema: 'claro',
  ordenacao: 'recentes'
});

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

  const configuracoes = {};
  for (const [opcao, valores] of Object.entries(valoresPermitidos)) {
    configuracoes[opcao] = valores.includes(guardadas[opcao])
      ? guardadas[opcao]
      : configuracoesPorOmissao[opcao];
  }
  return configuracoes;
}

export function guardarConfiguracoes(configuracoes) {
  try {
    localStorage.setItem(chave, JSON.stringify({
      tema: configuracoes.tema,
      ordenacao: configuracoes.ordenacao
    }));
  } catch {
  }
}
