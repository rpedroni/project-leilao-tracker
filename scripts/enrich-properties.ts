#!/usr/bin/env bun

/**
 * enrich-properties.ts — Post-scrape enrichment pass
 * 
 * Parses structured data from descriptions, detects red flags,
 * calculates R$/m², and scores deal quality.
 * 
 * Run standalone: bun run scripts/enrich-properties.ts data/2026-02-06.json
 * Also integrated into run-daily.ts pipeline.
 */

import type { Property } from './types.ts';
import { PRIORITY_NEIGHBORHOODS } from './types.ts';
import { log, normalizeText } from './utils.ts';

// --- Neighborhood avg price per m² (Curitiba, 2025/2026 estimates from market data) ---
// Source: Imovelweb/VivaReal/ZAP market reports for Curitiba
const NEIGHBORHOOD_PRICE_M2: Record<string, number> = {
  'batel': 12500,
  'agua verde': 9500,
  'bigorrilho': 10000,
  'cabral': 8500,
  'jardim social': 5800,
  'alto da xv': 7500,
  'hugo lange': 7000,
  'juveve': 7200,
  'portao': 6500,
  'reboucas': 7000,
  'cristo rei': 7800,
  'boa vista': 5500,
  'bacacheri': 5800,
  'taruma': 5000,
  'centro': 6000,
  'alto boqueirao': 3800,
  'boqueirao': 4200,
  'cidade industrial': 3500,
  'sitio cercado': 3200,
  'cajuru': 4000,
  'pinheirinho': 3800,
  'xaxim': 4000,
  'fazenda rio grande': 3000,
  'colombo': 3200,
  'sao jose dos pinhais': 4000,
  'pinhais': 3800,
  'araucaria': 3500,
  'campo largo': 3300,
  'almirante tamandare': 2800,
};

export interface EnrichedProperty extends Property {
  /** Number of bedrooms parsed from description */
  quartos?: number;
  /** Number of garage spots parsed from description */
  vagas?: number;
  /** Price per m² (lance / area_privativa) */
  precoM2?: number;
  /** Neighborhood average price per m² for comparison */
  mediaM2Bairro?: number;
  /** Real discount vs market (considering R$/m²) */
  descontoReal?: number;
  /** Deal quality score 0-100 */
  score?: number;
  /** Score breakdown */
  scoreBreakdown?: string;
}

/**
 * Parse structured fields from Caixa CSV description
 * Example: "Apartamento, 46.27 de área total, 40.31 de área privativa, 0.00 de área do terreno, 2 qto(s), WC, 1 sala(s), cozinha, 1 vaga(s) de garagem."
 */
function parseDescription(desc: string): { quartos?: number; vagas?: number; areaPriv?: number; areaTotal?: number; areaTerreno?: number } {
  const result: ReturnType<typeof parseDescription> = {};

  // Quartos
  const qtoMatch = desc.match(/(\d+)\s*qto\(s\)/i);
  if (qtoMatch) result.quartos = parseInt(qtoMatch[1]);

  // Vagas de garagem
  const vagaMatch = desc.match(/(\d+)\s*vaga\(s\)\s*de\s*garagem/i);
  if (vagaMatch) result.vagas = parseInt(vagaMatch[1]);

  // Area privativa
  const privMatch = desc.match(/([\d.,]+)\s*de\s*[aá]rea\s*privativa/i);
  if (privMatch) {
    const v = parseFloat(privMatch[1].replace(',', '.'));
    if (v > 0) result.areaPriv = v;
  }

  // Area total
  const totalMatch = desc.match(/([\d.,]+)\s*de\s*[aá]rea\s*total/i);
  if (totalMatch) {
    const v = parseFloat(totalMatch[1].replace(',', '.'));
    if (v > 0) result.areaTotal = v;
  }

  // Area terreno
  const terrenoMatch = desc.match(/([\d.,]+)\s*de\s*[aá]rea\s*do\s*terreno/i);
  if (terrenoMatch) {
    const v = parseFloat(terrenoMatch[1].replace(',', '.'));
    if (v > 0) result.areaTerreno = v;
  }

  return result;
}

/**
 * Extract numeric area from property.area string (e.g., "156.18m²" → 156.18)
 */
function extractArea(areaStr?: string): number | null {
  if (!areaStr) return null;
  const match = areaStr.match(/([\d.,]+)\s*m/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(',', '.'));
  return val > 0 ? val : null;
}

/**
 * Find neighborhood avg price per m²
 */
function findNeighborhoodAvg(bairro: string): number | null {
  const norm = normalizeText(bairro);
  for (const [key, val] of Object.entries(NEIGHBORHOOD_PRICE_M2)) {
    if (norm.includes(key) || key.includes(norm)) return val;
  }
  return null;
}

/**
 * Check if property is an apartment/house type that should have parking
 */
function expectsParking(tipo: string): boolean {
  const lower = tipo.toLowerCase();
  return ['apartamento', 'casa', 'sobrado', 'kitnet'].some(t => lower.includes(t));
}

/**
 * Calculate deal quality score (0-100)
 * 
 * Factors:
 * - Nominal discount (0-25 points)
 * - Real discount vs market R$/m² (0-25 points)
 * - Parking availability (0-15 points)
 * - Priority neighborhood (0-10 points)
 * - Occupancy (0-10 points)
 * - Auction closing date proximity (0-15 points) — closer = more urgent = higher score
 */
function calculateScore(prop: EnrichedProperty): { score: number; breakdown: string } {
  let score = 0;
  const parts: string[] = [];

  // 1. Nominal discount (0-25)
  const disc = prop.desconto || 0;
  const discScore = Math.min(25, Math.round(disc * 25 / 70)); // 70% = max 25
  score += discScore;
  parts.push(`Desc:${discScore}/25`);

  // 2. Real discount vs market (0-25)
  if (prop.descontoReal !== undefined) {
    const realScore = Math.min(25, Math.max(0, Math.round(prop.descontoReal * 25 / 50)));
    score += realScore;
    parts.push(`Real:${realScore}/25`);
  } else {
    // No data = neutral
    score += 10;
    parts.push('Real:10/25(?)');
  }

  // 3. Parking (0-15)
  if (prop.vagas !== undefined) {
    if (prop.vagas >= 2) { score += 15; parts.push('Vagas:15/15'); }
    else if (prop.vagas === 1) { score += 10; parts.push('Vagas:10/15'); }
    else { parts.push('Vagas:0/15⛔'); }
  } else if (prop.semVagas) {
    parts.push('Vagas:0/15⛔');
  } else if (expectsParking(prop.tipo)) {
    // Unknown parking for apt/house = penalty
    score += 3;
    parts.push('Vagas:3/15(?)');
  } else {
    score += 8; // sala/terreno doesn't need parking
    parts.push('Vagas:8/15(n/a)');
  }

  // 4. Priority neighborhood (0-10)
  if (prop.prioridade) { score += 10; parts.push('Bairro:10/10'); }
  else { score += 3; parts.push('Bairro:3/10'); }

  // 5. Occupancy (0-10)
  if (prop.ocupacao === 'desocupado') { score += 10; parts.push('Ocup:10/10'); }
  else if (prop.ocupacao === 'ocupado') { score += 2; parts.push('Ocup:2/10'); }
  else { score += 5; parts.push('Ocup:5/10(?)'); }

  // 6. Auction closing proximity (0-15) — closer deadlines score higher (urgency)
  if (prop.encerramento) {
    const daysUntil = Math.ceil((new Date(prop.encerramento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 3) { score += 15; parts.push('Prazo:15/15'); }
    else if (daysUntil <= 7) { score += 12; parts.push('Prazo:12/15'); }
    else if (daysUntil <= 14) { score += 8; parts.push('Prazo:8/15'); }
    else if (daysUntil <= 30) { score += 5; parts.push('Prazo:5/15'); }
    else { score += 2; parts.push('Prazo:2/15'); }
  } else {
    score += 7; // Venda direta = open-ended = neutral
    parts.push('Prazo:7/15(aberto)');
  }

  return { score: Math.min(100, score), breakdown: parts.join(' | ') };
}

/**
 * Enrich a single property with parsed data, flags, and scoring
 */
function enrichProperty(prop: Property): EnrichedProperty {
  const enriched: EnrichedProperty = { ...prop };
  const alertas: string[] = [...(prop.alertas || [])];

  // Parse structured description data (primarily for Caixa)
  if (prop.fonte === 'Caixa Econômica') {
    // Re-read the raw description from the link's imovel ID to match CSV
    // We can infer from existing fields
  }

  // The area field might come from scraper in format "156.18m²" or "46.27m² (terreno: 180.00m²)"
  const area = extractArea(prop.area);

  // Parse vagas from address field (Caixa puts "VAGA" in address)
  if (!enriched.vagas) {
    const addrVaga = prop.endereco?.match(/VAGA\s*(DE\s*(ESTACIONAMENTO|GARAGEM))?\s*(?:N[°º]?\s*)?(\d+)/i);
    if (addrVaga) enriched.vagas = 1; // Address mentions vaga = has at least 1
  }

  // Detect missing parking for apartments
  if (expectsParking(prop.tipo) && enriched.vagas === undefined && !prop.semVagas) {
    // For Caixa: description should mention "X vaga(s) de garagem"
    // If it doesn't, flag as unknown
    if (prop.fonte === 'Caixa Econômica') {
      // Check if the original description mentions vagas at all
      // We don't have the raw description here, but we can detect from the area string
      // or the address. Properties with VAGA in address have parking.
      const addrHasVaga = /VAGA|GARAG/i.test(prop.endereco || '');
      if (!addrHasVaga && prop.area && !prop.area.includes('terreno:')) {
        // Apartment with area but no vaga mention → suspicious
        alertas.push('⚠️ Vagas não informadas na descrição');
      }
    }
  }

  // Calculate R$/m²
  if (area && area > 10) {
    enriched.precoM2 = Math.round(prop.lance / area);

    // Find neighborhood average
    const avgM2 = findNeighborhoodAvg(prop.bairro);
    if (avgM2) {
      enriched.mediaM2Bairro = avgM2;
      // Real discount = how much below market price per m²
      enriched.descontoReal = Math.round((1 - enriched.precoM2 / avgM2) * 100);

      if (enriched.descontoReal < 0) {
        alertas.push(`📈 Acima do mercado! R$${enriched.precoM2}/m² vs média R$${avgM2}/m²`);
      }
    }
  }

  enriched.alertas = alertas.length > 0 ? alertas : undefined;

  // Calculate score
  const { score, breakdown } = calculateScore(enriched);
  enriched.score = score;
  enriched.scoreBreakdown = breakdown;

  return enriched;
}

/**
 * Enrich all properties — main entry point
 */
export function enrichProperties(properties: Property[]): EnrichedProperty[] {
  log('🔬 Enriching properties with parsed data and scoring...');

  const enriched = properties.map(enrichProperty);

  // Sort by score descending
  enriched.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Stats
  const withScore = enriched.filter(p => p.score !== undefined);
  const avgScore = Math.round(withScore.reduce((s, p) => s + (p.score || 0), 0) / withScore.length);
  const withM2 = enriched.filter(p => p.precoM2);
  const withAlerts = enriched.filter(p => p.alertas?.length);
  const aboveMarket = enriched.filter(p => p.descontoReal !== undefined && p.descontoReal < 0);

  log(`✅ Enriched ${enriched.length} properties`);
  log(`   Avg score: ${avgScore}/100`);
  log(`   With R$/m²: ${withM2.length}`);
  log(`   With alerts: ${withAlerts.length}`);
  log(`   Above market price: ${aboveMarket.length}`);

  return enriched;
}

// --- Standalone mode ---
if (import.meta.main) {
  const args = process.argv.slice(2);
  const inputFile = args[0] || 'data/2026-02-06.json';

  const data: Property[] = JSON.parse(require('fs').readFileSync(inputFile, 'utf8'));
  const enriched = enrichProperties(data);

  // Print top 10
  console.log('\n🏆 TOP 10 DEALS (by score):');
  console.log('─'.repeat(90));

  for (const p of enriched.slice(0, 10)) {
    const m2Str = p.precoM2 ? `R$${p.precoM2}/m²` : 'n/a';
    const realStr = p.descontoReal !== undefined ? `${p.descontoReal}%` : '?';
    const vagasStr = p.vagas !== undefined ? `${p.vagas}v` : p.semVagas ? '⛔0v' : '?v';
    console.log(`\n  ⭐ ${p.score}/100 — ${p.tipo} - ${p.bairro}`);
    console.log(`     R$${p.lance.toLocaleString('pt-BR')} (${p.desconto}% off) | ${m2Str} | Real: ${realStr} | ${vagasStr}`);
    console.log(`     ${p.scoreBreakdown}`);
    if (p.alertas?.length) console.log(`     🚨 ${p.alertas.join(' | ')}`);
  }

  // Print properties above market
  const above = enriched.filter(p => p.descontoReal !== undefined && p.descontoReal < 0);
  if (above.length > 0) {
    console.log(`\n\n⚠️ ABOVE MARKET PRICE (${above.length} properties — "discount" is misleading):`);
    console.log('─'.repeat(90));
    for (const p of above) {
      console.log(`  ❌ ${p.tipo} - ${p.bairro}: R$${p.precoM2}/m² vs avg R$${p.mediaM2Bairro}/m² (${Math.abs(p.descontoReal!)}% ABOVE)`);
    }
  }

  // Save enriched data
  const outputFile = inputFile.replace('.json', '-enriched.json');
  require('fs').writeFileSync(outputFile, JSON.stringify(enriched, null, 2));
  console.log(`\n💾 Saved enriched data to ${outputFile}`);
}
