# JSON01 — Respostas às perguntas

## 12. Verificação de falhas deliberadas

| Alteração introduzida | Ficheiro | Sintaxe errada, inválido ou válido? | Mensagem obtida | O que a mensagem permitiu (ou não) concluir |
| :--- | :--- | :--- | :--- | :--- |
| Retirar a vírgula entre dois pares | `turma.json` ou `disciplinas.json` | Sintaxe errada | `Expected ',' or '}'` / `JSON parse error` | O documento deixa de ser JSON válido; a falha é de sintaxe, não de contrato. O validador não chega a olhar para as regras do schema. |
| Pôr texto onde é esperado um número | `turma.json` | Inválido | `... is not of type integer` / `... is not of type number` | O JSON está bem formado, mas o valor não respeita o tipo exigido pelo schema. A mensagem aponta a propriedade e o tipo esperado. |
| Retirar uma propriedade obrigatória | `turma.json` | Inválido | `... is a required property` | O documento é válido sintaticamente, mas falha a regra de obrigatoriedade do schema. O problema é de estrutura/domain, não de sintaxe. |
| Trocar a ordem de duas propriedades | `turma.json` | Válido | Sem erro | Em JSON, a ordem das propriedades num objeto não é significativa. Isso distingue-se do XML, onde a ordem podia ser imposta pela sequência do schema. |

## 13. Tabela de construções

| Construção | Onde a usou | O que ficou a ser exigido | O que continua a ser permitido |
| :--- | :--- | :--- | :--- |
| `type` / `properties` | No objeto principal de `disciplinas.schema.json` e no objeto `teorica`/`pratica` | Cada valor deve ser de um tipo concreto e cada propriedade precisa de ser declarada com o seu esquema. | Permitem continuar a existir valores diferentes dentro do mesmo objeto, desde que respeitem o tipo e a estrutura declarados. |
| `required` | Em `curso`, `disciplinas`, `codigo`, `nome`, `teorica` | Essas propriedades passam a ser obrigatórias no respetivo objeto. | As propriedades não listadas em `required` continuam opcionais. |
| `items` + `minItems` / `maxItems` | No array `disciplinas` e no array `cursos` | O array tem comprimento mínimo e máximo definidos e cada item respeita um esquema. | O conteúdo de cada item continua a ser livre desde que cumpra o tipo/estrutura exigidos. |
| `pattern` | Na `disciplina` e nos nomes dos docentes | O valor tem de cumprir um padrão textual concreto, como começar com `Aplicacoes` ou iniciar com letra maiúscula seguida de nome e apelido. | Qualquer outro texto que respeite o padrão continua aceite. |
| `enum` | No `codigo`, `data` e nos `cursos` | O valor só pode tomar um número restrito de opções. | A ordenação das opções declaradas não importa; apenas o valor final. |
| `dependencies` | Entre `numeroInscritosTp1` e `docenteTp1`, e o mesmo para o TP2 | Se existir inscrição, o docente correspondente tem de existir; se existir professor, a contagem também deve existir. | A propriedade `docenteTp1` pode existir sozinha? No esquema da ficha, não, porque a dependência é em um sentido: se a propriedade de dados existe, a do docente deve existir. A inversa não é exigida, salvo se se escrever a relação nos dois sentidos. |
| `oneOf` ou `anyOf` | Para `planoAno1` e para o campo `contacto` | O valor deve pertencer a um dos conjuntos alternativos, mas com regras diferentes: `oneOf` exige exatamente uma alternativa válida; `anyOf` exige pelo menos uma. | Em `oneOf`, se dois conjuntos forem simultaneamente válidos para o mesmo valor, esse valor é rejeitado; em `anyOf`, continua aceite. |

## 14. Respostas à reflexão crítica

### 1) Ao converter o XML em JSON, a distinção entre atributo e elemento desapareceu. Perdeu-se informação? Para quem é que isso importa?

A distinção não desaparece totalmente do ponto de vista semântico, mas deixa de estar marcada pela sintaxe do formato. Num XML, um atributo é uma propriedade da etiqueta, enquanto um elemento filho é um valor estrutural dentro do nó. Em JSON, ambos passam a ser meras propriedades do objeto, e a decisão de modelar um dado como atributo ou como subobjeto fica no desenho do documento.

Isso importa para quem processa os dados porque o programa leitor precisa de saber se um campo é metadata, se representa o conteúdo principal do nó, ou se representa uma subestrutura. Se não houver uma convenção clara, a interpretação pode variar entre sistemas.

### 2) O XML Schema da ficha anterior impunha a ordem dos elementos; o JSON Schema não. Isso é uma fraqueza ou uma vantagem para quem escreve o programa leitor?

É uma vantagem para quem lê o documento, porque a ordem das propriedades num objeto não é significativo em JSON. O leitor não precisa de depender de uma sequência rígida para extrair os dados. Isso reduz rigidez e facilita a interoperabilidade entre implementações.

A desvantagem é que, quando a ordem tem significado no domínio, o JSON Schema não o impõe automaticamente. Em casos em que a ordem for semântica, o problema tem de ser resolvido por outra convenção, por exemplo usando um array com ordem explícita ou um campo adicional de indicação.

### 3) O `totalAlunos` é um número entre 16 e 24. Que combinações absurdas de valores o seu schema continua a aceitar? O que faria falta para as impedir?

O schema de base aceita qualquer valor inteiro dentro do intervalo `[16, 24]`. Portanto, continua a aceitar combinações absurdas como:

- `totalAlunos = 24`, mas `numeroInscritosTp1 = 0` e `numeroInscritosTp2 = 0`;
- `totalAlunos = 16`, mas `numeroInscritosTp1 = 12` e `numeroInscritosTp2 = 12`;
- `numeroInscritosTp1 = 20`, `numeroInscritosTp2 = 20`, `totalAlunos = 20`.

Essas inconsistências ocorrem porque o schema valida cada campo de forma independente e não expressa a relação entre campos. Para as impedir, seria preciso uma regra de negócio adicional, por exemplo:

- `numeroInscritosTp1 + numeroInscritosTp2 == totalAlunos`, ou
- `totalAlunos >= max(numeroInscritosTp1, numeroInscritosTp2)`.

Essa verificação ultrapassa o JSON Schema de base e teria de ser feita por código de validação, ou por uma extensão mais avançada do schema.

### 4) Um documento é válido hoje. Amanhã acrescenta-se ao `required` uma propriedade nova. O que acontece a todos os documentos já existentes? Que escolha teria evitado o problema?

Todos os documentos já existentes passam a ser rejeitados como inválidos, porque deixam de cumprir o contrato novo. Isso é um efeito típico de uma mudança de schema: a obrigação nova quebra compatibilidade retroativa.

Para evitar esse problema, a nova propriedade teria de ser declarada como opcional, usando a ausência de `required` para esse campo. Em termos práticos, isso preserva a compatibilidade com documentos antigos.

### 5) Compare o custo de validar com o custo de não validar: que erros passam a ser detetados no momento certo, e que trabalho é que isso poupa a quem escreve o programa leitor?

Sem validação, o programa leitor tem de assumir a responsabilidade de verificar manualmente se:

- a estrutura do JSON está correta;
- todos os campos necessários existem;
- os tipos são os esperados;
- os valores respeitam limites e padrões;
- as propriedades necessárias estão presentes quando as outras existem.

Com validação, estes erros são detetados logo na entrada do documento. Isso poupa trabalho ao programador porque ele pode assumir que os dados recebidos cumprem o contrato e concentrar-se na lógica de negócio, em vez de escrever código defensivo para tratar casos inválidos.

Em resumo, validar cedo reduz falhas de execução e deixa o processamento do dados mais previsível e mais seguro.

---

## Conclusão

O JSON é uma forma compacta e eficaz de representar dados, mas a sua sintaxe permissiva em termos de estrutura não garante que os dados sejam úteis. O JSON Schema preenche esse vazio: ele define o contrato que o documento tem de cumprir antes de ser processado. A combinação correta entre estrutura, tipos, restrições e validação é o que permite que diferentes sistemas troquem informação de forma previsível e interoperável.
