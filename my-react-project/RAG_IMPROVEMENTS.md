# RAG System Improvements - Focused Answer Quality

## Changes Made (Feb 7, 2026)

### 1. Enhanced System Prompt
**File**: `src/lib/backboard.ts` - `TORONTO_ASSISTANT_CONFIG`

**Improvements**:
- Added explicit instructions to answer ONLY the specific question asked
- Prohibited referencing previous queries or consolidating topics
- Required exact numerical values and thresholds
- Added document source citation requirements
- Included quick reference guide to available documents

**Before**:
```
You are an expert... Answer questions... Be specific and cite sources.
```

**After**:
```
CRITICAL INSTRUCTIONS:
1. Answer ONLY the specific question asked
2. Be precise with numbers, thresholds, and regulations
3. Cite the specific document source
4. If the question asks about a specific topic, focus ONLY on that topic
5. Structure answers clearly: state the answer first, then provide supporting details
```

### 2. Improved Query Formatting
**File**: `src/lib/backboard.ts` - `formatQueryForFocusedAnswer()`

**Features**:
- Wraps each user query with explicit instructions
- Prevents query mixing and context bleeding
- Requires exact values and document citations
- Two formats: `concise` (default) and `detailed`

**Example formatted query**:
```
IMPORTANT: Answer ONLY the question below. This is a standalone query.
Do NOT reference, summarize, or consolidate previous questions...

Question: [user query]

Answer Requirements:
1. Answer THIS question only
2. Include exact numerical values
3. Cite the specific document name
4. Do NOT mention other topics unless directly relevant
```

### 3. Enhanced Chat Method
**File**: `src/lib/backboard.ts` - `chat()`

**New Options**:
```typescript
await client.chat(threadId, query, {
  format: 'detailed',  // or 'concise' (default)
  includeContext: true // future: add location context
});
```

### 4. Simulation Analysis Helper
**File**: `src/lib/backboard.ts` - `analyzeSimulationResults()`

**Purpose**: Structured analysis of Roadrunner simulation results against Toronto regulations

**Returns**:
```typescript
{
  severity: 1-10,
  affected: string,
  summary: string,
  fixes: string[],
  compliance: {
    delayThreshold: boolean,  // true if <= 5%
    noiseCompliant: boolean,
    requiresMitigation: boolean  // true if delay > 5%
  }
}
```

### 5. Updated Test Script
**File**: `scripts/test-rag.ts`

- Now uses `format: 'detailed'` for better answers
- Shows full answers (not truncated) to verify improvements

### 6. New Assistant Creation
**File**: `src/lib/backboard.ts` - `getOrCreateImprovedAssistant()`

- Creates assistant with name "UrbanSim Toronto (v2)"
- Uses improved system prompt automatically
- Future ingestion will use this improved version

## Usage

### For New Queries
```typescript
const client = getBackboardClient();
const result = await client.chat(threadId, 
  "What is the delay threshold?", 
  { format: 'detailed' }
);
```

### For Simulation Analysis
```typescript
const analysis = await client.analyzeSimulationResults(threadId, {
  delay: 7.5,  // 7.5% delay
  affectedArea: "Yonge-Eglinton intersection",
  peakHourImpact: 12
}, "Toronto, ON");
```

## Expected Improvements

1. **No Context Bleeding**: Answers won't mention unrelated topics
2. **Exact Values**: Answers include precise thresholds (">5%", "65dB", "$76")
3. **Focused Responses**: Each query answered independently
4. **Better Citations**: Specific document names cited
5. **Structured Analysis**: Simulation results analyzed with compliance checks

## Testing

Run the improved test script:
```bash
npx tsx scripts/test-rag.ts
```

Compare answers to previous version - should see:
- Direct answers to each question
- Exact numerical values
- No mixing of topics
- Clear document citations

## Next Steps

1. ✅ Improved prompts and query formatting
2. ⏭️ Test with more diverse queries
3. ⏭️ Integrate into simulation workflow
4. ⏭️ Add answer validation/quality checks
