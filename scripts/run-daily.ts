#!/usr/bin/env bun

import { scrapeZuk } from './scrape-zuk.ts';
import { scrapeLeilaoImovel } from './scrape-leilaoimovel.ts';
import { scrapeCaixa } from './scrape-caixa.ts';
import { deduplicateProperties, markNewProperties } from './deduplicate.ts';
import { generateHTML } from './generate-html.ts';
import { enrichProperties } from './enrich-properties.ts';
import type { Property } from './types.ts';
import { log, formatDate } from './utils.ts';
import { existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dir, '..', 'data');
const ROOT_DIR = join(import.meta.dir, '..');

/**
 * Main daily scraping routine
 */
async function runDaily() {
  const startTime = Date.now();
  log('🚀 Starting daily leilão tracker run...');
  
  try {
    // Step 1: Run all scrapers in parallel
    log('Step 1: Running scrapers...');
    const [zukProps, leilaoProps, caixaProps] = await Promise.allSettled([
      scrapeZuk(),
      scrapeLeilaoImovel(),
      scrapeCaixa()
    ]);
    
    // Collect successful results
    const sources: Property[][] = [];
    
    if (zukProps.status === 'fulfilled' && zukProps.value.length > 0) {
      sources.push(zukProps.value);
    } else if (zukProps.status === 'rejected') {
      log(`Portal Zuk failed: ${zukProps.reason}`, 'error');
    }
    
    if (leilaoProps.status === 'fulfilled' && leilaoProps.value.length > 0) {
      sources.push(leilaoProps.value);
    } else if (leilaoProps.status === 'rejected') {
      log(`Leilão Imóvel failed: ${leilaoProps.reason}`, 'error');
    }
    
    if (caixaProps.status === 'fulfilled' && caixaProps.value.length > 0) {
      sources.push(caixaProps.value);
    } else if (caixaProps.status === 'rejected') {
      log(`Caixa failed: ${caixaProps.reason}`, 'error');
    }
    
    if (sources.length === 0) {
      log('❌ All scrapers failed, aborting', 'error');
      process.exit(1);
    }
    
    log(`Scrapers completed: ${sources.length} sources succeeded`);
    
    // Step 2: Deduplicate
    log('Step 2: Deduplicating properties...');
    const deduplicated = deduplicateProperties(sources);
    
    if (deduplicated.length === 0) {
      log('⚠️ No properties found matching filters', 'warn');
    }
    
    // Step 3: Compare with yesterday's data and mark new properties
    log('Step 3: Marking new properties...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayFile = join(DATA_DIR, `${formatDate(yesterday)}.json`);
    
    let previousProperties: Property[] = [];
    if (existsSync(yesterdayFile)) {
      try {
        previousProperties = await Bun.file(yesterdayFile).json();
        log(`Loaded ${previousProperties.length} properties from yesterday`);
      } catch (error) {
        log(`Could not load yesterday's data: ${error}`, 'warn');
      }
    }
    
    const withNewFlags = markNewProperties(deduplicated, previousProperties);
    
    // Step 3.5: Apply manual overrides (semVagas, alertas, etc.)
    const overridesFile = join(DATA_DIR, 'property-overrides.json');
    if (existsSync(overridesFile)) {
      try {
        const overrides = JSON.parse(await Bun.file(overridesFile).text());
        let overrideCount = 0;
        for (const prop of withNewFlags) {
          const override = overrides[prop.id];
          if (override) {
            if (override.semVagas) prop.semVagas = true;
            if (override.alertas) {
              prop.alertas = [...(prop.alertas || []), ...override.alertas];
            }
            overrideCount++;
          }
        }
        if (overrideCount > 0) log(`Applied ${overrideCount} manual overrides`);
      } catch (error) {
        log(`Could not load overrides: ${error}`, 'warn');
      }
    }
    
    // Step 4: Enrich properties with scoring, R$/m², and alert detection
    log('Step 4: Enriching properties...');
    const enriched = enrichProperties(withNewFlags);
    
    // Step 5: Save today's data
    log('Step 5: Saving data...');
    const today = formatDate();
    const todayFile = join(DATA_DIR, `${today}.json`);
    await Bun.write(todayFile, JSON.stringify(enriched, null, 2));
    log(`Saved ${enriched.length} properties to ${todayFile}`);
    
    // Step 6: Generate HTML pages
    log('Step 6: Generating HTML...');
    
    // Generate today's snapshot
    const todayHtml = join(ROOT_DIR, `${today}.html`);
    await generateHTML(enriched, todayHtml, false);
    
    // Generate index.html (current)
    const indexHtml = join(ROOT_DIR, 'index.html');
    await generateHTML(enriched, indexHtml, true);
    
    // Step 7: Git commit and push
    log('Step 7: Committing to git...');
    await gitCommitAndPush(today, withNewFlags.length);
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ Daily run completed in ${duration}s`);
    log(`📊 Summary: ${withNewFlags.length} properties, ${withNewFlags.filter(p => p.novo).length} new`);
    
  } catch (error) {
    log(`❌ Fatal error in daily run: ${error}`, 'error');
    process.exit(1);
  }
}

/**
 * Commit and push changes to git
 */
async function gitCommitAndPush(date: string, count: number) {
  try {
    // Add all changes
    await execGit(['add', '.']);
    
    // Commit
    const message = `Update: ${date} - ${count} properties`;
    await execGit(['commit', '-m', message]);
    
    // Push
    await execGit(['push', 'origin', 'main']);
    
    log('Git: Changes committed and pushed');
    
  } catch (error) {
    log(`Git error: ${error}`, 'warn');
    // Don't fail the entire run if git fails
  }
}

/**
 * Execute git command
 */
async function execGit(args: string[]): Promise<void> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: ROOT_DIR,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  
  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Git command failed: ${stderr}`);
  }
}

// Run
if (import.meta.main) {
  runDaily().catch(error => {
    log(`Unhandled error: ${error}`, 'error');
    process.exit(1);
  });
}
