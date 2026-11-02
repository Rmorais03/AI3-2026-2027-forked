// O cabeçalho Cookie tem a forma «nome1=valor1; nome2=valor2»
export function lerCookie(req, nome) {
  const cabecalho = req.get('Cookie');
  if (!cabecalho) return undefined;

  for (const par of cabecalho.split(';')) {
    const posicaoIgual = par.indexOf('=');
    if (posicaoIgual === -1) continue;
    if (par.slice(0, posicaoIgual).trim() !== nome) continue;

    // Corta só no primeiro «=», porque o valor também pode ter «=»
    const valor = par.slice(posicaoIgual + 1).trim();
    // O valor pode vir codificado (%20, etc.)
    try {
      return decodeURIComponent(valor);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
