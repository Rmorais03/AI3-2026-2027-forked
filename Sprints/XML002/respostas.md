# 4.3 Verificação - Falhas Deliberadas

| Falha introduzida | Ficheiro | Mal formado ou inválido? | Mensagem obtida | O que a mensagem permitiu (ou não) concluir |
| :--- | :--- | :--- | :--- | :--- |
| **Retirar uma etiqueta de fecho** | `produto.xml` | **Mal formado** | produto.xml:16: parser error : Opening and ending tag mismatch: ProductName line 5 and Product produto.xml:16: parser error : Premature end of data in tag Product line 2* | A mensagem aponta uma falha na sintaxe básica do XML. O documento não chega a ser validado contra o schema porque não é um XML válido. |
| **Pôr texto onde é esperado um número** | `produto.xml` | **Inválido** | Element 'Price': 'cento e vinte' is not a valid value of the atomic type 'xs:decimal'. produto.xml fails to validate | O ficheiro é um XML correto, mas quebra a regra de dados do schema. A mensagem avisa que o conteúdo não corresponde ao tipo declarado. |
| **Trocar a ordem de dois elementos** | `produto.xml` | **Inválido** | Element 'Class': This element is not expected. Expected is ( Price ). produto.xml fails to validate | O documento falha a regra estrutural da `xsd:sequence`. A mensagem acusa falha na posição, indicando o elemento esperado. |

## 12. Tabela de Construções

| Construção | Onde a usou | O que ficou a ser exigido | O que continua a ser permitido |
| :--- | :--- | :--- | :--- |
| **`xsd:complexType`** | No elemento `Product` (e no `Provider`). | O elemento passa a ter de conter obrigatoriamente a estrutura interna especificada (sub-elementos ou atributos). | A adição de múltiplos atributos ou uma hierarquia aninhada complexa. |
| **`xsd:sequence`** | Dentro do `complexType` principal de `Product`. | Os elementos filhos (como `ProductName`, `ProductType`, etc.) têm de aparecer exatamente pela ordem definida no schema. | O conteúdo exato de cada um desses elementos filhos continua apenas dependente do seu tipo de dados (ex: qualquer string). |
| **`xsd:attribute com use`** | No atributo `ProductID` com `use="required"`. | A presença daquele atributo na etiqueta de abertura do elemento no XML passa a ser obrigatória. | A ordem em que os atributos são escritos na etiqueta XML continua a ser livre. |
| **`minOccurs / maxOccurs`** | No elemento `Provider` (`minOccurs="0"` e `maxOccurs="3"`). | O número máximo de blocos `<Provider>` não pode ultrapassar 3 por cada produto. | A ausência total de fabricantes continua permitida, visto que o limite mínimo é 0. |
| **`mixed="true"` (de aviso.xsd)** | No `complexType` do elemento raiz `<aviso>`. | Os elementos marcados (`<nome>`, `<dataentrega>`, etc.) continuam rigidamente sujeitos à ordem e multiplicidade declaradas no schema. | A inserção de texto livre, solto e não estruturado entre as etiquetas e à volta delas. |

## 4.4 Reflexão Crítica

**13. Respostas às questões:**

*   **Na ficha anterior, dois colegas produziram faturas bem formadas com hierarquias diferentes. Um schema resolve esse problema? Quem tem de o escrever, e quando, para que resolva?**
    Sim, o schema resolve esse problema porque especifica os elementos e atributos permitidos, a sua ordem exata e a sua multiplicidade, forçando uma estrutura única. Para garantir a interoperabilidade e resolver a ambiguidade, o schema tem de ser escrito e acordado antes da troca de documentos, estabelecendo a estrutura válida que os documentos gerados têm obrigatoriamente de respeitar para não serem rejeitados.

*   **O Price do produto é um número. Que valores absurdos o seu schema continua a aceitar? O que faria falta para os impedir?**
    O tipo declarado garante apenas o formato numérico, pelo que continua a aceitar valores absurdos para o negócio, como preços negativos ou zero. Com o schema de base, não é possível impedir isto, pois os tipos primitivos não impõem limites de valor. Para o impedir, seria necessário recorrer a restrições no schema ou essa validação das regras de negócio teria de ser obrigatoriamente feita pelo próprio programa leitor no momento de processar os dados.

*   **Um documento é válido hoje. Amanhã acrescenta-se um elemento novo ao schema, obrigatório. O que acontece a todos os documentos já existentes? Que escolha de multiplicidade teria evitado o problema?**
    Todos os documentos já existentes passam a ser imediatamente rejeitados como inválidos contra o novo schema, uma vez que não contêm o novo elemento. Esta quebra de compatibilidade com os documentos antigos teria sido evitada se o novo elemento tivesse sido declarado como opcional, utilizando o atributo de multiplicidade `minOccurs="0"`.

*   **Compare o custo de validar com o custo de não validar: que erros passam a ser detetados no momento certo, e que trabalho é que isso poupa a quem escreve o programa leitor?**
    Sem validação, quem escreve o programa leitor tem de assumir o custo de programar lógicas de defesa para garantir que os dados esperados existem, têm o tipo certo e estão na posição correta da árvore. Ao validar contra o schema, erros estruturais, ausência de dados obrigatórios e tipos de dados incorretos são detetados à entrada. Isto poupa trabalho a quem desenvolve o programa leitor, pois este pode confiar cegamente que o documento recebido tem a estrutura e os tipos garantidos, focando-se apenas em processar a informação.

*   **O mixed="true" permite texto livre entre os elementos. Que tipo de documentos ficaria impossível de especificar sem esse mecanismo? Dê um exemplo diferente do desta ficha.**
    Ficaria impossível especificar documentos semi-estruturados, que são blocos de texto corrido com segmentos de dados marcados. Sem o atributo `mixed="true"`, a presença de texto livre entre os elementos tornaria o documento inválido, pois a estrutura não o permite por omissão. Um exemplo típico seria uma cláusula de um contrato: `<clausula>O trabalhador <trabalhador>João Silva</trabalhador> auferirá um salário de base de <salario>1200</salario> euros.</clausula>`.