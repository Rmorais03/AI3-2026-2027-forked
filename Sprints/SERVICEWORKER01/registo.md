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
