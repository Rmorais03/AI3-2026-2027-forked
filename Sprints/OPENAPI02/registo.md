# Registo — OPENAPI02

## Utilizadores e palavras-passe de teste

As palavras-passe seguintes são apenas para as contas fictícias desta demonstração. O ficheiro `servidor/dados/utilizadores.json` contém apenas hashes bcrypt de custo 10.

| Utilizador | Nome | Papel | Palavra-passe de teste |
| --- | --- | --- | --- |
| `12345` | Ana Silva | `aluno` | `Sugerir-ana-2026!` |
| `67890` | Bruno Costa | `aluno` | `Sugerir-bruno-2026!` |
| `rita.sousa` | Rita Sousa | `servicos` | `Sugerir-rita-2026!` |

O segredo `JWT_SEGREDO` foi criado localmente para os testes e não está incluído no controlo de versões nem na entrega. O `.env` local é ignorado pelo Git; a entrega contém apenas `.env.exemplo`.

## Como executar

É necessário Node.js 20 ou superior. A partir de `Sprints/OPENAPI02/servidor`, executar `npm install`, copiar `.env.exemplo` para `.env`, definir `JWT_SEGREDO` nesse ficheiro com um segredo aleatório forte e executar `npm start`. Pode gerar-se um valor com `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Não se deve partilhar nem versionar o `.env`; `JWT_VALIDADE` está em segundos e o valor predefinido é 900.

## Respostas «Antes de avançar»

### Versão e compatibilidade

O cliente da v1 que chama uma operação protegida sem enviar `Authorization` deixa de funcionar na v2: o pedido passa a receber `401` porque não apresenta autenticação válida. É uma alteração incompatível e justifica a versão principal `2.0.0` e o URL base `/v2`.

### `numeroAluno` enviado por um cliente antigo

Depois de remover `numeroAluno` de `SugestaoNova`, um cliente da v1 ainda pode enviar essa propriedade no corpo. Como o schema não define `additionalProperties: false`, o OpenAPI não rejeita automaticamente propriedades adicionais. O servidor deve ignorar o valor recebido e obter o número de aluno do token verificado; nunca deve confiar no `99999` enviado pelo cliente.

### Cache e identidade

| Resposta | Depende da identidade? | Política documentada |
| --- | --- | --- |
| `GET /sugestoes` | Sim: o conjunto de resultados depende do aluno autenticado. | `private, no-cache` |
| `GET /sugestoes/{id}` e `GET .../acompanhamentos` | Sim: um aluno só pode aceder aos seus recursos. | `private, no-cache` |
| Respostas de escrita (`POST`, `PUT`, `DELETE`) | Podem revelar ou alterar dados associados ao utilizador. | `no-store` |
| `POST /tokens` | Sim; a resposta contém uma credencial reutilizável. | `no-store` |
| Todas as respostas `401` e `403` | Estão relacionadas com a autenticação/autorização do requerente. | `no-store` |
| Estatísticas e categorias | Não dependem da identidade no âmbito desta ficha. | Cache pública já definida na API01 |

`private` impede que uma cache partilhada armazene a resposta personalizada; `no-cache` exige revalidação antes de reutilização. Uma resposta com dados pessoais não pode ser marcada `public`: um proxy poderia servir a resposta do primeiro aluno a outro aluno.

### `jwt.verify`

O middleware chama `jwt.verify(token, segredo, { algorithms: ['HS256'] })`. O segredo permite verificar a assinatura; `algorithms` restringe a verificação a `HS256` e rejeita, por exemplo, um token com `alg: none` ou outro algoritmo. A biblioteca verifica o claim `exp` por omissão. O middleware também confirma a forma dos claims usados pela aplicação (`sub`, `nome`, `papel`, `iat` e `exp`) antes de os copiar para `req.utilizador`.

## 27 · Validação das alterações deliberadas ao contrato

Ferramenta: `npx @redocly/cli lint`. As alterações foram feitas em cópias temporárias; o contrato de entrega foi preservado.

| Alteração introduzida | Tipo de problema | Ferramenta e mensagem obtida | O que se concluiu |
| --- | --- | --- | --- |
| Referir `tokenJWT` na segurança global e renomear a sua declaração em `securitySchemes`. | OpenAPI inválido. | Redocly saiu com erro na regra `security-defined`: o requisito de segurança referencia um esquema não declarado. | O validador deteta referências a esquemas de segurança inexistentes. |
| Alterar `type: http` para `type: bearer`. | OpenAPI inválido. | Redocly saiu com erros estruturais (`struct`): `bearer` não é um valor permitido para `type`; o esquema Bearer pertence à família `http`. | `type` identifica a família do esquema; `scheme: bearer` identifica o mecanismo dentro de HTTP. |
| Usar `tokenJWT: [servicos]` em `registarAcompanhamento`. | OpenAPI semanticamente inválido para este esquema HTTP. | O lint predefinido terminou sem erro nem aviso específico para esta alteração. | A ausência de diagnóstico não provou a validade: um esquema HTTP Bearer não define scopes de OAuth. A autorização por papel tem de ser descrita e aplicada pelo servidor. |
| Retirar `security: []` de `listarCategorias`. | YAML e OpenAPI válidos, mas com alteração de comportamento. | Redocly não assinalou erro específico. | Sem a isenção explícita, a operação herda a segurança global e deixa de ser pública para os clientes do contrato. |
| Manter `numeroAluno` em `required` de `SugestaoNova`, depois de remover a propriedade. | YAML/OpenAPI estruturalmente válidos, mas schema incoerente com a intenção da v2. | Redocly não assinalou erro. | `required` pode nomear uma propriedade não declarada. Sem `additionalProperties: false`, o campo continua a ser exigido sem ter tipo/restrições documentados. |
| Usar `tipo: bearer` no exemplo de `Token`. | Exemplo inválido face ao schema. | Redocly avisou pela regra `no-invalid-media-type-examples`: `tipo` tem de ser um dos valores permitidos, `"Bearer"`. | O exemplo tem de respeitar o enum; a comparação dos valores é sensível a maiúsculas/minúsculas. |

O lint do contrato final terminou sem erros. A configuração recomendada de Redocly emitiu dois avisos não bloqueantes: falta uma licença em `info` e `listarCategorias` não declara uma resposta `4XX`. A ficha exige a manutenção das respostas da API01 e não pede uma licença, pelo que estes avisos não foram convertidos em alterações funcionais fora do âmbito.

## 28 · Verificação HTTP do servidor

T1–T11 foram efetuados com `curl -i`; em T12, foi reutilizado no browser o cabeçalho Bearer capturado no pedido de rede antes do logout. Os tokens completos foram omitidos do registo: são credenciais Bearer e não devem ser guardados ou partilhados. O corpo de T2 e T3 foi comparado byte a byte.

| # | Pedido | Código | `Cache-Control` | `WWW-Authenticate` | Corpo/resultado observado |
| --- | --- | --- | --- | --- | --- |
| T1 | `POST /v2/tokens`, credenciais da Ana | `200` | `no-store` | — | `{"token":"[JWT omitido]","tipo":"Bearer","expiraEm":900}` |
| T2 | `POST /v2/tokens`, utilizador existente e palavra-passe errada | `401` | `no-store` | — | `{"codigo":401,"mensagem":"Utilizador ou palavra-passe inválidos."}` |
| T3 | `POST /v2/tokens`, utilizador `99999` | `401` | `no-store` | — | Igual a T2, byte a byte; foi efetuada uma comparação bcrypt com um hash de custo 10 mesmo sem utilizador. |
| T4 | `POST /v2/tokens`, `utilizador` enviado como número | `400` | `no-store` | — | `{"codigo":400,"mensagem":"O corpo do pedido não cumpre o schema Credenciais.","detalhes":[{"campo":"utilizador","problema":"Tem de ser um número de aluno válido ou um identificador nome.apelido."}]}` |
| T5 | `POST /v2/tokens`, corpo `{utilizador:` | `400` | `no-store` | — | `{"codigo":400,"mensagem":"O corpo do pedido não contém JSON válido."}` |
| T6 | `GET /v2/sugestoes`, sem `Authorization` | `401` | `no-store` | `Bearer` | `{"codigo":401,"mensagem":"É necessária autenticação Bearer."}` |
| T7 | `GET /v2/sugestoes`, token da Ana | `200` | `private, no-cache` | — | `ListaSugestoes`: `pagina: 1`, `tamanhoPagina: 20`, `total: 2`; itens `42` e `43`, ambos com `numeroAluno: "12345"`. |
| T8 | `GET /v2/sugestoes`, token da Rita (`servicos`) | `200` | `private, no-cache` | — | `ListaSugestoes`: `pagina: 1`, `tamanhoPagina: 20`, `total: 4`; itens `42` a `45`, incluindo sugestões da Ana e do Bruno. |
| T9 | T7 com um carácter do payload alterado | `401` | `no-store` | `Bearer error="invalid_token"` | `{"codigo":401,"mensagem":"Token inválido ou expirado."}` |
| T10 | Token emitido com `JWT_VALIDADE=10`, pedido após 11 segundos | `401` | `no-store` | `Bearer error="invalid_token"` | `{"codigo":401,"mensagem":"Token inválido ou expirado."}` |
| T11 | T7 com cabeçalho `{"alg":"none","typ":"JWT"}`, payload da Ana e assinatura vazia | `401` | `no-store` | `Bearer error="invalid_token"` | `{"codigo":401,"mensagem":"Token inválido ou expirado."}` |
| T12 | Reutilizar o cabeçalho Bearer capturado na Rede depois de «Terminar sessão» | `200` | `private, no-cache` | — | O servidor voltou a devolver as duas sugestões da Ana; o logout local não revogou o token. |

O contrato também foi servido em `GET /v2/openapi.yaml` com `Content-Type: application/yaml`.

Corpos completos observados em T7 e T8:

```text
T7:
{"pagina":1,"tamanhoPagina":20,"total":2,"itens":[{"id":42,"titulo":"Melhorar os espaços de estudo","descricao":"Criar mais espaços de estudo com mesas e tomadas disponíveis.","categoria":"instalacoes","numeroAluno":"12345","estado":"aceite","dataCriacao":"2026-10-01T10:00:00Z","dataAtualizacao":"2026-10-05T14:30:00Z","dataResolucao":null},{"id":43,"titulo":"Ampliar o horário da biblioteca","descricao":"Manter a biblioteca aberta durante mais tempo nos períodos de avaliação.","categoria":"servicos","numeroAluno":"12345","estado":"submetida","dataCriacao":"2026-10-06T09:15:00Z","dataAtualizacao":"2026-10-06T09:15:00Z","dataResolucao":null}]}

T8:
{"pagina":1,"tamanhoPagina":20,"total":4,"itens":[{"id":42,"titulo":"Melhorar os espaços de estudo","descricao":"Criar mais espaços de estudo com mesas e tomadas disponíveis.","categoria":"instalacoes","numeroAluno":"12345","estado":"aceite","dataCriacao":"2026-10-01T10:00:00Z","dataAtualizacao":"2026-10-05T14:30:00Z","dataResolucao":null},{"id":43,"titulo":"Ampliar o horário da biblioteca","descricao":"Manter a biblioteca aberta durante mais tempo nos períodos de avaliação.","categoria":"servicos","numeroAluno":"12345","estado":"submetida","dataCriacao":"2026-10-06T09:15:00Z","dataAtualizacao":"2026-10-06T09:15:00Z","dataResolucao":null},{"id":44,"titulo":"Reforçar o apoio informático","descricao":"Disponibilizar apoio técnico adicional nos laboratórios de informática.","categoria":"ensino","numeroAluno":"67890","estado":"em_analise","dataCriacao":"2026-10-07T11:20:00Z","dataAtualizacao":"2026-10-08T08:45:00Z","dataResolucao":null},{"id":45,"titulo":"Criar mais atividades culturais","descricao":"Organizar atividades culturais abertas a todos os estudantes.","categoria":"atividades","numeroAluno":"67890","estado":"resolvida","dataCriacao":"2026-10-02T13:00:00Z","dataAtualizacao":"2026-10-10T16:10:00Z","dataResolucao":"2026-10-10T16:10:00Z"}]}
```

## 29 · Observações do cliente

| Verificação | Observação |
| --- | --- |
| (a) `POST /v2/tokens` | O browser recebeu `200` e `Cache-Control: no-store`; a palavra-passe foi limpa depois da autenticação. |
| (b) Pedido das sugestões | O pedido incluiu `Authorization: Bearer <token>`; a Ana recebeu duas sugestões e os serviços receberam quatro. |
| (c) Expiração automática | Com `JWT_VALIDADE=30`, a contagem começou em `00:30`; ao chegar a zero, a sessão terminou sem pedido adicional e foi apresentada «Sessão expirada. É necessária nova autenticação.». O prazo do cliente não ultrapassa o instante absoluto `exp` e usa também a duração `expiraEm` da resposta. |
| (d) Recarregamento | Recarregar a página com sessão ativa regressou ao formulário: o token estava apenas na variável do módulo e perdeu-se com o documento. |
| (e) Armazenamento | Durante uma sessão ativa, `localStorage.length` e `sessionStorage.length` eram ambos `0`. |
| Largura e foco | A 360 px, a largura do documento permaneceu 360 px, sem scroll horizontal; o campo focado apresentou contorno sólido visível. |
| UTF-8 do payload | O descodificador devolveu corretamente o nome acentuado `João Ávila` a partir de um payload UTF-8. |
| Conteúdo das sugestões | Título, categoria e estado foram construídos com `textContent`; não é usado `innerHTML`. |

Verificações adicionais: a aplicação não arrancou com `JWT_SEGREDO` ausente nem com um segredo curto, e o middleware `exigirPapel('servicos')` devolveu `403`, `Cache-Control: no-store` e um corpo `Erro` quando recebeu um utilizador com papel `aluno`.

## 30 · Construções utilizadas na especificação

| Construção | Onde foi utilizada | O que passou a ser exigido | O que continua a ser permitido |
| --- | --- | --- | --- |
| `securitySchemes` `http`/`bearer` | `components.securitySchemes.tokenJWT` | O cliente protegido deve enviar uma credencial Bearer no cabeçalho HTTP `Authorization`. | `bearerFormat: JWT` informa o formato esperado, mas não valida nem cifra o token. |
| `security` na raiz | Raiz do contrato | As operações herdam autenticação por omissão. | Uma operação pode substituir o requisito herdado. |
| `security: []` | `GET /categorias`, estatísticas e `POST /tokens` | Estas operações ficam explicitamente isentas da segurança global. | Continuam públicas; o servidor pode ainda validar os seus próprios dados de entrada. |
| `readOnly` em `numeroAluno` | Subschema de resposta `Sugestao` | O número identifica o aluno associado à sugestão e é produzido pelo servidor. | O cliente não precisa de o enviar na criação; a anotação OpenAPI, por si só, não substitui a validação do servidor. |
| Resposta `401` + `WWW-Authenticate` | Respostas das operações protegidas | O cliente recebe o desafio Bearer; token inválido/expirado é indicado com `error="invalid_token"`. | O cliente pode voltar a autenticar-se e repetir a operação apropriada. |
| Resposta `403` | Operações restritas por papel | Uma identidade autenticada sem o papel necessário não executa a operação. | O utilizador pode continuar a aceder às operações para as quais está autorizado. |
| `exigirToken` + `jwt.verify` | Middleware Express em `autenticacao.js` | Assinatura e expiração são verificadas e só se aceitam tokens `HS256` com os claims esperados. | A verificação da assinatura não substitui a verificação do papel nem da propriedade do recurso. |
| `Cache-Control: no-store` em `criarToken` | `POST /v2/tokens`, resposta `200` | A resposta com o token não deve ser armazenada em cache. | O cliente conserva o token apenas durante a vida do documento, em memória. |

## 31 · Reflexão crítica

1. **T12 e revogação:** «Terminar sessão» elimina a cópia do token no cliente e repõe o formulário; não altera o token assinado. O servidor continua a aceitá-lo até `exp`. Revogação antecipada exigiria estado no servidor, por exemplo uma lista de revogação/sessões, e deixaria de ser uma verificação puramente autossuficiente.
2. **Validade:** 15 segundos reduzem a janela de reutilização de um token roubado, mas interrompem facilmente operações legítimas e obrigam a autenticações frequentes. 15 dias melhoram a conveniência, mas aumentam a janela de abuso e atrasam a aplicação de alterações de papel. Os 15 minutos equilibram estes riscos nesta demonstração.
3. **Memória, `localStorage` e cookies:** a variável do módulo perde-se ao fechar/recarregar a página; enquanto a página está ativa, código executado por XSS ainda pode aceder ao token. `localStorage` persiste entre sessões e é igualmente acessível a JavaScript; `sessionStorage` sobrevive a recarregamentos na mesma aba e também é acessível a scripts. Um cookie `HttpOnly` não é legível por JavaScript, mas é enviado automaticamente pelo browser, introduzindo risco de CSRF e exigindo medidas adicionais, fora do âmbito.
4. **Papel no token:** incluir `papel` evita uma consulta a estado em cada pedido, mas mantém a autorização antiga até o token expirar. Consultar o papel atual no servidor aplica alterações mais cedo, mas requer estado/consulta por pedido e reduz a autonomia do token.
5. **`HS256` entre serviços:** cada serviço que verifica tokens precisa do segredo e, por isso, também consegue emitir tokens. Partilhar esse segredo aumenta o número de componentes capazes de falsificar credenciais e o impacto de uma fuga. Assinatura assimétrica permitiria distribuir chaves públicas de verificação, mas está fora dos esquemas e mecanismos admitidos nesta ficha.
6. **Tentativas de palavra-passe:** o contrato pode documentar uma resposta `429`, mas não impõe um limite. A limitação tem de ser aplicada pelo servidor ou por um gateway, com contagem e janela de tentativas; a resposta apropriada é `429 Too Many Requests`.
7. **HTTP sem TLS:** um token Bearer enviado por HTTP pode ser observado e reutilizado por alguém na rede. A assinatura permite detetar adulteração, mas não impede intercetação, leitura do payload ou replay. Em produção é necessário HTTPS.
8. **Contrato, servidor e testes:** o contrato descreve as regras e formatos para clientes e ferramentas; não executa a autorização. O servidor tem de verificar papel e propriedade em cada operação implementada. Os testes demonstram casos concretos e detetam regressões conhecidas, mas não provam todos os casos possíveis. Nesta entrega, só `GET /v2/sugestoes` é implementado; as operações restantes estão documentadas no contrato, mas a autorização das suas futuras implementações não pode ser garantida por este servidor de demonstração.

## Âmbito da implementação

O servidor implementa autenticação, emissão/verificação de tokens, publicação do contrato e apenas a operação protegida `GET /v2/sugestoes`, como pedido. As outras operações de sugestões, acompanhamentos e estatísticas permanecem apenas no contrato. O servidor corre com Node.js 22.23.3 durante os testes e tem como dependências diretas apenas `express`, `jsonwebtoken` e `bcryptjs`.
