#!/usr/bin/env python3
"""
Enrich properties with scoring and generate HTML pages.
Python port of enrich-properties.ts and generate-html.ts
"""
import json
import os
import re
import math
import unicodedata
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
ROOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# Group-approved priority neighborhoods (Investment/Flipping WhatsApp group)
PRIORITY_NEIGHBORHOODS = [
    'Batel', 'Cabral', 'Mercês', 'Tarumã',
    'Jardim das Américas', 'Jardim Social', 'Centro'
]

NEIGHBORHOOD_PRICE_M2 = {
    'batel': 16240, 'bigorrilho': 15061, 'cabral': 13180,
    'campo comprido': 12450, 'agua verde': 11768, 'ecoville': 12000,
    'centro': 10250, 'portao': 8331, 'merces': 9800, 'novo mundo': 7732,
    'jardim das americas': 5800,
    'alto da xv': 9000, 'hugo lange': 8500, 'juveve': 8800,
    'reboucas': 8500, 'cristo rei': 9200, 'jardim social': 7500,
    'boa vista': 6845, 'bacacheri': 7200, 'taruma': 6500,
    'cajuru': 5500, 'boqueirao': 5800, 'alto boqueirao': 5200,
    'xaxim': 5500, 'pinheirinho': 5200, 'sitio cercado': 4800,
    'cidade industrial': 7251, 'ahu': 8500, 'alto': 7000,
    'uberaba': 5800, 'capao da imbuia': 5500,
    'fazenda rio grande': 4500, 'colombo': 4800,
    'sao jose dos pinhais': 5800, 'pinhais': 5500,
    'araucaria': 5200, 'campo largo': 4800, 'almirante tamandare': 4200,
}

def normalize(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower().strip()

def is_priority(bairro):
    n = normalize(bairro)
    for p in PRIORITY_NEIGHBORHOODS:
        pn = normalize(p)
        if pn in n or n in pn:
            return True
    return False

def extract_area(area_str):
    if not area_str:
        return None
    m = re.search(r'([\d.,]+)\s*m', area_str)
    if not m:
        return None
    val = float(m.group(1).replace(',', '.'))
    return val if val > 0 else None

def find_neighborhood_avg(bairro, area, tipo, fonte):
    norm = normalize(bairro)
    base = None
    for key, val in NEIGHBORHOOD_PRICE_M2.items():
        if key in norm or norm in key:
            base = val
            break
    if base is None:
        return None
    
    adjusted = base * 0.90  # auction/used discount
    tipo_lower = tipo.lower()
    if 'casa' in tipo_lower or 'sobrado' in tipo_lower:
        adjusted *= 0.85
    elif 'terreno' in tipo_lower or 'gleba' in tipo_lower:
        adjusted *= 0.50
    elif 'sala' in tipo_lower or 'comercial' in tipo_lower:
        adjusted *= 0.65
    elif 'vaga' in tipo_lower:
        adjusted *= 0.30
    
    return round(adjusted)

def expects_parking(tipo):
    lower = tipo.lower()
    return any(t in lower for t in ['apartamento', 'casa', 'sobrado', 'kitnet'])

def calculate_score(prop):
    score = 0
    parts = []
    
    # 1. Nominal discount (0-25)
    disc = prop.get('desconto') or 0
    disc_score = min(25, round(disc * 25 / 70))
    score += disc_score
    parts.append(f'Desc:{disc_score}/25')
    
    # 2. Real discount vs market (0-25)
    dr = prop.get('descontoReal')
    if dr is not None:
        real_score = min(25, max(0, round(dr * 25 / 50)))
        score += real_score
        parts.append(f'Real:{real_score}/25')
    else:
        score += 10
        parts.append('Real:10/25(?)')
    
    # 3. Parking (0-15)
    vagas = prop.get('vagas')
    if vagas is not None:
        if vagas >= 2:
            score += 15; parts.append('Vagas:15/15')
        elif vagas == 1:
            score += 10; parts.append('Vagas:10/15')
        else:
            parts.append('Vagas:0/15⛔')
    elif prop.get('semVagas'):
        parts.append('Vagas:0/15⛔')
    elif expects_parking(prop.get('tipo', '')):
        score += 3; parts.append('Vagas:3/15(?)')
    else:
        score += 8; parts.append('Vagas:8/15(n/a)')
    
    # 4. Priority neighborhood (0-10)
    if prop.get('prioridade'):
        score += 10; parts.append('Bairro:10/10')
    else:
        score += 3; parts.append('Bairro:3/10')
    
    # 5. Occupancy (0-10)
    occ = prop.get('ocupacao', 'desconhecido')
    if occ == 'desocupado':
        score += 10; parts.append('Ocup:10/10')
    elif occ == 'ocupado':
        score += 2; parts.append('Ocup:2/10')
    else:
        score += 5; parts.append('Ocup:5/10(?)')
    
    # 6. Auction closing proximity (0-15)
    enc = prop.get('encerramento')
    if enc:
        try:
            enc_date = datetime.strptime(enc, '%Y-%m-%d')
            days_until = (enc_date - datetime.now()).days
            if days_until <= 3:
                score += 15; parts.append('Prazo:15/15')
            elif days_until <= 7:
                score += 12; parts.append('Prazo:12/15')
            elif days_until <= 14:
                score += 8; parts.append('Prazo:8/15')
            elif days_until <= 30:
                score += 5; parts.append('Prazo:5/15')
            else:
                score += 2; parts.append('Prazo:2/15')
        except:
            score += 7; parts.append('Prazo:7/15(err)')
    else:
        score += 7; parts.append('Prazo:7/15(aberto)')
    
    return min(100, score), ' | '.join(parts)

def enrich_property(prop):
    enriched = dict(prop)
    alertas = list(prop.get('alertas') or [])
    
    area = extract_area(prop.get('area'))
    
    if area and area > 10:
        enriched['precoM2'] = round(prop['lance'] / area)
        avg_m2 = find_neighborhood_avg(prop['bairro'], area, prop['tipo'], prop['fonte'])
        if avg_m2:
            enriched['mediaM2Bairro'] = avg_m2
            enriched['descontoReal'] = round((1 - enriched['precoM2'] / avg_m2) * 100)
    
    enriched['prioridade'] = is_priority(prop.get('bairro', ''))
    
    if alertas:
        enriched['alertas'] = alertas
    
    score, breakdown = calculate_score(enriched)
    enriched['score'] = score
    enriched['scoreBreakdown'] = breakdown
    
    return enriched

def enrich_all(properties):
    enriched = [enrich_property(p) for p in properties]
    enriched.sort(key=lambda p: -(p.get('score') or 0))
    return enriched


# ========== HTML GENERATION ==========

def format_currency(val):
    if val is None:
        return 'N/A'
    return f"R${val:,.0f}".replace(',', '.')

def get_recent_dates(days=7):
    dates = []
    today = datetime.now()
    for i in range(days):
        d = today - timedelta(days=i)
        date_str = d.strftime('%Y-%m-%d')
        label = d.strftime('%d/%m')
        dates.append({'file': f'{date_str}.html', 'label': label})
    return dates

def generate_html(properties, output_path, is_index=False):
    today = datetime.now()
    date_str = today.strftime('%d/%m/%Y')
    page_title = 'Leilão Tracker - Atual' if is_index else f'Leilão Tracker - {date_str}'
    
    total = len(properties)
    above40 = len([p for p in properties if (p.get('desconto') or 0) > 40])
    max_disc = max((p.get('desconto') or 0) for p in properties) if properties else 0
    below_market = len([p for p in properties if p.get('descontoReal') and p['descontoReal'] > 0])
    with_score = [p for p in properties if p.get('score')]
    avg_score = round(sum(p['score'] for p in with_score) / len(with_score)) if with_score else 0
    
    recent_dates = get_recent_dates(7)
    unique_types = sorted(set(p.get('tipo', '') for p in properties))
    unique_neighborhoods = sorted(set(p.get('bairro', '') for p in properties))
    unique_sources = sorted(set(p.get('fonte', '') for p in properties))
    
    nav_links = '\n        '.join(
        f'<a href="{d["file"]}">{d["label"]}</a>' for d in recent_dates
    )
    type_options = '\n            '.join(f'<option value="{t}">{t}</option>' for t in unique_types)
    hood_options = '\n            '.join(f'<option value="{n}">{n}</option>' for n in unique_neighborhoods)
    source_options = '\n            '.join(f'<option value="{s}">{s}</option>' for s in unique_sources)
    
    # Build properties JSON for embedding
    props_json = json.dumps([{
        'id': p.get('id'),
        'tipo': p.get('tipo'),
        'bairro': p.get('bairro'),
        'endereco': p.get('endereco'),
        'lance': p.get('lance'),
        'avaliacao': p.get('avaliacao'),
        'desconto': p.get('desconto'),
        'modalidade': p.get('modalidade'),
        'encerramento': p.get('encerramento'),
        'ocupacao': p.get('ocupacao'),
        'area': p.get('area'),
        'fonte': p.get('fonte'),
        'link': p.get('link'),
        'novo': p.get('novo'),
        'prioridade': p.get('prioridade'),
        'semVagas': p.get('semVagas'),
        'alertas': p.get('alertas'),
        'quartos': p.get('quartos'),
        'vagas': p.get('vagas'),
        'precoM2': p.get('precoM2'),
        'mediaM2Bairro': p.get('mediaM2Bairro'),
        'descontoReal': p.get('descontoReal'),
        'score': p.get('score'),
    } for p in properties], ensure_ascii=False)
    
    # Read the existing HTML template from the generate-html.ts output format
    # We'll replicate the same structure
    html = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>{page_title}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; }}
    .container {{ max-width: 1400px; margin: 0 auto; padding: 20px; }}
    header {{ text-align: center; padding: 30px 0; border-bottom: 1px solid #30363d; margin-bottom: 20px; }}
    header h1 {{ color: #58a6ff; font-size: 2em; margin-bottom: 10px; }}
    header p {{ color: #8b949e; }}
    nav {{ display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-top: 15px; }}
    nav a {{ color: #58a6ff; text-decoration: none; padding: 5px 10px; border-radius: 6px; background: #21262d; }}
    nav a:hover, nav a.active {{ background: #388bfd; color: #fff; }}
    .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 20px; }}
    .stat {{ background: #161b22; padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #30363d; }}
    .stat-value {{ font-size: 1.8em; font-weight: bold; color: #58a6ff; }}
    .stat-label {{ color: #8b949e; font-size: 0.85em; }}
    .filters {{ background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 20px; margin-bottom: 20px; }}
    .filters-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }}
    .filters-header h3 {{ color: #f0f6fc; font-size: 1em; }}
    .filters-reset {{ background: none; border: 1px solid #30363d; color: #8b949e; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85em; }}
    .filters-reset:hover {{ border-color: #58a6ff; color: #58a6ff; }}
    .filters-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }}
    .filter-group label {{ display: block; color: #8b949e; font-size: 0.8em; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }}
    .filter-group select, .filter-group input {{ width: 100%; background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 8px 10px; border-radius: 6px; font-size: 0.9em; }}
    .filter-group select:focus, .filter-group input:focus {{ outline: none; border-color: #58a6ff; }}
    .sort-row {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid #21262d; }}
    .sort-btn {{ background: #21262d; border: 1px solid #30363d; color: #8b949e; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 0.85em; transition: all 0.2s; }}
    .sort-btn:hover {{ border-color: #58a6ff; color: #58a6ff; }}
    .sort-btn.active {{ background: #388bfd; color: #fff; border-color: #388bfd; }}
    .results-count {{ color: #8b949e; font-size: 0.9em; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }}
    .load-more {{ display: block; width: 100%; max-width: 400px; margin: 25px auto; padding: 14px; background: #21262d; border: 1px solid #30363d; color: #58a6ff; border-radius: 8px; cursor: pointer; font-size: 1em; font-weight: 500; transition: all 0.2s; }}
    .load-more:hover {{ background: #30363d; border-color: #58a6ff; }}
    .cards {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; }}
    .card {{ background: #161b22; border-radius: 12px; padding: 20px; border: 1px solid #30363d; transition: transform 0.2s, border-color 0.2s; position: relative; }}
    .card:hover {{ transform: translateY(-2px); border-color: #58a6ff; }}
    .card.priority {{ border-left: 4px solid #f0883e; }}
    .card.top {{ border-left: 4px solid #238636; }}
    .card.new::before {{ content: '✨ NOVO'; position: absolute; top: 10px; right: 10px; background: #238636; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 0.7em; font-weight: bold; }}
    .score-badge {{ display: inline-block; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.8em; margin-right: 8px; }}
    .score-high {{ background: #238636; color: #fff; }}
    .score-mid {{ background: #d29922; color: #000; }}
    .score-low {{ background: #da3633; color: #fff; }}
    .m2-info {{ display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 0.85em; color: #8b949e; }}
    .m2-value {{ color: #58a6ff; font-weight: bold; }}
    .m2-comparison {{ font-size: 0.8em; }}
    .m2-below {{ color: #7ee787; }}
    .m2-above {{ color: #f85149; }}
    .card-header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }}
    .card-title {{ font-size: 1.1em; color: #f0f6fc; }}
    .card-discount {{ background: #238636; color: #fff; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em; }}
    .card-discount.hot {{ background: #da3633; }}
    .card-location {{ color: #8b949e; font-size: 0.9em; margin-bottom: 10px; }}
    .card-prices {{ display: flex; gap: 20px; margin: 15px 0; }}
    .price-label {{ color: #8b949e; font-size: 0.8em; }}
    .price-value {{ font-size: 1.2em; font-weight: bold; color: #7ee787; }}
    .price-value.original {{ color: #f85149; text-decoration: line-through; font-size: 1em; }}
    .card-meta {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }}
    .meta-tag {{ background: #21262d; padding: 4px 10px; border-radius: 4px; font-size: 0.85em; color: #8b949e; }}
    .card-link {{ display: block; text-align: center; background: #21262d; color: #58a6ff; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 500; transition: background 0.2s; }}
    .card-link:hover {{ background: #30363d; }}
    footer {{ text-align: center; padding: 30px 0; margin-top: 30px; border-top: 1px solid #30363d; color: #8b949e; }}
    .no-results {{ text-align: center; padding: 60px 20px; color: #8b949e; }}
    .no-results h3 {{ color: #f0f6fc; margin-bottom: 10px; }}
    @media (max-width: 600px) {{ .cards {{ grid-template-columns: 1fr; }} .card-prices {{ flex-direction: column; gap: 10px; }} .filters-grid {{ grid-template-columns: 1fr 1fr; }} }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏠 Leilão Tracker</h1>
      <p>Oportunidades imobiliárias em Curitiba e região • {date_str}</p>
      <nav>
        <a href="index.html" class="{'active' if is_index else ''}">Atual</a>
        {nav_links}
      </nav>
    </header>
    <div class="stats">
      <div class="stat"><div class="stat-value">{total}</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-value">{above40}</div><div class="stat-label">Desconto >40%</div></div>
      <div class="stat"><div class="stat-value">{below_market}</div><div class="stat-label">Abaixo do Mercado</div></div>
      <div class="stat"><div class="stat-value">{max_disc}%</div><div class="stat-label">Maior Desconto</div></div>
      <div class="stat"><div class="stat-value">{avg_score}</div><div class="stat-label">Score Médio</div></div>
    </div>
    <div class="filters">
      <div class="filters-header">
        <h3>🔍 Filtros</h3>
        <button class="filters-reset" onclick="resetFilters()">Limpar filtros</button>
      </div>
      <div class="filters-grid">
        <div class="filter-group"><label>Busca</label><input type="text" id="filterSearch" placeholder="Bairro, endereço..." oninput="applyFilters()"></div>
        <div class="filter-group"><label>Tipo</label><select id="filterType" onchange="applyFilters()"><option value="">Todos</option>{type_options}</select></div>
        <div class="filter-group"><label>Bairro</label><select id="filterNeighborhood" onchange="applyFilters()"><option value="">Todos</option>{hood_options}</select></div>
        <div class="filter-group"><label>Score mínimo</label><select id="filterScore" onchange="applyFilters()"><option value="0">Todos</option><option value="30">30+</option><option value="50">50+ (bom)</option><option value="60">60+ (ótimo)</option><option value="70">70+ (excelente)</option></select></div>
        <div class="filter-group"><label>Preço máx.</label><select id="filterMaxPrice" onchange="applyFilters()"><option value="0">Sem limite</option><option value="200000">R$200k</option><option value="400000">R$400k</option><option value="600000">R$600k</option><option value="800000">R$800k</option></select></div>
        <div class="filter-group"><label>Fonte</label><select id="filterSource" onchange="applyFilters()"><option value="">Todas</option>{source_options}</select></div>
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
      <p>Fontes: {', '.join(unique_sources)} • Gerado automaticamente por 🐦 Avê</p>
      <p style="margin-top: 10px; font-size: 0.85em;">Score = desconto nominal + desconto real vs mercado + vagas + bairro + ocupação + prazo</p>
    </footer>
  </div>
  <script>
    const ALL_PROPERTIES = {props_json};
    let currentSort = 'score';
    let visibleCount = 24;
    let filteredData = [];

    function getTypeEmoji(tipo) {{
      const l = tipo.toLowerCase();
      if (l.includes('apartamento')) return '🏢';
      if (l.includes('casa') || l.includes('sobrado')) return '🏠';
      if (l.includes('terreno')) return '🗺️';
      if (l.includes('comercial') || l.includes('sala')) return '🏪';
      if (l.includes('vaga')) return '🅿️';
      return '🏘️';
    }}
    function fmtCurrency(v) {{ return 'R$' + v.toLocaleString('pt-BR', {{ minimumFractionDigits: 0 }}); }}
    function fmtDate(d) {{ if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('pt-BR'); }}
    function renderCard(p, isTop) {{
      const typeEmoji = getTypeEmoji(p.tipo);
      const discountClass = p.desconto && p.desconto >= 60 ? 'hot' : '';
      const classes = ['card', isTop ? 'top' : '', p.prioridade ? 'priority' : '', p.novo ? 'new' : ''].filter(Boolean).join(' ');
      const scoreVal = p.score || 0;
      const scoreClass = scoreVal >= 60 ? 'score-high' : scoreVal >= 40 ? 'score-mid' : 'score-low';
      const scoreBadge = scoreVal > 0 ? '<span class="score-badge ' + scoreClass + '">' + scoreVal + '/100</span>' : '';
      let m2Html = '';
      if (p.precoM2) {{
        const m2Fmt = 'R$' + p.precoM2.toLocaleString('pt-BR') + '/m²';
        let comp = '';
        if (p.mediaM2Bairro && p.descontoReal !== undefined && p.descontoReal !== null) {{
          const cls = p.descontoReal >= 0 ? 'm2-below' : 'm2-above';
          const txt = p.descontoReal >= 0 ? p.descontoReal + '% abaixo (méd. R$' + p.mediaM2Bairro.toLocaleString('pt-BR') + '/m²)' : Math.abs(p.descontoReal) + '% ACIMA (méd. R$' + p.mediaM2Bairro.toLocaleString('pt-BR') + '/m²)';
          comp = '<span class="m2-comparison ' + cls + '">' + txt + '</span>';
        }}
        m2Html = '<div class="m2-info"><span class="m2-value">' + m2Fmt + '</span>' + comp + '</div>';
      }}
      const vagasTag = p.vagas !== undefined && p.vagas !== null ? (p.vagas > 0 ? '<span class="meta-tag">🅿️ ' + p.vagas + ' vaga' + (p.vagas > 1 ? 's' : '') + '</span>' : '<span class="meta-tag" style="background:#da3633;color:#fff">⛔ 0 vagas</span>') : '';
      const quartosTag = p.quartos ? '<span class="meta-tag">🛏️ ' + p.quartos + ' qto' + (p.quartos > 1 ? 's' : '') + '</span>' : '';
      const alertTags = (p.alertas || []).filter(a => !a.includes('SEM VAGAS')).map(a => '<span class="meta-tag" style="background:#d29922;color:#000">' + a + '</span>').join('');
      return '<div class="' + classes + '">' +
        '<div class="card-header"><div class="card-title">' + scoreBadge + typeEmoji + ' ' + p.tipo + ' - ' + p.bairro + '</div>' +
        (p.desconto ? '<div class="card-discount ' + discountClass + '">-' + p.desconto + '%</div>' : '') + '</div>' +
        '<div class="card-location">📍 ' + p.endereco + '</div>' +
        '<div class="card-prices"><div class="price-item"><div class="price-label">' + p.modalidade + '</div><div class="price-value">' + fmtCurrency(p.lance) + '</div></div>' +
        (p.avaliacao ? '<div class="price-item"><div class="price-label">Avaliação</div><div class="price-value original">' + fmtCurrency(p.avaliacao) + '</div></div>' : '') + '</div>' +
        m2Html +
        '<div class="card-meta">' + quartosTag + vagasTag +
        (p.area ? '<span class="meta-tag">' + p.area + '</span>' : '') +
        (p.encerramento ? '<span class="meta-tag">Encerramento: ' + fmtDate(p.encerramento) + '</span>' : '') +
        (p.ocupacao === 'ocupado' ? '<span class="meta-tag">⚠️ Ocupado</span>' : '') +
        (p.ocupacao === 'desocupado' ? '<span class="meta-tag">✅ Desocupado</span>' : '') +
        (p.semVagas ? '<span class="meta-tag" style="background:#da3633;color:#fff">⛔ SEM VAGAS</span>' : '') +
        alertTags + '</div>' +
        '<a href="' + p.link + '" target="_blank" class="card-link">Ver no ' + p.fonte + ' →</a></div>';
    }}
    function sortData(data, sortKey) {{
      const sorted = [...data];
      switch (sortKey) {{
        case 'score': sorted.sort((a, b) => (b.score || 0) - (a.score || 0)); break;
        case 'price-asc': sorted.sort((a, b) => a.lance - b.lance); break;
        case 'price-desc': sorted.sort((a, b) => b.lance - a.lance); break;
        case 'discount': sorted.sort((a, b) => (b.desconto || 0) - (a.desconto || 0)); break;
        case 'm2': sorted.sort((a, b) => (a.precoM2 || 99999) - (b.precoM2 || 99999)); break;
        case 'real-discount': sorted.sort((a, b) => (b.descontoReal || -999) - (a.descontoReal || -999)); break;
      }}
      return sorted;
    }}
    function applyFilters() {{
      const search = document.getElementById('filterSearch').value.toLowerCase();
      const type = document.getElementById('filterType').value;
      const hood = document.getElementById('filterNeighborhood').value;
      const minScore = parseInt(document.getElementById('filterScore').value) || 0;
      const maxPrice = parseInt(document.getElementById('filterMaxPrice').value) || 0;
      const source = document.getElementById('filterSource').value;
      filteredData = ALL_PROPERTIES.filter(p => {{
        if (search && !(p.bairro.toLowerCase().includes(search) || p.endereco.toLowerCase().includes(search) || p.tipo.toLowerCase().includes(search))) return false;
        if (type && p.tipo !== type) return false;
        if (hood && p.bairro !== hood) return false;
        if (minScore && (p.score || 0) < minScore) return false;
        if (maxPrice && p.lance > maxPrice) return false;
        if (source && p.fonte !== source) return false;
        return true;
      }});
      filteredData = sortData(filteredData, currentSort);
      visibleCount = 24;
      renderCards();
    }}
    function renderCards() {{
      const container = document.getElementById('cardsContainer');
      const showing = filteredData.slice(0, visibleCount);
      container.innerHTML = showing.length > 0 ? showing.map((p, i) => renderCard(p, i < 3 && currentSort === 'score')).join('') : '<div class="no-results"><h3>Nenhum imóvel encontrado</h3><p>Tente ajustar os filtros</p></div>';
      document.getElementById('resultsCount').innerHTML = '<span>Mostrando <strong>' + Math.min(visibleCount, filteredData.length) + '</strong> de <strong>' + filteredData.length + '</strong> imóveis</span><span style="font-size:0.8em;">(' + ALL_PROPERTIES.length + ' total no banco)</span>';
      const btn = document.getElementById('loadMore');
      btn.style.display = visibleCount < filteredData.length ? 'block' : 'none';
      btn.textContent = 'Mostrar mais (' + (filteredData.length - visibleCount) + ' restantes)';
    }}
    function loadMore() {{ visibleCount += 24; renderCards(); }}
    function setSort(key) {{
      currentSort = key;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === key));
      filteredData = sortData(filteredData, key);
      visibleCount = 24;
      renderCards();
    }}
    function resetFilters() {{
      document.getElementById('filterSearch').value = '';
      document.getElementById('filterType').value = '';
      document.getElementById('filterNeighborhood').value = '';
      document.getElementById('filterScore').value = '0';
      document.getElementById('filterMaxPrice').value = '0';
      document.getElementById('filterSource').value = '';
      applyFilters();
    }}
    applyFilters();
  </script>
</body>
</html>'''
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Generated {output_path}')


if __name__ == '__main__':
    # Load data
    input_file = os.path.join(DATA_DIR, '2026-02-09.json')
    with open(input_file) as f:
        properties = json.load(f)
    
    print(f'Loaded {len(properties)} properties')
    
    # Enrich
    enriched = enrich_all(properties)
    
    # Save enriched data
    enriched_file = os.path.join(DATA_DIR, '2026-02-09-enriched.json')
    with open(enriched_file, 'w', encoding='utf-8') as f:
        json.dump(enriched, f, indent=2, ensure_ascii=False)
    print(f'Saved enriched data to {enriched_file}')
    
    # Stats
    with_score = [p for p in enriched if p.get('score')]
    avg_score = round(sum(p['score'] for p in with_score) / len(with_score)) if with_score else 0
    print(f'Avg score: {avg_score}/100')
    print(f'With R$/m²: {len([p for p in enriched if p.get("precoM2")])}')
    
    # Generate today's snapshot HTML
    today_html = os.path.join(ROOT_DIR, '2026-02-09.html')
    generate_html(enriched, today_html, False)
    
    # Generate index.html
    index_html = os.path.join(ROOT_DIR, 'index.html')
    generate_html(enriched, index_html, True)
    
    # Print top 5
    print('\n🏆 TOP 5:')
    for i, p in enumerate(enriched[:5], 1):
        disc = p.get('desconto') or 0
        aval = p.get('avaliacao') or 0
        print(f'{i}. {p["tipo"]} {p["bairro"]} R${p["lance"]/1000:.0f}k (aval R${aval/1000:.0f}k) -{disc}% | Score: {p.get("score", "?")} | {p["fonte"]}')
        print(f'   {p["link"]}')
