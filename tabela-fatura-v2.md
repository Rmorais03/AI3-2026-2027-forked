# Tabela para fatura-v2.xml

## Estrutura da árvore

| Tipo de nó | Nome | Pai | Irmãos | Justificação |
|---|---|---|---|---|
| Raiz | `fatura` | — | — | É o elemento que contém todos os outros; é a raiz da árvore. |
| Intermédio | `cabecalho` | `fatura` | `cliente`, `produtos` | Contém o elemento `data` dentro dele. |
| Intermédio | `cliente` | `fatura` | `cabecalho`, `produtos` | Contém os elementos `nome`, `morada` e `telefone`. |
| Intermédio | `produtos` | `fatura` | `cabecalho`, `cliente` | Agrupa a coleção de elementos `produto`. |
| Intermédio | `produto` | `produtos` | outro `produto` | Cada produto é um elemento que contém os detalhes do produto. |
| Terminal | `data` | `cabecalho` | — | É um elemento terminal porque contém texto e não contém outros elementos. |
| Terminal | `nome` | `cliente` | `morada`, `telefone` | Contém texto (`Maria Silva`). |
| Terminal | `morada` | `cliente` | `nome`, `telefone` | Contém texto (`Rua das Flores, 123, Porto`). |
| Terminal | `telefone` | `cliente` | `nome`, `morada` | Contém texto (`912345678`). |
| Terminal | `codigo` | `produto` | `designacao`, `quantidade`, `preco` | Contém texto (`ABC-100` ou `XYZ-220`). |
| Terminal | `designacao` | `produto` | `codigo`, `quantidade`, `preco` | Contém texto (`Caneta esferográfica azul`, `Bloco de notas A5`). |
| Terminal | `quantidade` | `produto` | `codigo`, `designacao`, `preco` | Contém texto (`2` ou `1`). |
| Terminal | `preco` | `produto` | `codigo`, `designacao`, `quantidade` | Contém texto (`1.50` ou `3.20`). |
| Atributo | `id` | `cabecalho` | — | Está escrito dentro da etiqueta de abertura do `cabecalho`; não é um filho do elemento. |
| Texto | `2026/001` | `cabecalho` | — | É o valor do atributo `id`. |
| Texto | `2026-09-14` | `data` | — | É o conteúdo textual do elemento `data`. |
| Texto | `Maria Silva` | `nome` | — | É o conteúdo textual do elemento `nome`. |
| Texto | `Rua das Flores, 123, Porto` | `morada` | — | É o conteúdo textual do elemento `morada`. |
| Texto | `912345678` | `telefone` | — | É o conteúdo textual do elemento `telefone`. |
| Texto | `ABC-100` | `codigo` | — | É o conteúdo textual do primeiro `codigo`. |
| Texto | `Caneta esferográfica azul` | `designacao` | — | É o conteúdo textual do primeiro `designacao`. |
| Texto | `2` | `quantidade` | — | É o conteúdo textual do primeiro `quantidade`. |
| Texto | `1.50` | `preco` | — | É o conteúdo textual do primeiro `preco`. |
| Texto | `XYZ-220` | `codigo` | — | É o conteúdo textual do segundo `codigo`. |
| Texto | `Bloco de notas A5` | `designacao` | — | É o conteúdo textual do segundo `designacao`. |
| Texto | `1` | `quantidade` | — | É o conteúdo textual do segundo `quantidade`. |
| Texto | `3.20` | `preco` | — | É o conteúdo textual do segundo `preco`. |

## Observação

Na versão 2, o número da fatura deixou de ser um elemento e passou a ser o atributo `id` do elemento `cabecalho`.
