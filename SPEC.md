# Leilão Tracker - Especificação

## Objetivo
Busca diária de leilões de imóveis em Curitiba/Grande Curitiba, enviando resumo via WhatsApp e relatório completo em GitHub Pages.

## Filtros
- **Desconto:** >40%
- **Preço:** <R$ 800k
- **Região:** Curitiba + Grande Curitiba (Almirante Tamandaré, Araucária, Campo Largo, Colombo, Fazenda Rio Grande, Pinhais, São José dos Pinhais)

## Fontes
| Site | Método | Dados disponíveis |
|------|--------|-------------------|
| leilaoimovel.com.br | Browser (Playwright) | Lista + detalhes + ocupação |
| portalzuk.com.br | web_fetch direto | Lista + ocupação direta |
| topoleiloes.com.br | web_fetch direto | Lista + 1º/2º leilão |

## Dados por imóvel
- **Tipo:** Casa / Apartamento / Sobrado / Terreno
- **Bairro:** nome
- **Endereço:** completo
- **Avaliação:** valor original
- **Modalidade:**
  - Leilão: 1º Leilão (data + preço) + 2º Leilão (data + preço)
  - Compra Direta: preço único
  - Venda Online: preço + data limite
- **Desconto:** percentual
- **Área:** m² útil + m² terreno (quando disponível)
- **Ocupação:** Ocupado / Desocupado / Não informado
- **Desocupação:** Por conta do adquirente / Imediata / Não informado
- **Link:** URL original

## Output

### WhatsApp (self-chat por enquanto)
- Top 10 resumido
- Link pro site completo
- Formato limpo, sem emojis excessivos

### GitHub Pages
- Lista completa com todos os filtrados
- Cards clicáveis
- Top 3 destacados
- Resumo com totais

## Cron
- **Horário:** 9h (seg-sex)
- **Destino:** +554184015797 (self-chat) → migrar pro grupo Investment/Flipping quando tiver ID

## Fontes de dados detalhadas

### Portal Zuk
```
URL: https://www.portalzuk.com.br/imovel/pr/curitiba/...
Ocupação: "Imóvel ocupado" / "Imóvel desocupado" (campo direto)
Leilões: "1º LEILÃO: DD/MM/AAAA - R$ X" + "2º LEILÃO: DD/MM/AAAA - R$ Y"
```

### Topo Leilões
```
URL: https://topoleiloes.com.br/lote/...
Leilões: "1º. LEILÃO: Dia, DD/MM/AAAA - HH:MM - R$ X"
```

### Leilão Imóvel
```
URL: https://www.leilaoimovel.com.br/imovel/...
Ocupação: Campo "Observações" → "Imóvel Ocupado. Desocupação por conta do adquirente..."
Modalidade: "Compra Direta" / "Leilão SFI" / "Venda Online"
```

## Histórico
- Manter arquivos em `/leilao-tracker/data/YYYY-MM-DD.json`
- Comparar com dia anterior pra identificar novos
