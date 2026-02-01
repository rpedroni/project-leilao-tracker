# Leilão Tracker - Especificação

## Objetivo
Busca diária de oportunidades imobiliárias em Curitiba/Grande Curitiba - leilões E imobiliárias normais com bons negócios. Envio de resumo via WhatsApp e relatório completo em GitHub Pages.

## Filtros
- **Desconto:** >40% (ou preço muito abaixo do mercado)
- **Preço:** <R$ 800k
- **Região:** Curitiba + Grande Curitiba
  - **Bairros prioritários:** Água Verde, Batel, Bigorrilho, Centro, Portão, Rebouças, Alto da XV, Cristo Rei, Jardim Social, Juvevê, Hugo Lange, Cabral, Boa Vista, Bacacheri, Tarumã
  - **Grande Curitiba:** Almirante Tamandaré, Araucária, Campo Largo, Colombo, Fazenda Rio Grande, Pinhais, São José dos Pinhais

## Fontes Ativas

### Leilões
| Site | Status | Método | Notas |
|------|--------|--------|-------|
| leilaoimovel.com.br | ⚠️ URLs mudaram | Browser | Precisa ajuste de filtros |
| portalzuk.com.br | ⚠️ URLs mudaram | Browser/fetch | Precisa ajuste de endpoints |
| topoleiloes.com.br | ⚠️ URLs mudaram | web_fetch | Precisa ajuste |
| megaleiloes.com.br | 🆕 A testar | - | Site grande de leilões |
| soldleiloes.com.br | 🆕 A testar | - | - |
| biasi.com.br | 🆕 A testar | - | - |
| santanderleiloes.com.br | 🆕 A testar | - | Banco Santander |
| itauleiloes.com.br | 🆕 A testar | - | Banco Itaú |
| bradesco.com.br/leiloes | 🆕 A testar | - | Banco Bradesco |

### Imobiliárias (oportunidades abaixo do mercado)
| Site | Status | Método | Notas |
|------|--------|--------|-------|
| olx.com.br/imoveis | 🆕 A testar | - | Classificados, às vezes tem urgência |
| zapimoveis.com.br | 🆕 A testar | - | Grande portal |
| vivareal.com.br | 🆕 A testar | - | Grande portal |
| imovelweb.com.br | 🆕 A testar | - | Grande portal |
| chavesnamao.com.br | 🆕 A testar | - | - |
| quintoandar.com.br | 🆕 A testar | - | Foco em aluguel mas tem venda |

### Descoberta de Novos Sites
- **Diariamente:** Fazer uma busca rápida por novos sites de leilão/oportunidades em Curitiba
- **Termos de busca:** "leilão imóvel curitiba", "imóvel abaixo mercado curitiba", "oportunidade imobiliária curitiba"
- **Adicionar novos sites** à tabela acima quando encontrados

## Dados por imóvel
- **Tipo:** Casa / Apartamento / Sobrado / Terreno
- **Bairro:** nome (OBRIGATÓRIO para filtro)
- **Endereço:** completo
- **Avaliação:** valor original/mercado
- **Preço:** lance mínimo ou preço de venda
- **Desconto:** percentual vs avaliação/mercado
- **Modalidade:** Leilão / Compra Direta / Venda Online / Venda Normal
- **Área:** m² útil + m² terreno (quando disponível)
- **Ocupação:** Ocupado / Desocupado / Não informado
- **Fonte:** qual site/imobiliária
- **Link:** URL original

## Output

### WhatsApp (self-chat por enquanto)
- **Data no topo** (ex: "🏠 TOP 5 LEILÕES - 30/01")
- Top 5 resumido
- Link pro site completo (página do dia)
- Formato limpo, sem emojis excessivos

### GitHub Pages
**Fluxo diário:**
1. Buscar melhores oportunidades do dia (leilões + imobiliárias)
2. Filtrar por bairros prioritários
3. Gerar mensagem WhatsApp com Top 5
4. Atualizar `index.html` com lista atual de ativos
5. Criar `YYYY-MM-DD.html` como snapshot histórico

**Estrutura:**
- `index.html` → Lista principal com todos os imóveis bons AINDA ATIVOS
- `YYYY-MM-DD.html` → Snapshot do dia (histórico, mantido pra consulta)
- `sources.md` → Lista de todas as fontes sendo monitoradas

**Navegação:**
- Todas as páginas têm nav com links pras datas
- Formato: `📅 Histórico: Atual | 30/01 | 29/01 | ...`

**Conteúdo:**
- Cards clicáveis
- Top 5 destacados (bairros prioritários primeiro)
- Resumo com totais
- Indicador de fonte (leilão vs imobiliária)
- Filtro por bairro no HTML

## Cron
- **Horário:** 8h (seg-sex)
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
- Log de fontes testadas em `sources.md`

## Próximos Passos
1. [ ] Corrigir URLs dos sites de leilão (mudaram estrutura)
2. [ ] Testar novos sites de leilão (megaleiloes, sold, biasi, bancos)
3. [ ] Adicionar busca em imobiliárias (OLX, Zap, VivaReal)
4. [ ] Implementar busca diária por novos sites
5. [ ] Adicionar filtro de bairros no HTML
