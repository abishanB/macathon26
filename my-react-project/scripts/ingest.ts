#!/usr/bin/env tsx
/**
 * RAG Ingestion Script — Backboard.io
 * 
 * Flow: Get/Create Assistant → Create Thread → Upload Text Extracts → Upload PDFs
 * Run: npx tsx scripts/ingest.ts
 */

import 'dotenv/config';
import { getBackboardClient, TORONTO_THREAD } from '../src/lib/backboard';
import { TORONTO_DOCS, TORONTO_PDF_SOURCES } from '../src/rag/toronto-docs';
import type { IngestReport, UploadResult } from '../src/rag/types';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('🏗️  UrbanSim RAG Ingestion');
  console.log('========================\n');

  const apiKey = process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_KEY;
  if (!apiKey) {
    console.error('❌ BACKBOARD_API_KEY not set in .env');
    process.exit(1);
  }
  console.log(`🔑 API Key: ${apiKey.trim().substring(0, 10)}...`);
  console.log(`🌐 Base: https://app.backboard.io/api\n`);

  const client = getBackboardClient();

  // ── Step 1: Get or Create Assistant (with improved prompt) ──
  console.log('1️⃣  Setting up assistant (with improved focused prompts)...');
  let assistantId: string;
  try {
    // Use improved assistant with better system prompt
    const assistant = await client.getOrCreateImprovedAssistant();
    assistantId = assistant.assistant_id;
    console.log(`   ✅ Assistant: "${assistant.name}" (${assistantId})\n`);
  } catch (err) {
    console.error('   ❌ Assistant setup failed:', (err as Error).message);
    process.exit(1);
  }

  // ── Step 2: Create Thread under Assistant ──
  console.log('2️⃣  Creating thread...');
  let threadId: string;
  try {
    const thread = await client.createThreadForAssistant(assistantId);
    threadId = thread.thread_id;
    console.log(`   ✅ Thread: ${threadId}\n`);
  } catch (err) {
    console.error('   ❌ Thread creation failed:', (err as Error).message);
    // Try using an existing thread
    console.log('   Checking existing threads...');
    try {
      const threads = await client.listAssistantThreads(assistantId);
      if (threads && threads.length > 0) {
        threadId = threads[0].thread_id;
        console.log(`   ✅ Using existing thread: ${threadId}\n`);
      } else {
        console.error('   ❌ No threads available.');
        process.exit(1);
      }
    } catch (listErr) {
      console.error('   ❌ Cannot list threads:', (listErr as Error).message);
      process.exit(1);
    }
  }

  // ── Step 3: Upload Text Extracts ──
  console.log(`3️⃣  Uploading ${TORONTO_DOCS.length} text extracts...\n`);
  const results: UploadResult[] = [];

  for (const doc of TORONTO_DOCS) {
    const label = `   [${doc.metadata.doc}]`;
    const result = await client.uploadDocumentToThread(threadId, {
      content: doc.content,
      metadata: doc.metadata,
      filename: `${doc.id}.txt`,
    });
    results.push(result);
    if (result.success) {
      console.log(`${label} ✅ (${doc.content.length} chars) → ${result.documentId}`);
    } else {
      console.log(`${label} ❌ ${result.error}`);
    }
  }

  // ── Step 4: Upload PDFs ──
  const docsDir = resolve(__dirname, '..', 'public', 'docs');
  const pdfResults: UploadResult[] = [];
  console.log(`\n4️⃣  Uploading PDFs from ${docsDir}...\n`);

  for (const pdf of TORONTO_PDF_SOURCES) {
    const pdfPath = resolve(docsDir, pdf.filename);
    const label = `   [${pdf.filename}]`;
    if (!existsSync(pdfPath)) {
      console.log(`${label} ⏭️  Not found, skipping`);
      continue;
    }
    const result = await client.uploadPdfToThread(threadId, pdfPath, pdf.filename);
    pdfResults.push(result);
    if (result.success) {
      console.log(`${label} ✅ → ${result.documentId}`);
    } else {
      console.log(`${label} ❌ ${result.error}`);
    }
  }

  // ── Step 5: Report ──
  const allResults = [...results, ...pdfResults];
  const report: IngestReport = {
    totalDocs: allResults.length,
    uploaded: allResults.filter(r => r.success).length,
    failed: allResults.filter(r => !r.success).length,
    threadId,
    timestamp: new Date().toISOString(),
    results: allResults,
  };

  console.log('\n========================');
  console.log('📊 Ingestion Report:');
  console.log(`   Assistant: ${assistantId}`);
  console.log(`   Thread:    ${threadId}`);
  console.log(`   Total:     ${report.totalDocs}`);
  console.log(`   ✅ OK:     ${report.uploaded}`);
  console.log(`   ❌ Failed: ${report.failed}`);
  console.log(`   Time:      ${report.timestamp}`);
  console.log('========================\n');

  if (report.uploaded > 0) {
    console.log('🎉 Documents uploaded!');
    console.log(`   Test with: npx tsx scripts/test-rag.ts`);
  }
  if (report.failed > 0) {
    console.log('⚠️  Some docs failed — check errors above.');
  }

  return report;
}

main().catch(console.error);
