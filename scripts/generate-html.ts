import type { Property } from './types.ts';
import { log, formatCurrency, formatDate, formatDateBR } from './utils.ts';

/**
 * Generate HTML page from properties
 */
export async function generateHTML(
  properties: Property[], 
  outputPath: string,
  isIndex: boolean = false
): Promise<void> {
  log(`🎨 Generating HTML at ${outputPath}...`);
  
  const today = new Date();
  const dateStr = formatDateBR(today);
  const pageTitle = isIndex ? 'Leilão Tracker - Atual' : `Leilão Tracker - ${dateStr}`;
  
  // Calculate stats
  const totalProperties = properties.length;
  const above40 = properties.filter(p => p.desconto && p.desconto > 40).length;
  const maxDiscount = Math.max(...properties.map(p => p.desconto || 0));
  
  // Get recent dates for navigation (last 7 days)
  const recentDates = getRecentDates(7);
  
  // Extract unique types and neighborhoods for filters
  const uniqueTypes = [...new Set(properties.map(p => p.tipo))].sort();
  const uniqueNeighborhoods = [...new Set(properties.map(p => p.bairro))].sort();
  const uniqueSources = getUniqueSources(properties);
  const propertiesWithScore = properties.filter(p => (p as any).score > 0).length;
  const avgScore = propertiesWithScore > 0
    ? Math.round(properties.reduce((s, p) => s + ((p as any).score || 0), 0) / propertiesWithScore)
    : 0;
  const belowMarket = properties.filter(p => (p as any).descontoReal && (p as any).descontoReal > 0).length;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #0d1117; 
      color: #c9d1d9; 
      line-height: 1.6; 
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { 
      text-align: center; 
      padding: 30px 0; 
      border-bottom: 1px solid #30363d; 
      margin-bottom: 20px; 
    }
    header h1 { color: #58a6ff; font-size: 2em; margin-bottom: 10px; }
    header p { color: #8b949e; }
    nav { 
      display: flex; 
      gap: 15px; 
      justify-content: center; 
      flex-wrap: wrap; 
      margin-top: 15px; 
    }
    nav a { 
      color: #58a6ff; 
      text-decoration: none; 
      padding: 5px 10px; 
      border-radius: 6px; 
      background: #21262d; 
    }
    nav a:hover, nav a.active { background: #388bfd; color: #fff; }

    /* --- Stats --- */
    .stats { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); 
      gap: 12px; 
      margin-bottom: 20px; 
    }
    .stat { 
      background: #161b22; 
      padding: 16px; 
      border-radius: 8px; 
      text-align: center; 
      border: 1px solid #30363d; 
    }
    .stat-value { font-size: 1.8em; font-weight: bold; color: #58a6ff; }
    .stat-label { color: #8b949e; font-size: 0.85em; }

    /* --- Filters --- */
    .filters {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .filters-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .filters-header h3 { color: #f0f6fc; font-size: 1em; }
    .filters-reset {
      background: none;
      border: 1px solid #30363d;
      color: #8b949e;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .filters-reset:hover { border-color: #58a6ff; color: #58a6ff; }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
    }
    .filter-group label {
      display: block;
      color: #8b949e;
      font-size: 0.8em;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .filter-group select,
    .filter-group input {
      width: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 0.9em;
    }
    .filter-group select:focus,
    .filter-group input:focus {
      outline: none;
      border-color: #58a6ff;
    }
    .sort-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #21262d;
    }
    .sort-btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #8b949e;
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 0.85em;
      transition: all 0.2s;
    }
    .sort-btn:hover { border-color: #58a6ff; color: #58a6ff; }
    .sort-btn.active { background: #388bfd; color: #fff; border-color: #388bfd; }
    .results-count {
      color: #8b949e;
      font-size: 0.9em;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .load-more {
      display: block;
      width: 100%;
      max-width: 400px;
      margin: 25px auto;
      padding: 14px;
      background: #21262d;
      border: 1px solid #30363d;
      color: #58a6ff;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1em;
      font-weight: 500;
      transition: all 0.2s;
    }
    .load-more:hover { background: #30363d; border-color: #58a6ff; }

    /* --- Cards --- */
    .cards { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); 
      gap: 20px; 
    }
    .card { 
      background: #161b22; 
      border-radius: 12px; 
      padding: 20px; 
      border: 1px solid #30363d; 
      transition: transform 0.2s, border-color 0.2s;
      position: relative;
    }
    .card:hover { transform: translateY(-2px); border-color: #58a6ff; }
    .card.priority { border-left: 4px solid #f0883e; }
    .card.top { border-left: 4px solid #238636; }
    .card.new::before {
      content: '✨ NOVO';
      position: absolute;
      top: 10px;
      right: 10px;
      background: #238636;
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.7em;
      font-weight: bold;
    }
    .score-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 0.8em;
      margin-right: 8px;
    }
    .score-high { background: #238636; color: #fff; }
    .score-mid { background: #d29922; color: #000; }
    .score-low { background: #da3633; color: #fff; }
    .m2-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
      font-size: 0.85em;
      color: #8b949e;
    }
    .m2-value { color: #58a6ff; font-weight: bold; }
    .m2-comparison { font-size: 0.8em; }
    .m2-below { color: #7ee787; }
    .m2-above { color: #f85149; }
    .card-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start; 
      margin-bottom: 15px; 
    }
    .card-title { font-size: 1.1em; color: #f0f6fc; }
    .card-discount { 
      background: #238636; 
      color: #fff; 
      padding: 5px 12px; 
      border-radius: 20px; 
      font-weight: bold; 
      font-size: 0.9em; 
    }
    .card-discount.hot { background: #da3633; }
    .card-location { color: #8b949e; font-size: 0.9em; margin-bottom: 10px; }
    .card-prices { display: flex; gap: 20px; margin: 15px 0; }
    .price-item { }
    .price-label { color: #8b949e; font-size: 0.8em; }
    .price-value { font-size: 1.2em; font-weight: bold; color: #7ee787; }
    .price-value.original { 
      color: #f85149; 
      text-decoration: line-through; 
      font-size: 1em; 
    }
    .card-meta { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
    .meta-tag { 
      background: #21262d; 
      padding: 4px 10px; 
      border-radius: 4px; 
      font-size: 0.85em; 
      color: #8b949e; 
    }
    .card-link { 
      display: block; 
      text-align: center; 
      background: #21262d; 
      color: #58a6ff; 
      padding: 12px; 
      border-radius: 8px; 
      text-decoration: none; 
      font-weight: 500; 
      transition: background 0.2s; 
    }
    .card-link:hover { background: #30363d; }
    footer { 
      text-align: center; 
      padding: 30px 0; 
      margin-top: 30px; 
      border-top: 1px solid #30363d; 
      color: #8b949e; 
    }
    .no-results {
      text-align: center;
      padding: 60px 20px;
      color: #8b949e;
    }
    .no-results h3 { color: #f0f6fc; margin-bottom: 10px; }
    @media (max-width: 600px) { 
      .cards { grid-template-columns: 1fr; } 
      .card-prices { flex-direction: column; gap: 10px; } 
      .filters-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏠 Leilão Tracker</h1>
      <p>Oportunidades imobiliárias em Curitiba e região • ${dateStr}</p>
      <nav>
        <a href="index.html" class="${isIndex ? 'active' : ''}">Atual</a>
        ${recentDates.map(d => `<a href="${d.file}">${d.label}</a>`).join('\n        ')}
      </nav>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${totalProperties}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat">
        <div class="stat-value">${above40}</div>
        <div class="stat-label">Desconto >40%</div>
      </div>
      <div class="stat">
        <div class="stat-value">${belowMarket}</div>
        <div class="stat-label">Abaixo do Mercado</div>
      </div>
      <div class="stat">
        <div class="stat-value">${maxDiscount}%</div>
        <div class="stat-label">Maior Desconto</div>
      </div>
      <div class="stat">
        <div class="stat-value">${avgScore}</div>
        <div class="stat-label">Score Médio</div>
      </div>
    </div>

    <div class="filters">
      <div class="filters-header">
        <h3>🔍 Filtros</h3>
        <button class="filters-reset" onclick="resetFilters()">Limpar filtros</button>
      </div>
      <div class="filters-grid">
        <div class="filter-group">
          <label>Busca</label>
          <input type="text" id="filterSearch" placeholder="Bairro, endereço..." oninput="applyFilters()">
        </div>
        <div class="filter-group">
          <label>Tipo</label>
          <select id="filterType" onchange="applyFilters()">
            <option value="">Todos</option>
            ${uniqueTypes.map(t => `<option value="${t}">${t}</option>`).join('\n            ')}
          </select>
        </div>
        <div class="filter-group">
          <label>Bairro</label>
          <select id="filterNeighborhood" onchange="applyFilters()">
            <option value="">Todos</option>
            ${uniqueNeighborhoods.map(n => `<option value="${n}">${n}</option>`).join('\n            ')}
          </select>
        </div>
        <div class="filter-group">
          <label>Score mínimo</label>
          <select id="filterScore" onchange="applyFilters()">
            <option value="0">Todos</option>
            <option value="30">30+</option>
            <option value="50">50+ (bom)</option>
            <option value="60">60+ (ótimo)</option>
            <option value="70">70+ (excelente)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Preço máx.</label>
          <select id="filterMaxPrice" onchange="applyFilters()">
            <option value="0">Sem limite</option>
            <option value="200000">R$200k</option>
            <option value="400000">R$400k</option>
            <option value="600000">R$600k</option>
            <option value="800000">R$800k</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Fonte</label>
          <select id="filterSource" onchange="applyFilters()">
            <option value="">Todas</option>
            ${uniqueSources.map(s => `<option value="${s}">${s}</option>`).join('\n            ')}
          </select>
        </div>
      </div>
      <div class="sort-row">
        <span style="color:#8b949e;font-size:0.85em;line-height:2;">Ordenar:</span>
        <button class="sort-btn active" data-sort="score" onclick="setSort('score')">⭐ Score</button>
        <button class="sort-btn" data-sort="price-asc" onclick="setSort('price-asc')">💰 Preço ↑</button>
        <button class="sort-btn" data-sort="price-desc" onclick="setSort('price-desc')">💰 Preço ↓</button>
        <button class="sort-btn" data-sort="discount" onclick="setSort('discount')">📉 Desconto</button>
        <button class="sort-btn" data-sort="m2" onclick="setSort('m2')">📐 R$/m²</button>
        <button class="sort-btn" data-sort="real-discount" onclick="setSort('real-discount')">🎯 Desc. Real</button>
      </div>
    </div>

    <div class="results-count" id="resultsCount"></div>
    <div class="cards" id="cardsContainer"></div>
    <button class="load-more" id="loadMore" onclick="loadMore()" style="display:none;">Mostrar mais</button>

    <footer>
      <p>Fontes: ${uniqueSources.join(', ')} • Gerado automaticamente por 🐦 Avê</p>
      <p style="margin-top: 10px; font-size: 0.85em;">Score = desconto nominal + desconto real vs mercado + vagas + bairro + ocupação + prazo</p>
    </footer>
  </div>

  <script>
    const ALL_PROPERTIES = ${JSON.stringify(properties.map(p => ({
      id: p.id,
      tipo: p.tipo,
      bairro: p.bairro,
      endereco: p.endereco,
      lance: p.lance,
      avaliacao: p.avaliacao,
      desconto: p.desconto,
      modalidade: p.modalidade,
      encerramento: p.encerramento,
      ocupacao: p.ocupacao,
      area: p.area,
      fonte: p.fonte,
      link: p.link,
      novo: p.novo,
      prioridade: p.prioridade,
      semVagas: p.semVagas,
      alertas: p.alertas,
      quartos: (p as any).quartos,
      vagas: (p as any).vagas,
      precoM2: (p as any).precoM2,
      mediaM2Bairro: (p as any).mediaM2Bairro,
      descontoReal: (p as any).descontoReal,
      score: (p as any).score,
    })))};

    let currentSort = 'score';
    let visibleCount = 24;
    let filteredData = [];

    function getTypeEmoji(tipo) {
      const l = tipo.toLowerCase();
      if (l.includes('apartamento')) return '🏢';
      if (l.includes('casa') || l.includes('sobrado')) return '🏠';
      if (l.includes('terreno')) return '🗺️';
      if (l.includes('comercial') || l.includes('sala')) return '🏪';
      return '🏘️';
    }

    function fmtCurrency(v) {
      return 'R$' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
    }

    function fmtDate(d) {
      if (!d) return '';
      const dt = new Date(d);
      return dt.toLocaleDateString('pt-BR');
    }

    function renderCard(p, isTop) {
      const typeEmoji = getTypeEmoji(p.tipo);
      const discountClass = p.desconto && p.desconto >= 60 ? 'hot' : '';
      const classes = ['card', isTop ? 'top' : '', p.prioridade ? 'priority' : '', p.novo ? 'new' : ''].filter(Boolean).join(' ');

      const scoreVal = p.score || 0;
      const scoreClass = scoreVal >= 60 ? 'score-high' : scoreVal >= 40 ? 'score-mid' : 'score-low';
      const scoreBadge = scoreVal > 0 ? '<span class="score-badge ' + scoreClass + '">' + scoreVal + '/100</span>' : '';

      let m2Html = '';
      if (p.precoM2) {
        const m2Fmt = 'R$' + p.precoM2.toLocaleString('pt-BR') + '/m²';
        let comp = '';
        if (p.mediaM2Bairro && p.descontoReal !== undefined) {
          const cls = p.descontoReal >= 0 ? 'm2-below' : 'm2-above';
          const txt = p.descontoReal >= 0
            ? p.descontoReal + '% abaixo (méd. R$' + p.mediaM2Bairro.toLocaleString('pt-BR') + '/m²)'
            : Math.abs(p.descontoReal) + '% ACIMA (méd. R$' + p.mediaM2Bairro.toLocaleString('pt-BR') + '/m²)';
          comp = '<span class="m2-comparison ' + cls + '">' + txt + '</span>';
        }
        m2Html = '<div class="m2-info"><span class="m2-value">' + m2Fmt + '</span>' + comp + '</div>';
      }

      const vagasTag = p.vagas !== undefined
        ? (p.vagas > 0 ? '<span class="meta-tag">🅿️ ' + p.vagas + ' vaga' + (p.vagas > 1 ? 's' : '') + '</span>' : '<span class="meta-tag" style="background:#da3633;color:#fff">⛔ 0 vagas</span>')
        : '';
      const quartosTag = p.quartos ? '<span class="meta-tag">🛏️ ' + p.quartos + ' qto' + (p.quartos > 1 ? 's' : '') + '</span>' : '';
      const alertTags = (p.alertas || []).filter(a => !a.includes('SEM VAGAS')).map(a => '<span class="meta-tag" style="background:#d29922;color:#000">' + a + '</span>').join('');

      return '<div class="' + classes + '">' +
        '<div class="card-header">' +
          '<div class="card-title">' + scoreBadge + typeEmoji + ' ' + p.tipo + ' - ' + p.bairro + '</div>' +
          (p.desconto ? '<div class="card-discount ' + discountClass + '">-' + p.desconto + '%</div>' : '') +
        '</div>' +
        '<div class="card-location">📍 ' + p.endereco + '</div>' +
        '<div class="card-prices">' +
          '<div class="price-item"><div class="price-label">' + p.modalidade + '</div><div class="price-value">' + fmtCurrency(p.lance) + '</div></div>' +
          (p.avaliacao ? '<div class="price-item"><div class="price-label">Avaliação</div><div class="price-value original">' + fmtCurrency(p.avaliacao) + '</div></div>' : '') +
        '</div>' +
        m2Html +
        '<div class="card-meta">' + quartosTag + vagasTag +
          (p.area ? '<span class="meta-tag">' + p.area + '</span>' : '') +
          (p.encerramento ? '<span class="meta-tag">Encerramento: ' + fmtDate(p.encerramento) + '</span>' : '') +
          (p.ocupacao === 'ocupado' ? '<span class="meta-tag">⚠️ Ocupado</span>' : '') +
          (p.ocupacao === 'desocupado' ? '<span class="meta-tag">✅ Desocupado</span>' : '') +
          (p.semVagas ? '<span class="meta-tag" style="background:#da3633;color:#fff">⛔ SEM VAGAS</span>' : '') +
          alertTags +
        '</div>' +
        '<a href="' + p.link + '" target="_blank" class="card-link">Ver no ' + p.fonte + ' →</a>' +
      '</div>';
    }

    function sortData(data, sortKey) {
      const sorted = [...data];
      switch (sortKey) {
        case 'score': sorted.sort((a, b) => (b.score || 0) - (a.score || 0)); break;
        case 'price-asc': sorted.sort((a, b) => a.lance - b.lance); break;
        case 'price-desc': sorted.sort((a, b) => b.lance - a.lance); break;
        case 'discount': sorted.sort((a, b) => (b.desconto || 0) - (a.desconto || 0)); break;
        case 'm2': sorted.sort((a, b) => (a.precoM2 || 99999) - (b.precoM2 || 99999)); break;
        case 'real-discount': sorted.sort((a, b) => (b.descontoReal || -999) - (a.descontoReal || -999)); break;
      }
      return sorted;
    }

    function applyFilters() {
      const search = document.getElementById('filterSearch').value.toLowerCase();
      const type = document.getElementById('filterType').value;
      const hood = document.getElementById('filterNeighborhood').value;
      const minScore = parseInt(document.getElementById('filterScore').value) || 0;
      const maxPrice = parseInt(document.getElementById('filterMaxPrice').value) || 0;
      const source = document.getElementById('filterSource').value;

      filteredData = ALL_PROPERTIES.filter(p => {
        if (search && !(p.bairro.toLowerCase().includes(search) || p.endereco.toLowerCase().includes(search) || p.tipo.toLowerCase().includes(search))) return false;
        if (type && p.tipo !== type) return false;
        if (hood && p.bairro !== hood) return false;
        if (minScore && (p.score || 0) < minScore) return false;
        if (maxPrice && p.lance > maxPrice) return false;
        if (source && p.fonte !== source) return false;
        return true;
      });

      filteredData = sortData(filteredData, currentSort);
      visibleCount = 24;
      renderCards();
    }

    function renderCards() {
      const container = document.getElementById('cardsContainer');
      const showing = filteredData.slice(0, visibleCount);
      container.innerHTML = showing.length > 0
        ? showing.map((p, i) => renderCard(p, i < 3 && currentSort === 'score')).join('')
        : '<div class="no-results"><h3>Nenhum imóvel encontrado</h3><p>Tente ajustar os filtros</p></div>';
      
      document.getElementById('resultsCount').innerHTML = 
        '<span>Mostrando <strong>' + Math.min(visibleCount, filteredData.length) + '</strong> de <strong>' + filteredData.length + '</strong> imóveis</span>' +
        '<span style="font-size:0.8em;">(' + ALL_PROPERTIES.length + ' total no banco)</span>';

      const btn = document.getElementById('loadMore');
      btn.style.display = visibleCount < filteredData.length ? 'block' : 'none';
      btn.textContent = 'Mostrar mais (' + (filteredData.length - visibleCount) + ' restantes)';
    }

    function loadMore() {
      visibleCount += 24;
      renderCards();
    }

    function setSort(key) {
      currentSort = key;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === key));
      filteredData = sortData(filteredData, key);
      visibleCount = 24;
      renderCards();
    }

    function resetFilters() {
      document.getElementById('filterSearch').value = '';
      document.getElementById('filterType').value = '';
      document.getElementById('filterNeighborhood').value = '';
      document.getElementById('filterScore').value = '0';
      document.getElementById('filterMaxPrice').value = '0';
      document.getElementById('filterSource').value = '';
      applyFilters();
    }

    // Initialize
    applyFilters();
  </script>
</body>
</html>`;
  
  await Bun.write(outputPath, html);
  log(`✅ HTML generated successfully`);
}

/**
 * Generate HTML card for a single property
 */
function generatePropertyCard(property: Property, isTop: boolean = false): string {
  const typeEmoji = getTypeEmoji(property.tipo);
  const discountClass = property.desconto && property.desconto >= 60 ? 'hot' : '';
  const cardClass = [
    'card',
    isTop ? 'top' : '',
    property.prioridade ? 'priority' : '',
    property.novo ? 'new' : ''
  ].filter(Boolean).join(' ');
  
  // Score badge
  const scoreVal = (property as any).score || 0;
  const scoreClass = scoreVal >= 60 ? 'score-high' : scoreVal >= 40 ? 'score-mid' : 'score-low';
  const scoreBadge = scoreVal > 0 ? `<span class="score-badge ${scoreClass}">${scoreVal}/100</span>` : '';

  // R$/m² info
  const precoM2 = (property as any).precoM2;
  const mediaM2 = (property as any).mediaM2Bairro;
  const descontoReal = (property as any).descontoReal;
  let m2Html = '';
  if (precoM2) {
    const m2Formatted = `R$${precoM2.toLocaleString('pt-BR')}/m²`;
    let compHtml = '';
    if (mediaM2 && descontoReal !== undefined) {
      const compClass = descontoReal >= 0 ? 'm2-below' : 'm2-above';
      const compText = descontoReal >= 0
        ? `${descontoReal}% abaixo da média (R$${mediaM2.toLocaleString('pt-BR')}/m²)`
        : `${Math.abs(descontoReal)}% ACIMA da média (R$${mediaM2.toLocaleString('pt-BR')}/m²)`;
      compHtml = `<span class="m2-comparison ${compClass}">${compText}</span>`;
    }
    m2Html = `<div class="m2-info"><span class="m2-value">${m2Formatted}</span>${compHtml}</div>`;
  }

  // Vagas info
  const vagas = (property as any).vagas;
  const vagasTag = vagas !== undefined
    ? (vagas > 0 ? `<span class="meta-tag">🅿️ ${vagas} vaga${vagas > 1 ? 's' : ''}</span>` : '<span class="meta-tag" style="background:#da3633;color:#fff">⛔ 0 vagas</span>')
    : '';

  // Quartos info
  const quartos = (property as any).quartos;
  const quartosTag = quartos ? `<span class="meta-tag">🛏️ ${quartos} qto${quartos > 1 ? 's' : ''}</span>` : '';

  return `      <div class="${cardClass}">
        <div class="card-header">
          <div class="card-title">${scoreBadge}${typeEmoji} ${property.tipo} - ${property.bairro}</div>
          ${property.desconto ? `<div class="card-discount ${discountClass}">-${property.desconto}%</div>` : ''}
        </div>
        <div class="card-location">📍 ${property.endereco}</div>
        <div class="card-prices">
          <div class="price-item">
            <div class="price-label">${property.modalidade}</div>
            <div class="price-value">${formatCurrency(property.lance)}</div>
          </div>
          ${property.avaliacao ? `<div class="price-item">
            <div class="price-label">Avaliação</div>
            <div class="price-value original">${formatCurrency(property.avaliacao)}</div>
          </div>` : ''}
        </div>
        ${m2Html}
        <div class="card-meta">
          ${quartosTag}
          ${vagasTag}
          ${property.area ? `<span class="meta-tag">${property.area}</span>` : ''}
          ${property.encerramento ? `<span class="meta-tag">Encerramento: ${formatDateBR(new Date(property.encerramento))}</span>` : ''}
          ${property.ocupacao === 'ocupado' ? '<span class="meta-tag">⚠️ Ocupado</span>' : ''}
          ${property.ocupacao === 'desocupado' ? '<span class="meta-tag">✅ Desocupado</span>' : ''}
          ${property.semVagas ? '<span class="meta-tag" style="background:#da3633;color:#fff">⛔ SEM VAGAS</span>' : ''}
          ${(property.alertas || []).filter(a => !a.includes('SEM VAGAS')).map(a => `<span class="meta-tag" style="background:#d29922;color:#000">${a}</span>`).join('')}
        </div>
        <a href="${property.link}" target="_blank" class="card-link">Ver no ${property.fonte} →</a>
      </div>`;
}

/**
 * Get emoji for property type
 */
function getTypeEmoji(tipo: string): string {
  const lower = tipo.toLowerCase();
  if (lower.includes('apartamento')) return '🏢';
  if (lower.includes('casa')) return '🏠';
  if (lower.includes('sobrado')) return '🏠';
  if (lower.includes('terreno')) return '🗺️';
  if (lower.includes('comercial') || lower.includes('sala')) return '🏪';
  return '🏘️';
}

/**
 * Get unique sources from properties
 */
function getUniqueSources(properties: Property[]): string[] {
  return [...new Set(properties.map(p => p.fonte))];
}

/**
 * Get recent dates for navigation
 */
function getRecentDates(days: number): Array<{ file: string; label: string }> {
  const dates = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    const filename = `${formatDate(date)}.html`;
    const [, month, day] = formatDate(date).split('-');
    const label = `${day}/${month}`;
    
    dates.push({ file: filename, label });
  }
  
  return dates;
}

// Run standalone
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: bun run generate-html.ts <input.json> <output.html>');
    process.exit(1);
  }
  
  const [inputFile, outputFile] = args;
  
  try {
    const properties = await Bun.file(inputFile).json();
    await generateHTML(properties, outputFile, outputFile.includes('index.html'));
  } catch (error) {
    log(`Error: ${error}`, 'error');
    process.exit(1);
  }
}
