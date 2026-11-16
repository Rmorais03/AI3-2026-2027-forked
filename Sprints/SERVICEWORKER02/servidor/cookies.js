export function lerCookie(req, nome) {
  const cabecalho = req.get('Cookie');
  if (!cabecalho) return undefined;

  for (const par of cabecalho.split(';')) {
    const posicaoIgual = par.indexOf('=');
    if (posicaoIgual === -1) continue;
    if (par.slice(0, posicaoIgual).trim() !== nome) continue;

    const valor = par.slice(posicaoIgual + 1).trim();
    try {
      return decodeURIComponent(valor);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
