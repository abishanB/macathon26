#!/usr/bin/env tsx
/**
 * RAG Query Test Script
 * 
 * Tests the Backboard RAG system with sample Toronto construction queries.
 * Run: npx tsx scripts/test-rag.ts
 * 
 * Requires: BACKBOARD_API_KEY in .env + documents already ingested
 */

import 'dotenv/config';
import { getBackboardClient } from '../src/lib/backboard';

const TEST_QUERIES = [
  'What are the QR code requirements for construction sites in Toronto?',
  'What is the maximum noise level allowed during construction?',
  'What is the delay threshold that triggers mitigation requirements?',
];

async function main() {
  console.log('🔍 UrbanSim RAG Query Test');
  console.log('========================\n');

  if (!process.env.BACKBOARD_API_KEY && !process.env.BACKBOARD_KEY) {
    console.error('❌ BACKBOARD_API_KEY not set in .env');
    process.exit(1);
  }

  const client = getBackboardClient();

  // Find the most recent thread (or first available)
  console.log('📂 Finding thread...');
  let threadId: string;
  try {
    const threads = await client.listThreads();
    if (!threads || threads.length === 0) {
      console.error('❌ No threads found. Run ingestion first: npx tsx scripts/ingest.ts');
      process.exit(1);
    }
    threadId = threads[0].thread_id || threads[0].id;
    console.log(`   ✅ Using thread: ${threadId}`);
  } catch (err) {
    console.error('❌ Failed to list threads:', (err as Error).message);
    process.exit(1);
  }

  // List documents in thread
  console.log('\n📄 Documents in thread:');
  try {
    const docs = await client.listDocuments(threadId);
    if (Array.isArray(docs)) {
      docs.forEach((d: any, i: number) => {
        console.log(`   ${i + 1}. ${d.filename || d.name || d.id || 'unknown'}`);
      });
    } else {
      console.log('   (response format):', JSON.stringify(docs).substring(0, 200));
    }
  } catch (err) {
    console.log('   ⚠️  Could not list docs:', (err as Error).message);
  }

  // Run test queries
  console.log('\n🧪 Running test queries...\n');
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const query = TEST_QUERIES[i];
    console.log(`--- Query ${i + 1}/${TEST_QUERIES.length} ---`);
    console.log(`❓ ${query}\n`);

    try {
      const result = await client.chat(threadId, query);
      console.log(`💡 Answer: ${typeof result.answer === 'string' ? result.answer.substring(0, 300) : JSON.stringify(result.answer).substring(0, 300)}`);
      if (result.sources && result.sources.length > 0) {
        console.log(`📄 Sources: ${result.sources.join(', ')}`);
      }
      if (result.confidence) {
        console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      }
    } catch (err) {
      console.error(`❌ Error: ${(err as Error).message}`);
    }
    console.log('');
  }

  console.log('========================');
  console.log('✅ Query test complete\n');
}

main().catch(console.error);
