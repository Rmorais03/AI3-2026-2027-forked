# Registo — SERVICEWORKER01

## 4.1 · Contrato e estratégia

O contrato mantém as operações, os esquemas e as respostas da API03, na versão `2.1.0`; apenas os comentários de contexto foram adaptados a esta ficha. `listarCategorias` é pública (`security: []`) e a resposta `200` indica `Cache-Control: public, max-age=86400`. A resposta `201` de `criarSugestao` declara `Location` e `Cache-Control: no-store`.

| Pedido | `Cache-Control` no contrato | Depende do cookie? | Estratégia no service worker | Guardado em IndexedDB? |
| --- | --- | --- | --- | --- |
| Ficheiros da interface (`/`, `/app.js`, …) | — (fora do contrato da API) | não | cache primeiro (`interface-v1`) | não |
| `GET /v2/categorias` | `public, max-age=86400` | não | cache e atualização em segundo plano (`dados-publicos`) | não |
| `POST /v2/sessao` | `no-store` | não (usa credenciais e cria o cookie) | só rede | não |
| `GET /v2/sessao` | `no-store` | sim | só rede | não |
| `DELETE /v2/sessao` | `no-store` | sim (apaga o cookie da sessão no browser) | só rede | não |
| `GET /v2/sugestoes` | `private, no-cache` | sim | só rede | sim, lista de sugestões |
| `POST /v2/sugestoes` | `no-store` | sim | só rede | sim, sugestões pendentes criadas sem ligação |

Todas as linhas que dependem do cookie usam **só rede** no service worker. A Cache API não distingue utilizadores pelo cookie; por isso, as respostas privadas de `GET /v2/sugestoes` ficam na IndexedDB, associadas ao proprietário da cópia local. Os pedidos de sessão também não podem ser respondidos a partir de uma cópia: o servidor tem de validar a sessão ou emitir/apagar o cookie.

## Utilizadores de teste e execução

As contas são as mesmas da API03 (`servidor/dados/utilizadores.json` contém só hashes bcrypt).

| Utilizador | Nome | Papel | Palavra-passe de teste |
| --- | --- | --- | --- |
| `12345` | Ana Silva | `aluno` | `Sugerir-ana-2026!` |
| `67890` | Bruno Costa | `aluno` | `Sugerir-bruno-2026!` |
| `rita.sousa` | Rita Sousa | `servicos` | `Sugerir-rita-2026!` |

Em `servidor/`: `npm install`, copiar `.env.exemplo` para `.env`, definir `JWT_SEGREDO` (pelo menos 32 caracteres) e executar `node --env-file=.env servidor.js`. A aplicação fica em `http://localhost:3000` (o service worker funciona em `localhost` sem HTTPS).

## 4.6 · Verificação

### 23 · Servidor

Pedidos feitos a 09/11/2026 com `curl -i`. O cookie da Ana foi obtido antes com `POST /v2/sessao` (`-c cookies.txt`) e enviado com `-b cookies.txt`.

| # | Pedido | Código | Cabeçalhos e corpo relevantes |
| --- | --- | --- | --- |
| T1 | `GET /v2/categorias` sem cookie | `200` | `Cache-Control: public, max-age=86400`. Corpo com as cinco categorias (`instalacoes`, `ensino`, `servicos`, `atividades`, `outra`), cada uma com `codigo` e `descricao`. |
| T2 | `POST /v2/sugestoes` com o cookie da Ana e `"titulo": "Mesas"` (5 caracteres) | `400` | `Cache-Control: no-store`. Corpo: `{"codigo":400,"mensagem":"O corpo do pedido não cumpre o schema SugestaoNova.","detalhes":[{"campo":"titulo","problema":"Tem de ter entre 10 e 120 caracteres."}]}` |
| T3 | `POST /v2/sugestoes` com o cookie da Ana e `"numeroAluno": "99999"` | `201` | `Cache-Control: no-store`, `Location: /v2/sugestoes/46`. Corpo com `"numeroAluno":"12345"`: o valor enviado foi ignorado e usou-se o do token. |

### 24 · Browser

Chrome, com os separadores **Rede** e **Aplicação** das ferramentas de programador abertos.

| | Passos | O que se deve observar | Registo |
| --- | --- | --- | --- |
| (a) | Aplicação → Service workers; Aplicação → Armazenamento em cache. | `sw.js` ativo e em execução. `interface-v1` com `/`, `/index.html`, `/estilos.css`, `/app.js`, `/configuracoes.js`, `/bd.js`, `/pendentes.js`, `/sw.js`. `dados-publicos` só com `/v2/categorias`. Nenhuma entrada de `/v2/sessao` nem de `/v2/sugestoes`. | _a preencher_ |
| (b) | Recarregar a página com a sessão iniciada e ver a coluna «Tamanho» da Rede. | Ficheiros da interface e `/v2/categorias` com «(ServiceWorker)». `/v2/sessao` e `/v2/sugestoes` com o tamanho real (vieram da rede). | _a preencher_ |
| (c) | Rede → limitação «3G lento»; recarregar. | Durante alguns segundos só aparece «A verificar sessão…» e `body` tem `data-estado="a-verificar"`. | _a preencher_ |
| (d) | Rede → Offline; recarregar. | A página abre (servida pelo service worker), estado `sem-ligacao`, «Cópia local de Ana Silva.» e «Cópia de HH:MM — pode estar desatualizada», com a lista. | _a preencher_ |
| (e) | Ainda offline, criar uma sugestão; ver Aplicação → IndexedDB → `sugestoes-bd` → `pendentes`. Desligar Offline. | A sugestão aparece no topo como «Por enviar» e na loja `pendentes` com `utilizador: "12345"` e `erro: null`. Ao repor a ligação: `GET /v2/sessao` → `200`, `POST /v2/sugestoes` → `201`, a loja `pendentes` fica vazia e a sugestão passa para `sugestoes`. | _a preencher_ |
| (f) | Arrancar o servidor com `JWT_VALIDADE=30`; entrar como Ana; ficar offline; criar uma sugestão; esperar que o tempo restante chegue a zero; repor a ligação; entrar de novo como Ana. | Ao chegar a zero: `sem-sessao` com «A sessão expirou. Entre de novo.». Ao repor a ligação, `GET /v2/sessao` → `401` e a pendente continua na loja `pendentes`. Depois de nova entrada da Ana, é enviada (`201`) e removida. | _a preencher_ |
| (g) | Offline, mudar «Ordenação das sugestões» entre «Mais recentes primeiro» e «Por estado». | A lista é reordenada sem nenhum pedido novo na Rede (é lida da IndexedDB com os índices `porData`/`porEstado`). | _a preencher_ |
| (h) | Ana termina sessão; Bruno entra. | Depois do `DELETE /v2/sessao` → `204`, as lojas `sugestoes`, `pendentes` e `meta` ficam vazias. O Bruno só vê as suas sugestões. | _a preencher_ |
| (i) | Com `JWT_VALIDADE=30`, deixar a sessão da Ana expirar (sem terminar sessão) e ver a IndexedDB; depois o Bruno entra. | Depois da expiração, os dados da Ana continuam na IndexedDB (`meta.proprietario.utilizador = "12345"`). Quando `POST /v2/sessao` do Bruno devolve `200`, as lojas são limpas e `proprietario` passa a `"67890"`. | _a preencher_ |
| (j) | Mudar `CACHE_INTERFACE` para `'interface-v2'` em `sw.js`; recarregar; clicar «Atualizar a aplicação». | O novo service worker fica «waiting to activate» e aparece o botão. Depois do clique, a página recarrega, o novo service worker fica ativo e só existem as caches `interface-v2` e `dados-publicos`. (No fim, repor `interface-v1`.) | _a preencher_ |

### 25 · Mecanismo usado para cada dado

| Dado | Mecanismo usado | Quem escreve | Quando é apagado | Porque não se usou outro mecanismo |
| --- | --- | --- | --- | --- |
| token | cookie `sessao` (`HttpOnly`, `SameSite=Strict`, `Path=/v2`) | servidor (`Set-Cookie` em `POST /v2/sessao`) | ao fim de `Max-Age` (o mesmo prazo do `exp` do JWT) ou quando `DELETE /v2/sessao` devolve o `Set-Cookie` que o expira | Os outros mecanismos são legíveis por JavaScript e não são enviados automaticamente; o cookie `HttpOnly` é enviado pelo browser e não pode ser lido por scripts. |
| configurações | `localStorage` (chave `configuracoes`) | página | só se o utilizador limpar os dados do site | São poucas, públicas e não pertencem a uma sessão. Num cookie iriam ao servidor em todos os pedidos; com `sessionStorage` perder-se-iam ao fechar o separador; a IndexedDB seria desnecessária para dois valores. |
| rascunho | `sessionStorage` (chave `rascunhoSugestao`) | página | ao fechar o separador, ao criar a sugestão (`201` ou pendente) e ao terminar sessão | Com `localStorage` ou IndexedDB ficaria guardado indefinidamente e visível a outros separadores e utilizadores; é texto em edição, não uma sugestão a enviar. |
| ficheiros da interface | Cache API (`interface-v1`) | service worker (evento `install`) | na ativação de uma nova versão (cache com outro nome) | São pares pedido → resposta iguais para todos, que o service worker tem de devolver sem rede; a Cache API guarda objetos `Response` e é acessível ao service worker. |
| categorias | Cache API (`dados-publicos`) | service worker (evento `fetch`, atualização em segundo plano) | não é apagada pelo código; cada resposta `ok` substitui a anterior | São públicas e iguais para todos (`security: []`, `public`); o service worker não usa a IndexedDB, e a página obtém-nas com `fetch` como se viessem da rede. |
| lista de sugestões | IndexedDB (`sugestoes-bd`, loja `sugestoes`) | página | substituída a cada `GET /v2/sugestoes` com `200`; `limparBD()` ao terminar sessão ou quando entra outro utilizador | É privada: a Cache API não distingue utilizadores pelo cookie. Com `localStorage` não haveria índices para a ordenação nem transações, e as leituras bloqueariam a página. |
| sugestões pendentes | IndexedDB (`sugestoes-bd`, loja `pendentes`) | página | com `201` (`confirmarPendente`), «Descartar», terminar sessão, ou quando entra outro utilizador | Têm de sobreviver ao fecho do browser (`sessionStorage` não serve) e são objetos com dono e estado (`utilizador`, `erro`); a Cache API guarda respostas, não pedidos por enviar. |

## 4.7 · Reflexão

**Que operação de autenticação continua impossível sem ligação?** Iniciar sessão. A palavra-passe só pode ser verificada pelo servidor, que tem os hashes bcrypt e o segredo do JWT, e só ele emite o cookie. Terminar sessão também é impossível: o cookie é `HttpOnly`, por isso só o `Set-Cookie` do servidor o apaga. Sem ligação nem sequer se sabe se a sessão ainda é válida: a interface fica em `sem-ligacao` e não em `com-sessao`.

**Se a ligação tivesse caído depois de o servidor criar a sugestão.** O `fetch` teria sido rejeitado, a sugestão ficaria nas pendentes e, quando a ligação voltasse, seria enviada outra vez. Como o `POST` não é idempotente, o servidor criaria uma segunda sugestão igual (duplicado). Para o evitar, `criarSugestao` passaria a aceitar um cabeçalho opcional `Idempotency-Key`, gerado pelo cliente quando a pendente é criada e guardado com ela. O servidor guardaria, por utilizador, a chave e a resposta, e num pedido repetido com a mesma chave devolveria o mesmo `201` sem criar nada. É um acréscimo opcional e compatível, por isso a API passaria a `2.2.0`.

**Background Sync.** Permitiria enviar as pendentes mesmo com a página fechada, sem a Ana ter de voltar a abrir a aplicação. Mas o envio continuaria a depender do cookie: se a sessão tivesse expirado entretanto, o servidor responderia `401` e o service worker não tem forma de voltar a autenticar (não tem a palavra-passe, não pode mostrar um formulário e não lê o cookie). Além disso, o cookie enviado seria o que estiver no browser nesse momento, que pode ser de outro utilizador; o service worker teria de ler o dono de cada pendente na IndexedDB.

**Computador partilhado.** Depois de a sessão da Ana expirar, as suas sugestões e pendentes continuam na IndexedDB, e qualquer pessoa com acesso ao browser as pode ler nas ferramentas de programador. As regras desta ficha reduzem o risco: a cópia só é mostrada enquanto a `expiracao` não passou, `limparBD()` corre ao terminar sessão, e quando entra outro utilizador a base é limpa antes de mostrar o que quer que seja. Continua por resolver o período entre a expiração e a entrada seguinte (ou se ninguém voltar a entrar): os dados ficam no disco, sem cifra. Apagá-los na expiração faria perder as pendentes, que é precisamente o que se quer guardar.

**Se a Ana mudar de computador.** Não leva as configurações, tal como na API03: o `localStorage` pertence ao browser e à origem, não à conta. As pendentes também não: ficam na IndexedDB do computador antigo e só serão enviadas se a Ana voltar a entrar lá; se outro utilizador entrar primeiro nesse browser, são apagadas. A diferença em relação à API03 é que agora o que fica preso ao browser não são só preferências, mas sugestões que a Ana julga ter submetido. Para as acompanhar, teriam de estar no servidor, o que é impossível enquanto não há ligação, e é por isso que existem.
