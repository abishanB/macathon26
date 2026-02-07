#!/usr/bin/env tsx
/**
 * PDF Download Script
 * 
 * Downloads official Toronto municipal PDFs to /public/docs/ for local reference.
 * Run: npx tsx scripts/download-pdfs.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TORONTO_PDF_SOURCES } from '../src/rag/toronto-docs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, '..', 'public', 'docs');

async function downloadPdf(url: string, filepath: string): Promise<boolean> {
  try {
    console.log(`   ⬇️  Downloading: ${url.substring(0, 80)}...`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'UrbanSim-Research/1.0 (hackathon project)',
      },
    });

    if (!res.ok) {
      console.error(`   ❌ HTTP ${res.status} for ${url}`);
      return false;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(filepath, buffer);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`   ✅ Saved: ${filepath} (${sizeMB} MB)`);
    return true;
  } catch (err) {
    console.error(`   ❌ Download failed: ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  console.log('📥 Toronto PDF Download');
  console.log('========================\n');

  // Ensure docs directory exists
  if (!existsSync(DOCS_DIR)) {
    mkdirSync(DOCS_DIR, { recursive: true });
    console.log(`📁 Created: ${DOCS_DIR}\n`);
  }

  let downloaded = 0;
  let failed = 0;

  for (const source of TORONTO_PDF_SOURCES) {
    const filepath = join(DOCS_DIR, source.filename);

    if (existsSync(filepath)) {
      console.log(`   ⏭️  Already exists: ${source.filename}`);
      downloaded++;
      continue;
    }

    console.log(`\n📄 ${source.title}`);
    const success = await downloadPdf(source.url, filepath);
    if (success) downloaded++;
    else failed++;
  }

  console.log('\n========================');
  console.log(`📊 Results: ${downloaded} downloaded, ${failed} failed`);
  console.log(`📁 Location: ${DOCS_DIR}`);
  console.log('========================\n');
}

main().catch(console.error);
