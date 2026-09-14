# Reflexão crítica sobre a ficha XML

## 1. Critério para decidir entre elemento e atributo

Usei o critério de perguntar se o dado é uma propriedade simples e identificadora do elemento, ou se precisa de ter estrutura interna, repetir-se ou evoluir para outros dados.

- `id` foi escolhido como atributo porque é um identificador simples do `cabecalho`.
- `telefone` foi escolhido como elemento porque pode, no futuro, ter mais informação associada (por exemplo, país, tipo de linha, extensão, etc.).

## 2. Dado que poderia ser atributo e um que não poderia

- Poderia ser atributo: `id` da fatura, porque é um identificador simples e único.
- Não poderia ser atributo: `morada`, porque pode ter estrutura interna com rua, código postal e localidade.

A diferença é que um atributo guarda um valor simples, enquanto um elemento pode conter outros elementos e ter estrutura interna.

## 3. O total da fatura deve estar no ficheiro ou ser calculado?

O total pode estar no ficheiro, mas também pode ser calculado quando o ficheiro é lido.

- Se estiver no ficheiro, o documento fica mais direto e pode ser usado sem recalcular.
- Se for calculado, evita duplicação e reduz o risco de inconsistência.

Na prática, para uma fatura, o total pode ser guardado como informação adicional, mas o programa que lê o XML também pode calculá-lo a partir das quantidades e preços.

## 4. A estrutura permite uma fatura sem produtos? E com dois clientes?

- Uma fatura sem produtos pode existir na estrutura, porque o XML por si só não impede essa situação.
- Uma fatura com dois clientes também pode existir, se a estrutura permitir isso, porque o XML não impõe uma regra semântica para dizer que só pode haver um cliente.

O XML apenas define a estrutura sintática. As regras de negócio têm de ser impostas por quem desenha a estrutura ou por quem lê os dados.

## 5. Dois colegas fizeram hierarquias diferentes e ambos os ficheiros ficaram bem formados

O problema é que o mesmo domínio pode ser representado de formas diferentes, e isso pode causar ambiguidade para quem escreve o programa que lê os ficheiros.

Se duas pessoas usarem hierarquias diferentes, um programa pode não saber qual é a estrutura esperada para encontrar os dados.

Por isso, é importante definir uma convenção clara para a árvore e para a organização dos dados.
