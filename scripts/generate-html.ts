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
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { 
      text-align: center; 
      padding: 30px 0; 
      border-bottom: 1px solid #30363d; 
      margin-bottom: 30px; 
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
    .stats { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
      gap: 15px; 
      margin-bottom: 30px; 
    }
    .stat { 
      background: #161b22; 
      padding: 20px; 
      border-radius: 8px; 
      text-align: center; 
      border: 1px solid #30363d; 
    }
    .stat-value { font-size: 2em; font-weight: bold; color: #58a6ff; }
    .stat-label { color: #8b949e; font-size: 0.9em; }
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
    @media (max-width: 600px) { 
      .cards { grid-template-columns: 1fr; } 
      .card-prices { flex-direction: column; gap: 10px; } 
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
        <div class="stat-value">${above40}</div>
        <div class="stat-label">Acima de 40%</div>
      </div>
      <div class="stat">
        <div class="stat-value">${totalProperties}</div>
        <div class="stat-label">Total Encontrados</div>
      </div>
      <div class="stat">
        <div class="stat-value">${maxDiscount}%</div>
        <div class="stat-label">Maior Desconto</div>
      </div>
    </div>

    <div class="cards">
${properties.slice(0, 20).map((p, idx) => generatePropertyCard(p, idx < 5)).join('\n')}
    </div>

    <footer>
      <p>Fontes: ${getUniqueSources(properties).join(', ')} • Gerado automaticamente por 🐦 Avê</p>
      <p style="margin-top: 10px; font-size: 0.85em;">Filtros: Curitiba + Grande Curitiba | Desconto >40% | Preço <R$800k</p>
    </footer>
  </div>
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
