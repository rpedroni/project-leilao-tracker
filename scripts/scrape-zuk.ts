import * as cheerio from 'cheerio';
import type { Property } from './types.ts';
import { log, parsePrice, parseBRDate, isPriorityNeighborhood, normalizeText } from './utils.ts';

const BASE_URL = 'https://www.portalzuk.com.br';

/** Correct Zuk URL patterns — /leilao-de-imoveis/c/todos-imoveis/pr/regiao/{city} */
const ZUK_CITIES: Record<string, string> = {
  curitiba: `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/curitiba`,
  'fazenda-rio-grande': `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/fazenda-rio-grande`,
  'sao-jose-dos-pinhais': `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/sao-jose-dos-pinhais`,
  pinhais: `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/pinhais`,
  colombo: `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/colombo`,
  araucaria: `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/araucaria`,
  'campo-largo': `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/campo-largo`,
  'almirante-tamandare': `${BASE_URL}/leilao-de-imoveis/c/todos-imoveis/pr/regiao/almirante-tamandare`,
};

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
}

function parseBRL(s: string): number {
  const clean = s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const val = parseFloat(clean) || 0;
  return Math.round(val * 100) / 100;
}

function parseDate(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function fetchHTML(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Scrape a single Zuk listing page. Uses real selector: .card-property.card_lotes_div
 */
async function scrapeZukListing(url: string, cityName: string): Promise<Property[]> {
  log(`Fetching Zuk listing: ${cityName}...`);
  let html: string;
  try {
    html = await fetchHTML(url);
  } catch (e: any) {
    log(`Failed to fetch ${cityName}: ${e.message}`, 'warn');
    return [];
  }

  const $ = cheerio.load(html);
  const properties: Property[] = [];

  // Real selector from Portal Zuk
  $('.card-property.card_lotes_div').each((_, card) => {
    try {
      const $card = $(card);

      // Extract link and ID
      const linkEl = $card.find('.card-property-image-wrapper a').first();
      const link = linkEl.attr('href') || '';
      const idMatch = link.match(/\/(\d+)-(\d+)$/);
      const zukId = idMatch ? idMatch[2] : '';
      if (!zukId) return;

      // Type from title attribute
      const title = linkEl.attr('title') || '';
      const tipoMatch = title.match(/^(\w[\w\s]*?) em leilão/);
      const tipo = tipoMatch ? tipoMatch[1] : $card.find('.card-property-price-lote').first().text().trim() || 'Imóvel';

      // Address and bairro
      const addressEl = $card.find('.card-property-address');
      const locationSpan = addressEl.find('span[style]').first().text().trim();
      // Pattern: "Curitiba / PR - Portão" or "São José dos Pinhais / PR - Centro"
      const cityMatch = locationSpan.match(/^(.+?)\s*\/\s*PR/);
      const actualCity = cityMatch ? cityMatch[1].trim() : '';
      const isCtba = normalizeText(actualCity) === 'curitiba' || actualCity === '';
      const bairroMatch = locationSpan.match(/- (.+)$/);
      const rawBairro = bairroMatch ? bairroMatch[1].trim() : cityName;
      const bairro = isCtba ? rawBairro : `${rawBairro} (${actualCity || titleCase(cityName.replace(/-/g, ' '))})`;
      const enderecoSpan = addressEl.find("span[style='flex-basis: 100%;margin-left:2.5rem;']").text().trim();
      const endereco = enderecoSpan || '';

      // Area
      const areaLabel = $card.find('.card-property-info-label').text().trim();

      // Prices — handle multiple auction rounds
      let avaliacao = 0;
      let lance = 0;
      let desconto = 0;
      let encerramento: string | null = null;
      let modalidade = 'Leilão';

      const numPracas = $card.find('[data-pracas]').attr('data-pracas');

      if (numPracas === '2') {
        const priceEls = $card.find('ul.card-property-prices').last().find('.card-property-price');
        priceEls.each((i, el) => {
          const label = $(el).find('.card-property-price-label').text().trim();
          const valueText = $(el).find('.card-property-price-value').text().trim();
          const dateText = $(el).find('.card-property-price-data').text().trim();

          if (label.includes('1º')) {
            avaliacao = parseBRL(valueText);
          }
          if (label.includes('2º') || i === priceEls.length - 1) {
            lance = parseBRL(valueText);
            encerramento = parseDate(dateText);
            modalidade = 'Leilão 2ª Praça';
          }
        });

        const percentText = $card.find('.card-property-price-percent').text().trim();
        const percentMatch = percentText.match(/(\d+)/);
        if (percentMatch) {
          desconto = parseInt(percentMatch[1]);
        } else if (avaliacao > 0 && lance > 0) {
          desconto = Math.round((1 - lance / avaliacao) * 100);
        }
      } else if (numPracas === '1') {
        const priceEls = $card.find('ul.card-property-prices').last().find('.card-property-price');
        priceEls.each((_, el) => {
          const label = $(el).find('.card-property-price-label').text().trim();
          if (label.includes('Valor') || label === '') {
            const valueText = $(el).find('.card-property-price-value').text().trim();
            lance = parseBRL(valueText);
            avaliacao = lance;
            const dateText = $(el).find('.card-property-price-data').text().trim();
            encerramento = parseDate(dateText);
            modalidade = 'Leilão';
          }
        });
      }

      // Fallback: try simpler price extraction
      if (lance === 0) {
        const allPriceValues = $card.find('.card-property-price-value').toArray();
        for (const pv of allPriceValues) {
          const v = parseBRL($(pv).text());
          if (v > 0) {
            if (avaliacao === 0) avaliacao = v;
            lance = v;
          }
        }
        const allDates = $card.find('.card-property-price-data').toArray();
        for (const dt of allDates) {
          encerramento = parseDate($(dt).text()) || encerramento;
        }
        if (avaliacao > 0 && lance > 0 && lance < avaliacao) {
          desconto = Math.round((1 - lance / avaliacao) * 100);
          modalidade = 'Leilão 2ª Praça';
        }
      }

      if (lance === 0) return; // skip if no price

      properties.push({
        id: `zuk-${zukId}`,
        tipo,
        bairro,
        endereco,
        lance,
        avaliacao: avaliacao || null,
        desconto: desconto || null,
        modalidade,
        encerramento,
        ocupacao: 'desconhecido',
        area: areaLabel || undefined,
        fonte: 'Portal Zuk',
        link,
        prioridade: isPriorityNeighborhood(bairro),
      });
    } catch (e: any) {
      log(`Error parsing Zuk card: ${e.message}`, 'warn');
    }
  });

  return properties;
}

/**
 * Fetch detail page for occupancy and area info (best-effort)
 */
async function scrapeZukDetail(property: Property): Promise<void> {
  try {
    const html = await fetchHTML(property.link);
    const $ = cheerio.load(html);
    const bodyText = $('body').text();

    // Occupancy
    if (/im[oó]vel\s+ocupado/i.test(bodyText)) {
      property.ocupacao = 'ocupado';
    } else if (/im[oó]vel\s+desocupado/i.test(bodyText)) {
      property.ocupacao = 'desocupado';
    }

    // Better area info
    const metroConstruida = bodyText.match(/Metragem constru[ií]da([\d.,]+m²)/);
    const metroTerreno = bodyText.match(/Metragem terreno([\d.,]+m²)/);
    if (metroConstruida) {
      property.area = metroConstruida[1];
      if (metroTerreno) property.area += ` (terreno: ${metroTerreno[1]})`;
    } else if (metroTerreno) {
      property.area = `terreno: ${metroTerreno[1]}`;
    }

    // Better modalidade
    const titleText = $('title').text();
    if (/compra direta/i.test(titleText) || /compra direta/i.test(bodyText)) {
      property.modalidade = 'Compra Direta';
    }
  } catch (e: any) {
    log(`Could not fetch detail for ${property.id}: ${e.message}`, 'warn');
  }
}

/**
 * Scrape Portal Zuk for Curitiba + Grande Curitiba properties
 */
export async function scrapeZuk(): Promise<Property[]> {
  log('🏛️ Starting Portal Zuk scraper...');
  const allProperties: Property[] = [];

  for (const [city, url] of Object.entries(ZUK_CITIES)) {
    const props = await scrapeZukListing(url, city);
    log(`✅ ${city}: ${props.length} properties found`);
    allProperties.push(...props);
    await sleep(500);
  }

  // Fetch details (occupancy, area) — best-effort with rate limiting
  log(`📋 Fetching details for ${allProperties.length} Zuk properties...`);
  for (const prop of allProperties) {
    await scrapeZukDetail(prop);
    await sleep(1000); // avoid 429s
  }

  log(`✅ Portal Zuk: Found ${allProperties.length} total properties`);
  return allProperties;
}

// Run standalone
if (import.meta.main) {
  const properties = await scrapeZuk();
  console.log(JSON.stringify(properties, null, 2));
  console.log(`\nTotal: ${properties.length} properties`);
}
