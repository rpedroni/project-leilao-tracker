#!/usr/bin/env tsx
/**
 * Leilão Tracker — Zuk + Caixa Scraper
 *
 * Scrapes Portal Zuk (HTML) and Caixa Econômica Federal (CSV via download page)
 * for auction properties in Curitiba and surrounding cities.
 *
 * Usage:
 *   npm run scrape              # scrape all sources
 *   npm run scrape:zuk          # scrape only Zuk
 *   npm run scrape:caixa        # scrape only Caixa
 */

import * as cheerio from "cheerio";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Configuration ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");

// Group-approved priority neighborhoods (Investment/Flipping WhatsApp group)
const PRIORITY_BAIRROS = [
  "Portão", "Batel", "Cabral", "Mercês", "Tarumã",
  "Jardim das Américas", "Jardim Social", "Centro",
];

// Normalized versions for case-insensitive matching
const PRIORITY_BAIRROS_NORMALIZED = PRIORITY_BAIRROS.map(b => normalize(b));

const ZUK_CITIES: Record<string, string> = {
  curitiba: "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/curitiba",
  "fazenda-rio-grande": "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/fazenda-rio-grande",
  "sao-jose-dos-pinhais": "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/sao-jose-dos-pinhais",
  pinhais: "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/pinhais",
  colombo: "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/colombo",
  araucaria: "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/araucaria",
  "campo-largo": "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/campo-largo",
  "almirante-tamandare": "https://www.portalzuk.com.br/leilao-de-imoveis/c/todos-imoveis/pr/regiao/almirante-tamandare",
};

const CAIXA_CSV_URL = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_PR.csv";

const CAIXA_TARGET_CITIES = [
  "CURITIBA", "FAZENDA RIO GRANDE", "SAO JOSE DOS PINHAIS", "PINHAIS",
  "COLOMBO", "ARAUCARIA", "CAMPO LARGO", "ALMIRANTE TAMANDARE",
];

const MAX_PRICE = 800_000;
const MIN_DISCOUNT = 40;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  tipo: string;
  bairro: string;
  endereco: string;
  lance: number;
  avaliacao: number;
  desconto: number;
  modalidade: string;
  encerramento: string | null;
  ocupacao: string;
  area: string;
  fonte: string;
  link: string;
  prioridade: boolean;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
}

function parseBRL(s: string): number {
  // "R$ 383.675,28" → 383675.28
  const clean = s.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean) || 0;
  return Math.round(val * 100) / 100; // round to cents
}

function parseDate(s: string): string | null {
  // "09/02/2026 às 11:08" → "2026-02-09"
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isPriority(bairro: string): boolean {
  const n = normalize(bairro);
  return PRIORITY_BAIRROS_NORMALIZED.some(p => n.includes(p) || p.includes(n));
}

function today(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

async function fetchHTML(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Zuk Scraper ────────────────────────────────────────────────────────────

async function scrapeZukListing(url: string, cityName: string): Promise<Property[]> {
  console.log(`  📡 Fetching Zuk listing: ${cityName}...`);
  let html: string;
  try {
    html = await fetchHTML(url);
  } catch (e: any) {
    console.log(`  ⚠️  Failed to fetch ${cityName}: ${e.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const properties: Property[] = [];

  // Each property card
  $(".card-property.card_lotes_div").each((_, card) => {
    try {
      const $card = $(card);

      // Extract link and ID
      const linkEl = $card.find(".card-property-image-wrapper a").first();
      const link = linkEl.attr("href") || "";
      const idMatch = link.match(/\/(\d+)-(\d+)$/);
      const zukId = idMatch ? idMatch[2] : "";
      if (!zukId) return;

      // Type from title attribute
      const title = linkEl.attr("title") || "";
      const tipoMatch = title.match(/^(\w[\w\s]*?) em leilão/);
      const tipo = tipoMatch ? tipoMatch[1] : $card.find(".card-property-price-lote").first().text().trim();

      // Address and bairro — extract city from location text
      const addressEl = $card.find(".card-property-address");
      const locationSpan = addressEl.find("span[style]").first().text().trim();
      // "Curitiba / PR - Portão" or "São José dos Pinhais / PR - Centro"
      const cityMatch = locationSpan.match(/^(.+?)\s*\/\s*PR/);
      const actualCity = cityMatch ? cityMatch[1].trim() : "";
      const isCtba = normalize(actualCity) === "curitiba" || actualCity === "";
      const bairroMatch = locationSpan.match(/- (.+)$/);
      const rawBairro = bairroMatch ? bairroMatch[1].trim() : cityName;
      // For non-Curitiba cities, append the city name to bairro
      const bairro = isCtba ? rawBairro : `${rawBairro} (${actualCity || titleCase(cityName.replace(/-/g, " "))})`;
      const enderecoSpan = addressEl.find("span[style='flex-basis: 100%;margin-left:2.5rem;']").text().trim();
      const endereco = enderecoSpan || "";

      // Area
      const areaLabel = $card.find(".card-property-info-label").text().trim();

      // Prices — get all price entries
      const prices = $card.find(".card-property-price[data-pracas], .card-property-price").toArray();
      let avaliacao = 0;
      let lance = 0;
      let desconto = 0;
      let encerramento: string | null = null;
      let modalidade = "Leilão";

      const numPracas = $card.find("[data-pracas]").attr("data-pracas");

      if (numPracas === "2") {
        // Has 1st and 2nd auction
        const priceEls = $card.find("ul.card-property-prices").last().find(".card-property-price");
        priceEls.each((i, el) => {
          const label = $(el).find(".card-property-price-label").text().trim();
          const valueText = $(el).find(".card-property-price-value").text().trim();
          const dateText = $(el).find(".card-property-price-data").text().trim();

          if (label.includes("1º")) {
            avaliacao = parseBRL(valueText);
          }
          if (label.includes("2º") || i === priceEls.length - 1) {
            lance = parseBRL(valueText);
            encerramento = parseDate(dateText);
            modalidade = "Leilão 2ª Praça";
          }
        });

        // Try to get discount percentage from the percent span
        const percentText = $card.find(".card-property-price-percent").text().trim();
        const percentMatch = percentText.match(/(\d+)/);
        if (percentMatch) {
          desconto = parseInt(percentMatch[1]);
        } else if (avaliacao > 0 && lance > 0) {
          desconto = Math.round((1 - lance / avaliacao) * 100);
        }
      } else if (numPracas === "1") {
        // Single price (Valor)
        const priceEls = $card.find("ul.card-property-prices").last().find(".card-property-price");
        priceEls.each((_, el) => {
          const label = $(el).find(".card-property-price-label").text().trim();
          if (label.includes("Valor") || label === "") {
            const valueText = $(el).find(".card-property-price-value").text().trim();
            lance = parseBRL(valueText);
            avaliacao = lance; // no separate appraisal for single-price items
            const dateText = $(el).find(".card-property-price-data").text().trim();
            encerramento = parseDate(dateText);
            modalidade = "Leilão";
          }
        });
      }

      // If we couldn't parse prices from data-pracas, try a simpler approach
      if (lance === 0) {
        const allPriceValues = $card.find(".card-property-price-value").toArray();
        for (const pv of allPriceValues) {
          const v = parseBRL($(pv).text());
          if (v > 0) {
            if (avaliacao === 0) avaliacao = v;
            lance = v; // last price is the lance
          }
        }
        const allDates = $card.find(".card-property-price-data").toArray();
        for (const dt of allDates) {
          encerramento = parseDate($(dt).text()) || encerramento;
        }
        if (avaliacao > 0 && lance > 0 && lance < avaliacao) {
          desconto = Math.round((1 - lance / avaliacao) * 100);
          modalidade = "Leilão 2ª Praça";
        }
      }

      if (lance === 0) return; // skip if no price

      properties.push({
        id: `zuk-${zukId}`,
        tipo,
        bairro,
        endereco,
        lance,
        avaliacao,
        desconto,
        modalidade,
        encerramento,
        ocupacao: "desconhecido",
        area: areaLabel || "",
        fonte: "Portal Zuk",
        link,
        prioridade: isPriority(bairro),
      });
    } catch (e: any) {
      console.log(`  ⚠️  Error parsing Zuk card: ${e.message}`);
    }
  });

  return properties;
}

async function scrapeZukDetail(property: Property): Promise<Property> {
  try {
    const html = await fetchHTML(property.link);
    const $ = cheerio.load(html);

    // Occupancy
    const bodyText = $("body").text();
    if (/im[oó]vel\s+ocupado/i.test(bodyText)) {
      property.ocupacao = "ocupado";
    } else if (/im[oó]vel\s+desocupado/i.test(bodyText)) {
      property.ocupacao = "desocupado";
    }

    // More area info
    const metroTerreno = bodyText.match(/Metragem terreno([\d.,]+m²)/);
    const metroConstruida = bodyText.match(/Metragem constru[ií]da([\d.,]+m²)/);
    if (metroConstruida) {
      property.area = metroConstruida[1];
      if (metroTerreno) {
        property.area += ` (terreno: ${metroTerreno[1]})`;
      }
    } else if (metroTerreno) {
      property.area = `terreno: ${metroTerreno[1]}`;
    }

    // Better modalidade from title
    const titleText = $("title").text();
    if (/compra direta/i.test(titleText) || /compra direta/i.test(bodyText)) {
      property.modalidade = "Compra Direta";
    }
  } catch (e: any) {
    // Detail fetch is best-effort
    console.log(`  ⚠️  Could not fetch detail for ${property.id}: ${e.message}`);
  }
  return property;
}

async function scrapeZuk(): Promise<Property[]> {
  console.log("\n🏛️  Scraping Portal Zuk...");
  const allProperties: Property[] = [];

  for (const [city, url] of Object.entries(ZUK_CITIES)) {
    const props = await scrapeZukListing(url, city);
    console.log(`  ✅ ${city}: ${props.length} properties found`);
    allProperties.push(...props);
    await sleep(500); // be polite
  }

  // Fetch details for each property (occupancy, better area info)
  console.log(`  📋 Fetching details for ${allProperties.length} Zuk properties...`);
  for (const prop of allProperties) {
    await scrapeZukDetail(prop);
    await sleep(1000); // 1s delay to avoid 429 rate limiting
  }

  return allProperties;
}

// ─── Caixa Scraper ──────────────────────────────────────────────────────────

async function scrapeCaixa(): Promise<Property[]> {
  console.log("\n🏦 Scraping Caixa Econômica Federal...");

  // Strategy: Try to fetch the CSV directly. Caixa has Radware bot protection,
  // so this may fail. In that case, check for a cached CSV file.
  let csvText = "";

  // Try direct fetch first (may work from some IPs / with retries)
  try {
    console.log("  📡 Attempting direct CSV download...");
    const resp = await fetch(CAIXA_CSV_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/csv,text/html,application/xhtml+xml,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": "https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp",
      },
    });

    const contentType = resp.headers.get("content-type") || "";
    const text = await resp.text();

    // Check if we got the actual CSV or a CAPTCHA page
    if (text.includes("N\u00ba do im\u00f3vel") || text.includes("Nº do imóvel") || text.includes("Lista de Im")) {
      csvText = text;
      console.log("  ✅ Direct download succeeded!");
    } else {
      console.log("  ⚠️  Got CAPTCHA/bot protection instead of CSV");
    }
  } catch (e: any) {
    console.log(`  ⚠️  Direct download failed: ${e.message}`);
  }

  // Fallback: check for cached CSV
  const cacheFile = join(DATA_DIR, "caixa_pr_cache.csv");
  if (!csvText && existsSync(cacheFile)) {
    console.log("  📂 Using cached Caixa CSV...");
    csvText = readFileSync(cacheFile, "latin1");
  }

  if (!csvText) {
    console.log("  ❌ No Caixa data available (bot protection + no cache)");
    console.log("     To populate cache, run: npm run scrape:caixa:browser");
    console.log("     Or manually download from: https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp");
    return [];
  }

  // Save/update cache
  writeFileSync(cacheFile, csvText, "latin1");

  // Parse CSV
  // Format: N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Descrição;Modalidade de venda;Link de acesso
  const lines = csvText.split("\n").filter(l => l.trim());
  const properties: Property[] = [];

  for (const line of lines) {
    // Skip header and metadata lines
    if (line.includes("Lista de Im") || line.includes("Nº do im") || line.includes("N\u00ba do")) continue;

    const fields = line.split(";").map(f => f.trim());
    if (fields.length < 11) continue;

    const [id, uf, cidade, bairro, endereco, precoStr, avaliacaoStr, descontoStr, descricao, modalidade, link] = fields;

    // Filter by target cities
    const cidadeNorm = cidade.toUpperCase().trim();
    if (!CAIXA_TARGET_CITIES.includes(cidadeNorm)) continue;

    const preco = parseBRL(precoStr);
    const avaliacao = parseBRL(avaliacaoStr);
    const desconto = parseFloat(descontoStr) || 0;

    if (preco === 0) continue;

    // Extract tipo from description
    let tipo = "Imóvel";
    const tipoMatch = descricao.match(/^(Apartamento|Casa|Sobrado|Terreno|Sala|Gleba|Loja|Galpão|Prédio)/i);
    if (tipoMatch) tipo = titleCase(tipoMatch[1]);

    // Extract area from description
    let area = "";
    const areaPriv = descricao.match(/([\d.,]+) de área privativa/);
    const areaTotal = descricao.match(/([\d.,]+) de área total/);
    const areaTerreno = descricao.match(/([\d.,]+) de área do terreno/);
    if (areaPriv && parseFloat(areaPriv[1]) > 0) {
      area = `${areaPriv[1]}m²`;
    } else if (areaTotal && parseFloat(areaTotal[1]) > 0) {
      area = `${areaTotal[1]}m²`;
    }
    if (areaTerreno && parseFloat(areaTerreno[1]) > 0) {
      area += area ? ` (terreno: ${areaTerreno[1]}m²)` : `terreno: ${areaTerreno[1]}m²`;
    }

    // Normalize bairro for display
    const bairroDisplay = titleCase(bairro.toLowerCase());

    // For cities outside Curitiba, include city in bairro
    const bairroFinal = cidadeNorm === "CURITIBA" ? bairroDisplay : `${bairroDisplay} (${titleCase(cidade.toLowerCase())})`;

    properties.push({
      id: `caixa-${id.trim()}`,
      tipo,
      bairro: bairroFinal,
      endereco,
      lance: preco,
      avaliacao: avaliacao > 0 ? avaliacao : preco,
      desconto: Math.round(desconto * 100) / 100,
      modalidade: modalidade || "Caixa",
      encerramento: null,
      ocupacao: "desconhecido",
      area,
      fonte: "Caixa Econômica",
      link: link || "",
      prioridade: isPriority(bairro),
    });
  }

  console.log(`  ✅ Caixa: ${properties.length} properties parsed from CSV`);
  return properties;
}

// ─── Filtering & Output ─────────────────────────────────────────────────────

function filterProperties(properties: Property[]): Property[] {
  return properties.filter(p => {
    // Price filter
    if (p.lance > MAX_PRICE) return false;
    // Discount filter: must have meaningful discount
    // Items with 0% discount are only kept if avaliacao is 0 (unknown appraisal)
    if (p.desconto < MIN_DISCOUNT) {
      // Keep only if we truly don't know the appraisal value
      if (p.avaliacao > 0) return false;
    }
    return true;
  });
}

function deduplicateProperties(properties: Property[]): Property[] {
  const seen = new Map<string, Property>();
  for (const p of properties) {
    // Deduplicate by normalized address
    const key = normalize(p.endereco).replace(/\s+/g, "");
    if (!seen.has(key) || p.desconto > (seen.get(key)?.desconto ?? 0)) {
      seen.set(key, p);
    }
  }
  return Array.from(seen.values());
}

function sortProperties(properties: Property[]): Property[] {
  return properties.sort((a, b) => {
    // Priority neighborhoods first
    if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1;
    // Then by discount (highest first)
    return b.desconto - a.desconto;
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find(a => a.startsWith("--source="))?.split("=")[1];

  console.log("🏠 Leilão Tracker — Scraper");
  console.log(`📅 Date: ${today()}`);
  console.log(`🎯 Filters: >${MIN_DISCOUNT}% discount, <R$${MAX_PRICE.toLocaleString("pt-BR")}`);

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  let allProperties: Property[] = [];

  // Scrape sources
  if (!sourceArg || sourceArg === "zuk") {
    const zukProps = await scrapeZuk();
    allProperties.push(...zukProps);
  }

  if (!sourceArg || sourceArg === "caixa") {
    const caixaProps = await scrapeCaixa();
    allProperties.push(...caixaProps);
  }

  console.log(`\n📊 Total scraped: ${allProperties.length} properties`);

  // Filter
  const filtered = filterProperties(allProperties);
  console.log(`📊 After filters (>${MIN_DISCOUNT}% discount, <R$${MAX_PRICE.toLocaleString("pt-BR")}): ${filtered.length} properties`);

  // Deduplicate
  const deduped = deduplicateProperties(filtered);
  console.log(`📊 After deduplication: ${deduped.length} properties`);

  // Sort
  const sorted = sortProperties(deduped);

  // Save
  const outputFile = join(DATA_DIR, `${today()}.json`);
  writeFileSync(outputFile, JSON.stringify(sorted, null, 2));
  console.log(`\n💾 Saved ${sorted.length} properties to ${outputFile}`);

  // Summary
  const priorityCount = sorted.filter(p => p.prioridade).length;
  const zukCount = sorted.filter(p => p.fonte === "Portal Zuk").length;
  const caixaCount = sorted.filter(p => p.fonte === "Caixa Econômica").length;

  console.log(`\n📋 Summary:`);
  console.log(`   ⭐ Priority neighborhoods: ${priorityCount}`);
  console.log(`   🏛️  Portal Zuk: ${zukCount}`);
  console.log(`   🏦 Caixa Econômica: ${caixaCount}`);

  if (sorted.length > 0) {
    console.log(`\n🏆 Top 5 deals:`);
    for (const p of sorted.slice(0, 5)) {
      console.log(`   ${p.prioridade ? "⭐" : "  "} ${p.tipo} - ${p.bairro} | R$${p.lance.toLocaleString("pt-BR")} (${p.desconto}% off) | ${p.fonte}`);
    }
  }

  return sorted;
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
