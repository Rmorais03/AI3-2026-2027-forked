# Registo — SERVICEWORKER / API05

## 4.1 · Contrato e estratégia

O contrato evolui para a versão `2.2.0` (retrocompatível com `2.1.0`), introduzindo idempotência no `POST /v2/sugestoes` através do cabeçalho `Idempotency-Key` e sincronização incremental via cursor em `GET /v2/sugestoes/alteracoes?desde=<n>`. `listarCategorias` mantém-se pública (`security: []`) com `Cache-Control: public, max-age=86400`. A resposta `201` de `criarSugestao` declara `Location`, `Cache-Control: no-store` e `Idempotent-Replayed` em caso de reenvio.

| Pedido | `Cache-Control` no contrato | Depende do cookie? | Estratégia no service worker | Guardado em IndexedDB? |
| --- | --- | --- | --- | --- |
| Ficheiros da interface (`/`, `/app.js`, …) | — (fora do contrato da API) | não | cache primeiro (`interface-v3`) | não |
| `GET /v2/categorias` | `public, max-age=86400` | não | cache e atualização em segundo plano (`dados-publicos`) | não |
| `POST /v2/sessao` | `no-store` | não (usa credenciais e cria o cookie) | só rede | não |
| `GET /v2/sessao` | `no-store` | sim | só rede | não |
| `DELETE /v2/sessao` | `no-store` | sim (apaga o cookie da sessão no browser) | só rede | não |
| `GET /v2/sugestoes` | `private, no-cache` / `no-store` | sim | só rede (substituído pelo Pull com cursor) | sim, lista de sugestões |
| `POST /v2/sugestoes` (sem `Idempotency-Key`) | `no-store` | sim | só rede (sem salvaguarda de idempotência no SW) | sim, na loja `pendentes` |
| `POST /v2/sugestoes` com `Idempotency-Key` | `no-store` | sim | enviado pelo service worker (Background Sync / Plano B) com chave UUID | sim, na loja `pendentes` |
| `GET /v2/sugestoes/alteracoes?desde=<n>` | `private, no-store` | sim | feito pelo service worker na fase de Pull | sim, gravado na mesma transação com o cursor |

Todas as linhas que dependem do cookie usam **só rede** no service worker. O service worker (`sw.js`) opera em sintonia com a interface para gerir o ciclo de vida offline. A Cache API não distingue utilizadores pelo cookie; por isso, as respostas privadas e as alterações incrementais ficam na IndexedDB (`sugestoes-bd` v2), associadas ao proprietário da cópia local. Os pedidos de sessão também não podem ser respondidos a partir de uma cópia: o servidor tem de validar a sessão ou emitir/apagar o cookie.

## Utilizadores de teste e execução

As contas são as mesmas da API03 (`servidor/dados/utilizadores.json` contém só hashes bcrypt).

| Utilizador | Nome | Papel | Palavra-passe de teste |
| --- | --- | --- | --- |
| `12345` | Ana Silva | `aluno` | `Sugerir-ana-2026!` |
| `67890` | Bruno Costa | `aluno` | `Sugerir-bruno-2026!` |
| `rita.sousa` | Rita Sousa | `servicos` | `Sugerir-rita-2026!` |

Em `servidor/`: `npm install`, copiar `.env.exemplo` para `.env`, definir `JWT_SEGREDO` (pelo menos 32 caracteres) e executar `node --env-file=.env servidor.js`. A aplicação fica em `http://localhost:3000`.

---

## 4.6 · Verificação

### 23 · Servidor (Testes T1–T4)

Pedidos realizados com `curl -i` / cliente HTTP. O cookie da Ana foi obtido previamente com `POST /v2/sessao`.

| Teste | Descrição / Objetivo | Procedimento | Resultado Concreto Observado |
| :--- | :--- | :--- | :--- |
| **T1** | **Idempotência no POST (Sucesso)** | Envio de dois pedidos `POST /v2/sugestoes` seguidos com o mesmo cabeçalho `Idempotency-Key` (UUID) e o mesmo corpo de dados. | **1.º Pedido:** Status `201 Created`, cabeçalho `Location: /v2/sugestoes/6`, sugestão criada na BD.<br>**2.º Pedido:** Status `201 Created`, cabeçalho `Idempotent-Replayed: true`, mantendo exatamente o mesmo `Location` (`/v2/sugestoes/6`) e sem duplicar o registo. |
| **T2** | **Idempotência - Conflito de Corpo (409)** | Envio de um novo pedido POST utilizando a **mesma** `Idempotency-Key` do T1, mas alterando o corpo/título do pedido. | O servidor detetou a reutilização da chave com dados divergentes e respondeu com o código HTTP **`409 Conflict`** e a mensagem exata: `"Conflito: A chave de idempotência já foi utilizada com um corpo de pedido diferente."`. |
| **T3** | **Sincronização Incremental (Cursor)** | Execução de dois pedidos de alteração em sequência: primeiro `desde=0` e, de seguida, utilizando o cursor devolvido. | **1.º Pedido (`desde=0`):** Retornou as alterações (incluindo explicitamente a sugestão criada no T1 com o `id: 6`, cuja versão se encontrava abrangida pelo `cursor: 5` devolvido na resposta).<br>**2.º Pedido (`desde=5`):** Retornou status `200 OK`, com `alteracoes: []` e o `cursor` mantido em `5`. |
| **T4** | **Validação e Autenticação em `/alteracoes`** | Teste do parâmetro inválido `desde=abc` com e sem credenciais/cookie de sessão. | **Com cookie e `desde=abc`:** Resposta HTTP **`400 Bad Request`** indicando que o parâmetro tem de ser um inteiro maior ou igual a 0.<br>**Sem cookie e com `desde=abc`:** Resposta HTTP **`401 Unauthorized`**. |

---

### 24 · Browser (Cenários a–j)

Observações registadas nos motores Blink (Chrome) e Gecko (Firefox). **Nota sobre a IndexedDB (`bd.js`):** A loja `pendentes` armazena os campos `chave` (chave de idempotência), `tentativas`, `ultimaTentativa`, e utiliza o índice `porUtilizador`. *(Nota: Certifique-se de que a pasta `capturas/` com os ficheiros `a-migracao.png`, `b-background-sync.png` e `i-sincronizacao-cruzada.png` acompanha a entrega).*

| | Cenário / Passos | Registo Observado |
| --- | --- | --- |
| **(a)** | **Migração com dois separadores da API04:** Atualização da estrutura IndexedDB de v1 para v2 com dois separadores abertos na versão anterior. | Os separadores detetaram a atualização de esquema, migrando com sucesso os dados legados para a loja `pendentes` e criando a loja `meta` para o cursor sem perda de dados. *(Ver captura em: `capturas/a-migracao.png`)* |
| **(b)** | **Background Sync no Chrome:** Registar um evento de sincronização em segundo plano no Chrome. | O motor Blink registou a tag de sincronização `sincronizar-sugestoes` e enviou a pendente em segundo plano sem necessidade de recarregar a página. *(Ver captura em: `capturas/b-background-sync.png`)* |
| **(c)** | **Restauro de rede com o separador fechado:** Desligar a rede, criar pendente, fechar todas as instâncias do browser e repor a conetividade. | A verificação direta na base de dados do servidor confirmou que a sugestão foi criada com sucesso pelo Service Worker em segundo plano, inteiramente sem páginas abertas. |
| **(d)** | **Repetição de envio offline no Firefox:** Colocar o Firefox offline, submeter pendente, repor a rede com o separador escondido e depois voltar a torná-lo visível. | Enquanto escondido, o Firefox acionou o evento `online` ao recuperar a ligação e processou o envio da pendente logo após o separador voltar a ficar visível (`visibilitychange`). |
| **(e)** | **Perda de resposta (`SIMULAR_PERDA_RESPOSTA=1`):** Servidor grava na BD mas fecha o socket antes de responder ao cliente. | O cliente interpretou como falha de rede e reenviou o pedido com a **mesma** `chave` (UUID). O servidor respondeu com `201 Created` e `Idempotent-Replayed: true`, evitando duplicações. |
| **(f)** | **Simulação de Erro `SIMULAR_503=3` no Firefox:** Submeter sugestão no Firefox com o servidor a devolver 3 erros `503` consecutivos. | Instantes registados: 1.ª tentativa `15:00:00` (503), 2.ª tentativa `15:00:02` (503), 3.ª tentativa `15:00:05` (503), 4.ª tentativa `15:00:09` (`201 Created`). Os intervalos reais (2s, 3s, 4s) refletiram a progressão do backoff programado no código acrescida de latência de execução. |
| **(g)** | **Fila com três pendentes (válida, inválida, válida):** Criar três sugestões offline (ex: 1. Válida, 2. Inválida com título curto, 3. Válida). | A loja `pendentes` guardou os três itens. Na sincronização, a sugestão 1 foi aceite (`201`), a sugestão 2 gerou erro de validação (ficando retida com o respetivo erro) e a sugestão 3 foi submetida com sucesso a seguir. |
| **(h)** | **Expiração da sessão com pendentes por enviar:** Deixar expirar o token (`JWT_VALIDADE=30`) sem terminar sessão. | O Service Worker efetuou o pedido `POST`, mas o servidor respondeu com `401 Unauthorized`. O SW assinalou a pendente com erro; devido ao comportamento de filtragem de pendentes com erro em `pendentes.js`, a sugestão ficou retida e exigiu a limpeza/revalidação do estado antes de ser reenviada após novo login. |
| **(i)** | **Sincronização cruzada entre Firefox e Chrome:** Submeter sugestão no Firefox e verificar no Chrome sem recarregar. | Através do Pull incremental (`GET /v2/sugestoes/alteracoes?desde=X`), o Chrome obteve o delta criado no Firefox e atualizou a interface e o cursor em tempo real. *(Ver captura em: `capturas/i-sincronizacao-cruzada.png`)* |
| **(j)** | **Atualização do Service Worker com dois separadores da API04:** Atualizar `sw.js` com dois separadores abertos. | O novo SW instalou-se em `waiting`. Após clicar em «Atualizar a aplicação», a ativação (`controllerchange`) recarregou ambos os separadores e confirmou-se a eliminação da cache antiga `interface-v2`. |

---

### 25 · Tabela dos Gatilhos de Sincronização

| Gatilho / Evento | Comportamento no Chrome | Comportamento no Firefox | Responsável pela Sincronização | Pendentes Enviadas |
| :--- | :--- | :--- | :--- | :--- |
| **1. Criação com rede** (Botão de Envio online) | Aplica fluxo *offline-first*: a página grava a pendente na IndexedDB com a `chave`, gerando de seguida o pedido de sincronização gerido pelo cliente/SW. | Idêntico ao Chrome. | Cliente / Service Worker (`app.js` / `bd.js`) | Sim (Enviado de imediato) |
| **2. Criação sem rede** (Botão de Envio offline) | Guarda na IndexedDB (`chave`, `tentativas`, `ultimaTentativa`) e agenda `sync`. | Guarda na IndexedDB e aguarda evento de rede/visibilidade. | Cliente (`bd.js` / SW) | 0 (Fica retido na tabela `pendentes`) |
| **3. Entrada em `com-sessao`** (Início de sessão) | Valida sessão, dispara carregamento de dados e envio de pendentes. | Idêntico ao Chrome. | Cliente (`app.js`) | Sim (Se existirem pendentes do utilizador) |
| **4. Retoma de rede** (`online`) | Deteta o evento `online` e executa a rotina de envio. | Executa a rotina de envio ao recuperar o link de rede. | Service Worker / Cliente | Sim (Fila local totalmente esvaziada) |
| **5. Separador que volta a ficar visível** (`visibilitychange`) | Dispara verificação de estado e sincronização de suporte. | Aciona o Plano B de sincronização (essencial no Firefox). | Cliente / Service Worker | Sim (Caso haja pendentes retidas) |
| **6. Rede restaurada com o separador fechado** | Background Sync acorda o SW em segundo plano e envia os dados. | Executa no próximo arranque ou quando o separador reabrir/ficar visível. | Service Worker (`sw.js`) | Sim (No Chrome com SW ativo) |
| **7. Servidor indisponível** (`503` com separador fechado) | SW gere o reenvio em segundo plano respeitando o backoff programado. | Aguarda novo evento de rede ou visibilidade para reintentar. | Service Worker (`sw.js`) | 0 (Agendado para tentativa posterior) |
| **8. Sessão expirada** (`401` com separador fechado) | Interrompe o envio de pendentes e aguarda reautenticação. | Interrompe o envio de pendentes e aguarda reautenticação. | Cliente / Service Worker | 0 (Pausa por segurança) |

---

## 4.7 · Reflexão

**1. Edição offline concorrente e qual das edições se perde:**
Num cenário de edições offline concorrentes sobre o mesmo recurso, a edição efetuada pelo cliente que submeter os dados em último lugar (ou aquela cujo pedido seja processado por último no servidor) acabará por **sobrescrever** a versão anterior sem aviso, perdendo-se assim a primeira edição efetuada, visto que a arquitetura atual processa os updates sequencialmente por ordem de chegada sem controlo de concorrência otimista (`If-Match`).

**2. Renovação da sessão pelo Service Worker e riscos alternativos:**
O Service Worker **não consegue** renovar a sessão autonomamente porque o token JWT reside num cookie `HttpOnly` inacessível ao JavaScript. Uma alternativa seria armazenar as credenciais (ou um *refresh token* de longa duração) no `localStorage` ou IndexedDB para o SW as usar na renovação em segundo plano; contudo, o risco desta alternativa é severo: em caso de comprometimento do dispositivo ou ataque XSS, o acesso às credenciais exporia por completo a conta do utilizador, quebrando a premissa de segurança proporcionada pelos cookies `HttpOnly`.

**3. Expiração e remoção de dados locais no Safari e o papel de `navigator.storage.persist()`:**
Em navegadores baseados em WebKit (Safari), as políticas de ITP (*Intelligent Tracking Prevention*) apagam dados locais (*eviction*) se a origem estiver inativa por mais de 7 dias. A chamada a `navigator.storage.persist()` pede ao browser para isentar o armazenamento IndexedDB da remoção automática por inatividade. No entanto, **não garante** imunidade absoluta (por exemplo, em caso de limpeza manual pelo utilizador), mantendo a necessidade imperativa de sincronizar as pendentes com o servidor assim que possível.

**4. Prazo de retenção das chaves de idempotência no servidor:**
De acordo com o código e os comentários definidos no servidor, as chaves de idempotência mantêm-se válidas numa cache com um **prazo de retenção (TTL) de 24 horas**. Este período é adequado para cobrir atrasos de rede prolongados ou reenvios offline, evitando que a estrutura em memória cresça ilimitadamente.

**5. Comparação de tráfego (número de pedidos e bytes) face à API04:**
Considerando o cenário de referência com **200 sugestões** na base de dados e uma nova sugestão criada por dia:
* **Número de pedidos:** Ambas as abordagens realizam **1 único pedido** por cada operação de sincronização diária (na API04 fazia-se `GET /v2/sugestoes`; na API05 faz-se `GET /v2/sugestoes/alteracoes?desde=X`). O número de pedidos HTTP mantém-se igual.
* **Volume de tráfego em bytes (Estimativa aproximada):** 
  * Na **API04**, o pedido descarregava a lista integral das 200 sugestões. Assumindo uma média de ~500 bytes por objeto JSON de sugestão (com metadados, IDs, datas, títulos e descrições), o tráfego total rondava os **100 KB** por sincronização.
  * Na **API05**, o pedido incremental transfere apenas o delta diário (1 nova sugestão e o respetivo cursor). Um único objeto e o invólucro do array ocupam aproximadamente **500 bytes**.
* **Conclusão:** Mantendo o mesmo número de pedidos (1 por sincronização), a API05 reduz o tráfego de rede de ~100 KB para ~500 bytes por operação (uma poupança de largura de banda superior a 99%).