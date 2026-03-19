---
description: Referência obrigatória antes de interagir com accordions do Skychart operacional
---

# Skychart Accordions — Leitura Obrigatória

Antes de implementar QUALQUER interação com abas/accordions do módulo operacional do Skychart:

1. Leia o mapa completo de accordions:
   - Arquivo: `brain/skychart-accordion-map.md` (no artifacts da conversa)
   - Contém todos os 28 IDs, data-cy, textos e notas

2. **REGRA**: Todos os accordions são lazy-loaded (PrimeNG). Conteúdo NÃO existe no DOM quando fechado.
   - Para LER dados: precisa abrir o accordion primeiro
   - Para ESCREVER dados: precisa abrir o accordion primeiro

3. Use a função utilitária `openAccordion(id)` do `content.js`:
```javascript
// Abre accordion e espera conteúdo carregar
var ok = await openAccordion('demurrage');
if (ok) {
    // Conteúdo está no DOM, pode ler/escrever
}
```

4. Seletor confirmado para click manual:
```javascript
document.querySelector('#ACCORDION_ID .ui-accordion-header a').click();
```

5. **NUNCA** use `a[href*="..."]` para accordions — isso pega links de navegação e sai da página.
