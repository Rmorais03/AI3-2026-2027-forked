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

Observações registadas a 09/11/2026 no Chrome, por ordem de execução, com o servidor arrancado com `JWT_VALIDADE=900` para (a)–(e), (g) e (h) e com `JWT_VALIDADE=30` para (f), (i) e (j). As condições de rede («3G lento», «Offline») foram aplicadas à página e ao service worker. Os conteúdos das caches e da IndexedDB correspondem ao que aparece em **Aplicação → Armazenamento em cache** e **Aplicação → IndexedDB → `sugestoes-bd`**.

| | Passos | Registo |
| --- | --- | --- |
| (a) | Ana entra; Aplicação → Service workers; Aplicação → Armazenamento em cache. | `sw.js` no estado `activated`, âmbito `http://localhost:3000/`, e a página está controlada por ele. Cache `interface-v1`: `/`, `/index.html`, `/estilos.css`, `/app.js`, `/configuracoes.js`, `/bd.js`, `/pendentes.js`, `/sw.js`. Cache `dados-publicos`: só `/v2/categorias`. **Não** existe nenhuma entrada de `/v2/sessao` nem de `/v2/sugestoes`. |
| (b) | Com a sessão da Ana, recarregar a página e ver a coluna «Tamanho» da Rede. | «(ServiceWorker)» em `/`, `/estilos.css`, `/app.js`, `/configuracoes.js`, `/bd.js`, `/pendentes.js` e `/v2/categorias` (`Cache-Control: public, max-age=86400`). Vieram da rede, com o tamanho real: `GET /v2/sessao` → `200` (`no-store`) e `GET /v2/sugestoes` → `200` (`private, no-cache`). |
| (c) | Rede → «3G lento» (latência de 2 s); recarregar. | Logo após o carregamento, `data-estado="a-verificar"` e só se via «A verificar sessão…» (sem formulário, sem área de sessão). A interface, servida pelo service worker, apareceu aos 46 ms; o estado só passou a `com-sessao` aos 2110 ms, quando chegou a resposta `200` de `GET /v2/sessao`. |
| (d) | Rede → Offline; recarregar. | A página abriu: todos os ficheiros e `/v2/categorias` vieram do service worker. `GET /v2/sessao` falhou com `net::ERR_INTERNET_DISCONNECTED` e o estado passou de `a-verificar` a `sem-ligacao` (`navigator.onLine` = `false`). Apareceram «Sem ligação ao servidor.», o botão «Terminar sessão» desativado com a explicação, «Cópia local de Ana Silva.», «Cópia de 14:42 — pode estar desatualizada.» e as duas sugestões da Ana. |
| (e) | Ainda offline, criar «Bancos no pátio exterior»; ver a loja `pendentes`; desligar Offline. | A sugestão apareceu no topo da lista como «Por enviar», com o botão «Descartar». Loja `pendentes`: `{ idLocal: 1, utilizador: "12345", titulo: "Bancos no pátio exterior", categoria: "instalacoes", erro: null, … }`. Ao repor a ligação, ocorreu o evento `online`: `GET /v2/sessao` → `200`, `GET /v2/sugestoes` → `200`, `POST /v2/sugestoes` → `201` com `Location: /v2/sugestoes/46`. A loja `pendentes` ficou vazia, a loja `sugestoes` passou a ter os ids 42, 43 e 46, e a lista mostrou «Atualizado às 14:42». |
| (f) | Servidor com `JWT_VALIDADE=30`; Ana entra (expiração às 14:43:08); Offline; criar «Mais cacifos no bloco A»; esperar pela expiração; repor a ligação; Ana entra de novo. | O `POST` foi rejeitado, o estado passou a `sem-ligacao` e a sugestão ficou na loja `pendentes` (`idLocal: 2`, `utilizador: "12345"`). Às 14:43:08, ainda sem ligação, o tempo chegou a zero: `sem-sessao` com «A sessão expirou. Entre de novo.». Ao repor a ligação: `GET /v2/sessao` → `401`, o estado continuou `sem-sessao` e a pendente **manteve-se**. Depois de a Ana entrar de novo (14:43:10): `POST /v2/sessao` → `200`, `POST /v2/sugestoes` → `201`, e a loja `pendentes` ficou vazia. |
| (g) | Offline, mudar «Ordenação das sugestões» para «Por estado» e depois para «Mais recentes primeiro». | «Por estado»: «Melhorar os espaços de estudo» (`aceite`) antes de «Ampliar o horário da biblioteca» (`submetida`). «Mais recentes primeiro»: a ordem inverte-se (06/10 antes de 01/10). **Nenhum** pedido apareceu na Rede durante a reordenação: a lista foi lida da IndexedDB. |
| (h) | Ana clica «Terminar sessão»; Bruno entra. | `DELETE /v2/sessao` → `204`. As lojas `sugestoes`, `pendentes` e `meta` ficaram vazias, o rascunho foi apagado e o foco passou para o campo `utilizador`. Bruno entrou (foco no título «Sessão ativa»): lista só com «Reforçar o apoio informático» e «Criar mais atividades culturais» (ids 44 e 45, `numeroAluno` `67890`) e `proprietario` = Bruno Costa. Nada da Ana. |
| (i) | Com `JWT_VALIDADE=30`, deixar expirar a sessão da Ana (sem terminar sessão); ver a IndexedDB; Bruno entra. | Às 14:43:40 a sessão expirou: `sem-sessao` com «A sessão expirou. Entre de novo.». A IndexedDB **continuava** com os dados da Ana: `proprietario.utilizador = "12345"` e sugestões 42, 43 e 46. Quando o Bruno entrou (`POST /v2/sessao` → `200`), as lojas foram limpas antes de mostrar a área de sessão: `proprietario.utilizador = "67890"`, só sugestões 44 e 45. |
| (j) | Alterar `CACHE_INTERFACE` para `'interface-v2'` em `sw.js`; recarregar; clicar «Atualizar a aplicação». | Depois de recarregar, a nova versão ficou instalada e **à espera** (`waiting`, estado `installed`), com as três caches: `interface-v1`, `interface-v2` e `dados-publicos`. Apareceu o botão «Atualizar a aplicação». Três segundos depois, sem clique, continuava à espera. Depois do clique, a página recarregou (`controllerchange`), a nova versão ficou `activated`, sem nenhuma à espera, e restaram só as caches `dados-publicos` e `interface-v2`: `interface-v1` foi apagada. No fim, `sw.js` foi reposto com `interface-v1`. |

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

**Sem ligação, a interface mostra dados e aceita sugestões. Que operação de autenticação continua impossível sem ligação, e porquê?** Iniciar sessão. Só o servidor pode verificar a palavra-passe (é ele que tem os hashes bcrypt) e só ele pode assinar o JWT e enviar o Set-Cookie; no browser não há nada que permita confirmar quem é a pessoa. Terminar sessão também é impossível, pela mesma razão: o cookie é HttpOnly, o JavaScript não o pode apagar, e só a resposta do servidor a `DELETE /v2/sessao` o faz. Foi isso que se viu em (d): sem ligação, o botão «Terminar sessão» fica desativado. Mesmo a sessão existente não pode ser confirmada: sem resposta de `GET /v2/sessao` a interface fica em `sem-ligacao` e não em `com-sessao`; a cópia local e as pendentes funcionam porque não precisam de autenticação no momento, apenas de saber a quem pertencem.

**Em (e), se a ligação tivesse caído depois de o servidor criar a sugestão e antes de chegar a resposta, o que teria acontecido? Que alteração ao contrato (e ao servidor) evitaria o problema, e que versão teria a API depois dela?** Para o cliente seria igual a uma falha de rede: o `fetch` era rejeitado e a sugestão ia para as pendentes. Quando a ligação voltasse, `enviarPendentes()` enviava-a outra vez e o servidor, que não tem forma de saber que é a mesma, criava uma segunda sugestão igual com outro `id` (por exemplo, a 40 e a 41). O problema é que o `POST` não é idempotente. A solução seria o cliente gerar um identificador único para cada pendente quando a cria (por exemplo, `crypto.randomUUID()`) e enviá-lo num cabeçalho `Idempotency-Key` em `criarSugestao`. O servidor guardava, por utilizador, as chaves já recebidas e a resposta dada; se a mesma chave voltasse a chegar, devolvia a sugestão já criada em vez de criar outra. Como o cabeçalho é opcional e os clientes antigos continuam a funcionar, é um acréscimo compatível: a API passaria de `2.1.0` para `2.2.0`. (Se o cabeçalho fosse obrigatório, os clientes antigos deixavam de funcionar e seria `3.0.0`.)

**A Background Sync API permitiria enviar as pendentes com a página fechada. Que problema resolveria? Por que razão o cookie continuaria a ser uma limitação?** Resolveria o envio com a página fechada: hoje, se a Ana criar uma pendente sem ligação e fechar o separador, a sugestão só é enviada quando voltar a abrir a aplicação. Com a Background Sync, o browser acordava o service worker quando a ligação voltasse e este enviava as pendentes. Mas o servidor continuaria a identificar o autor pelo cookie: se a sessão já tivesse expirado, como em (f), receberia `401`, e o service worker não consegue voltar a autenticar (não tem a palavra-passe, não pode mostrar um formulário e não pode ler nem renovar o cookie `HttpOnly`). Além disso, o cookie enviado seria o que estivesse no browser nesse momento, que pode já ser do Bruno; para evitar enviar as pendentes da Ana em nome dele, o service worker teria de ler o `utilizador` de cada pendente na IndexedDB, o que esta ficha não permite.

**Num computador partilhado, a cópia local da Ana fica na IndexedDB depois de a sessão expirar. Que risco isso representa? Que regras desta ficha o reduzem, e o que continua por resolver?** Como se viu em (i), depois da expiração as sugestões da Ana (e o seu nome, em `meta`) continuam na IndexedDB. A interface já não as mostra, mas qualquer pessoa que use aquele browser pode abrir as ferramentas de programador e lê-las; o mesmo vale para pendentes que ainda não tenham sido enviadas. As regras da ficha reduzem o risco: a cópia só é mostrada enquanto a `expiracao` do proprietário não passou; terminar sessão apaga a IndexedDB e o rascunho (visto em (h)); e quando entra outro utilizador a base é limpa antes de se mostrar qualquer coisa (visto em (i)). Continua por resolver o intervalo entre a expiração e a próxima entrada (que pode nunca acontecer, se a Ana simplesmente fechar o browser): os dados ficam no disco, sem cifra. Apagar tudo na expiração resolvia isso, mas fazia perder as pendentes, que são precisamente o que se quer guardar até a Ana voltar a entrar.

**Se a Ana mudar de computador, leva consigo as configurações? E as pendentes? Compare com a resposta dada na API03.** Não leva nenhuma das duas. Tal como na API03, as configurações estão no `localStorage` e as pendentes na IndexedDB, e ambos pertencem àquele browser, naquele computador e naquela origem, não à conta da Ana. A diferença em relação à API03 é a gravidade: perder as configurações é só um incómodo, mas as pendentes são sugestões que a Ana pensa ter submetido. Ficam no computador antigo e só são enviadas se a Ana voltar a entrar lá; se outra pessoa entrar primeiro nesse browser, são apagadas e perdem-se. Para acompanharem a Ana, as configurações podiam passar para o servidor (como já se concluiu na API03); as pendentes não, porque só existem por não haver ligação ao servidor no momento em que são criadas.
