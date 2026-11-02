# Registo - OPENAPI03

## Utilizadores e palavras-passe de teste

As contas são as mesmas da API02 (apenas para demonstração; `servidor/dados/utilizadores.json` contém só hashes bcrypt).

| Utilizador | Nome | Papel | Palavra-passe de teste |
| --- | --- | --- | --- |
| `12345` | Ana Silva | `aluno` | `Sugerir-ana-2026!` |
| `67890` | Bruno Costa | `aluno` | `Sugerir-bruno-2026!` |
| `rita.sousa` | Rita Sousa | `servicos` | `Sugerir-rita-2026!` |

## Como executar

É necessário Node.js 20 ou superior. Em `Sprints/OPENAPI03/servidor`: `npm install`, copiar `.env.exemplo` para `.env`, definir `JWT_SEGREDO` (pelo menos 32 caracteres; por exemplo, `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`) e executar `node --env-file=.env servidor.js`. A aplicação fica em `http://localhost:3000`.

## Verificação do servidor

Pedidos feitos com `curl -i`, `-c cookies.txt` e `-b cookies.txt`.

| # | Pedido | Código | Cabeçalhos relevantes |
| --- | --- | --- | --- |
| T1 | `POST /v2/sessao`, credenciais da Ana | `200` | `Cache-Control: no-store`<br>`Set-Cookie: sessao=[JWT]; Max-Age=900; Path=/v2; Expires=Mon, 26 Oct 2026 15:21:53 GMT; HttpOnly; SameSite=Strict` |
| T2 | `POST /v2/sessao`, palavra-passe errada | `401` | `Cache-Control: no-store`, **sem** `Set-Cookie` |
| T3 | `GET /v2/sessao` com o cookie | `200` | `Cache-Control: no-store` |
| T4 | `GET /v2/sugestoes` com o cookie | `200` | `Cache-Control: private, no-cache` |
| T5 | `GET /v2/sugestoes` sem cookie | `401` | `Cache-Control: no-store`, `WWW-Authenticate: Bearer` |
| T6 | `POST /v2/sugestoes` com o cookie da Ana | `201` | `Cache-Control: no-store`, `Location: /v2/sugestoes/46` |
| T7 | `DELETE /v2/sessao` | `204` | `Cache-Control: no-store`<br>`Set-Cookie: sessao=; Path=/v2; Expires=Thu, 01 Jan 1970 00:00:00 GMT` |
| T8 | `GET /v2/sugestoes` com `Cookie: sessao=<valor copiado antes de T7>` | `200` | `Cache-Control: private, no-cache` |

**Explicação de T8.** O `DELETE /v2/sessao` só pede ao **browser** que apague a sua cópia do cookie. O servidor não guarda sessões e não altera o token. O JWT continua com assinatura válida e `exp` no futuro, por isso `jwt.verify` aceita-o até expirar (15 minutos depois de T1). Quem tiver copiado o valor pode usá-lo até lá. Para o revogar mais cedo, o servidor teria de guardar estado, por exemplo uma lista de tokens revogados ou uma tabela de sessões.

## Verificação no browser

Observações registadas a 26/10/2026 no Chrome, seguindo os passos de cada linha com os separadores **Rede** e **Aplicação** das ferramentas de programador. O valor do JWT foi omitido (`[JWT]`).

| | Passos | Registo |
| --- | --- | --- |
| (a) | Entrar como Ana; Aplicação → Cookies → `http://localhost:3000`. | Cookie `sessao` na lista com `Path` `/v2`, validade às 16:33:01 (900 s depois da entrada), `HttpOnly` ✓ e `SameSite` `Strict`. Na Rede, `POST /v2/sessao` → `200` com `Set-Cookie: sessao=[JWT]; Max-Age=900; Path=/v2; Expires=Mon, 26 Oct 2026 16:33:01 GMT; HttpOnly; SameSite=Strict`. |
| (b) | Na consola, escrever `document.cookie`. | `''` (texto vazio). O token não aparece. |
| (c) | Recarregar a página (F5). | `GET /v2/sessao` enviado com `Cookie: sessao=[JWT]` → `200`. A área de sessão apareceu logo («Ana Silva»), sem pedir a palavra-passe. A hora de expiração ficou igual antes e depois do F5 (16:33:01). |
| (d) | Escolher tema «Escuro» e ordenação «Por estado»; fechar o browser por completo e voltar a abrir. | Armazenamento local: `configuracoes = {"tema":"escuro","ordenacao":"estado"}`. Depois de fechar e reabrir o browser, a página abriu em tema escuro e com ordenação «Por estado». A sessão também continuava ativa, porque o cookie tem `Max-Age` e por isso sobrevive ao fecho do browser. |
| (e) | Alterar à mão `configuracoes` para `{"tema":"roxo"}` e recarregar. | A página abriu em tema claro e com ordenação «Mais recentes primeiro». No Armazenamento local, o valor continuou a ser `{"tema":"roxo"}`. |
| (f) | Como Ana, escrever metade de uma sugestão; recarregar; depois abrir `http://localhost:3000` num **novo** separador. | Armazenamento de sessão: `rascunhoSugestao = {"titulo":"Mais tomadas nas salas","descricao":"Faltam tomadas nas salas de","categoria":""}`. Depois do F5, o título e a descrição voltaram preenchidos. No novo separador, a sessão estava ativa («Ana Silva»), mas o formulário apareceu vazio e não existia `rascunhoSugestao`. |


## Mecanismo usado para cada dado

| Dado | Mecanismo usado | Quanto tempo dura | Porque não se usou outro mecanismo |
| --- | --- | --- | --- |
| token | cookie `sessao` (`HttpOnly`, `SameSite=Strict`, `Path=/v2`) | 900 s (`Max-Age`), o mesmo prazo que o `exp` do JWT, ou até `DELETE /v2/sessao` | `localStorage` e `sessionStorage` são legíveis por qualquer JavaScript da página e obrigariam o cliente a enviar o token à mão em cada pedido. O cookie é enviado pelo browser e o `HttpOnly` impede a leitura por scripts. |
| configurações | `localStorage` (chave `configuracoes`) | Até ser apagado (sobrevive a fechar o separador e o browser) | Com `sessionStorage` perder-se-iam ao fechar o separador e não seriam partilhadas entre separadores. Num cookie seriam enviadas ao servidor em todos os pedidos, sem que este precise delas. |
| rascunho | `sessionStorage` (chave `rascunhoSugestao`) | Até fechar o separador; apagado também ao criar a sugestão e ao terminar a sessão | Com `localStorage` ficaria guardado indefinidamente e apareceria noutros separadores e a outros utilizadores do mesmo browser. Num cookie seria enviado ao servidor em cada pedido (e os cookies têm um limite de cerca de 4 KB). |

## Reflexão

**Vantagem e desvantagem do cookie face à variável da API02.** Vantagem: o token sobrevive a recarregar a página (e a fechar o browser, dentro dos 15 minutos), porque é o browser que o guarda e envia automaticamente. Com `HttpOnly`, nem o código da página nem um script injetado o conseguem ler. Desvantagens: o cliente deixa de conseguir ler o token, por isso precisa de `GET /v2/sessao` para saber o nome, o papel e a expiração. Além disso, como o cookie é enviado automaticamente, um pedido iniciado por outro site poderia levá-lo (CSRF). Aqui esse risco é mitigado com `SameSite=Strict`.

**T8.** Sim, o servidor aceitou o cookie depois de terminada a sessão (`200`). O `DELETE /v2/sessao` só remove a cópia do browser. O JWT é autossuficiente: o servidor verifica a assinatura e o `exp` e não consulta nenhuma lista de sessões. Por isso um token copiado continua válido até expirar.

**As configurações acompanham a Ana noutro computador?** Não. O `localStorage` pertence ao browser (e à origem) nesse computador, não à conta da Ana. Pela mesma razão, a Ana e o Bruno no mesmo browser partilham as mesmas configurações. Para as configurações acompanharem a Ana, teriam de ser guardadas no **servidor**, associadas ao utilizador (por exemplo, `GET`/`PUT /v2/preferencias` protegidas pelo token) e carregadas depois de iniciar sessão. O `localStorage` poderia continuar a servir de cópia local.