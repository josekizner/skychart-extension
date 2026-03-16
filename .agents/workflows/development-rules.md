---
description: Regras fundamentais de desenvolvimento — LEIA ANTES DE QUALQUER TAREFA
---

# Regras Fundamentais

## 1. NUNCA ADIVINHE NADA
- Se não sabe um seletor CSS, ID, classe, estrutura do DOM → **PERGUNTE ao usuário**
- Se não sabe como um componente funciona → **PEÇA pro usuário rodar algo no console (F12)**
- Se não tem certeza de um formato, valor, ou comportamento → **PERGUNTE**
- Zero suposição. Zero chute. Se tem dúvida, pergunta.

## 2. REUTILIZE O ECOSSISTEMA
- Antes de escrever QUALQUER interação com o DOM do Skychart, **BUSQUE no projeto existente** como os outros agentes já fazem a mesma coisa
- Arquivos pra consultar primeiro: `content.js`, `check-agent.js`, `smart-agent.js`, `dom-scanner.js`, `agentic-loop.js`
- Se já existe um padrão funcionando (ex: clicar accordion, preencher campo, detectar armador), **COPIE exatamente o mesmo código**
- O ecossistema é a fonte de verdade, não a sua cabeça

## 3. TRABALHE COM O USUÁRIO
- Se precisa de informação do DOM → peça um comando de console específico pro usuário rodar
- Se precisa ver um elemento → peça screenshot ou inspeção
- Se precisa testar algo → peça pro usuário testar e enviar o log
- Nunca tente resolver sozinho o que pode resolver em 30 segundos perguntando

## 4. ANTES DE CODAR, PESQUISE
- `grep_search` nos arquivos do projeto pra encontrar padrões existentes
- Veja como outros agentes resolvem o mesmo problema
- Só escreva código novo quando confirmar que não existe solução pronta

## 5. SEM TEMPO FIXO
- Nunca use `setTimeout(1000)` fixo pra esperar algo
- Use polling/observação do DOM: verifique se o elemento apareceu
- Use `MutationObserver`, `waitForField`, ou poll com `setInterval`
- O DOM é a fonte de verdade, não um timer arbitrário
