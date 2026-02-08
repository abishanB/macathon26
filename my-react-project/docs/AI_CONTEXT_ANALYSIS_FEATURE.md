# AI Context Analysis Feature

**Created:** February 8, 2026  
**Feature:** AI-powered analysis of construction impact based on nearby building context  
**Model:** Gemini 2.0 Flash (via Backboard.io + OpenRouter)

---

## Overview

The AI Context Analysis feature uses Gemini 2.0 Flash to analyze the impact of construction based on **what's actually nearby**. It provides insights about business competition, feasibility concerns, community impact, and opportunities.

### What It Analyzes

1. **Business Impact**
   - 2+ restaurants nearby → competition analysis
   - Multiple similar stores → market saturation concerns
   - Customer base dilution effects

2. **Feasibility Concerns**
   - Multiple schools → enrollment/class size impact
   - Conflicting uses (industrial + residential)
   - Over-concentration warnings

3. **Community Impact**
   - Access disruption to essential services
   - Parking effects on nearby businesses
   - Foot traffic changes

4. **Opportunities**
   - Complementary businesses (coffee + bookstore)
   - Mixed-use benefits
   - Urban density improvements

---

## Technical Implementation

### Architecture

```
SimulationResultsPanel
  │
  ├─> Nearby Buildings Query (10px radius)
  │   └─> Returns: ["Taco Bell", "McDonald's", "Subway", ...]
  │
  ├─> Mapbox Geocoding (get real addresses)
  │   └─> Returns: ["234 King St W", "180 Wellington St", ...]
  │
  └─> AI Context Analysis
      ├─> Build context prompt with nearby buildings
      ├─> Call Backboard.io API
      ├─> Route to Gemini 2.0 Flash via OpenRouter
      └─> Display analysis in yellow card
```

### Data Flow

```typescript
useEffect #1: Query Nearby Buildings
  ↓
nearbyBuildings state updated
  ↓
useEffect #2: AI Analysis triggers
  ↓
Backboard API call with context
  ↓
Gemini analyzes and responds
  ↓
aiAnalysis state updated
  ↓
UI displays insights
```

---

## Example Outputs

### Scenario 1: Restaurant Cluster

**Nearby Buildings:**
- 🍽️ Taco Bell
- 🍔 McDonald's
- 🍕 Pizza Pizza
- ☕ Tim Hortons

**AI Analysis:**
> **Business Impact:** High restaurant concentration detected. New construction will increase competition in already saturated dining market. Existing establishments may see 15-25% customer reduction during 6-month construction due to parking loss and reduced foot traffic. **Opportunity:** Consider complementary uses (grocery, pharmacy) instead of adding another food service venue. **Community:** Road closures will significantly impact delivery access for all 4 restaurants during peak hours.

---

### Scenario 2: School Proximity

**Nearby Buildings:**
- 🏫 St. Michael's College School
- 🏫 University of Toronto - Victoria College
- 📚 E.J. Pratt Library

**AI Analysis:**
> **Feasibility Concern:** Multiple educational institutions within 10m suggests this is an established academic precinct. New construction during school year (Sep-Jun) will disrupt 2,000+ students. **Critical:** Construction timing must avoid exam periods (Dec, Apr) per Toronto guidelines. **Traffic:** Lane closures will impact school bus routes and parent drop-off zones. **Recommendation:** Coordinate with institutions, restrict work to summer months, maintain pedestrian access.

---

### Scenario 3: Mixed-Use Opportunity

**Nearby Buildings:**
- ☕ Starbucks
- 📚 Indigo Books
- 🏦 TD Bank
- 🏨 Marriott Hotel

**AI Analysis:**
> **Opportunity Detected:** Complementary business mix creates synergy. New construction could add residential/office space to leverage existing retail/services infrastructure. **Business Impact:** Minimal competition risk - diverse tenant types. **Community:** Area already pedestrian-friendly with transit access. **Construction Strategy:** Phased approach to maintain hotel access and retail visibility. Consider ground-floor retail in new building to enhance district.

---

## Prompt Engineering

### Context Provided to AI

```typescript
const query = `
NEARBY BUILDINGS (within immediate vicinity, 2-10m radius):
1. Taco Bell (restaurant) - 234 King Street West, Toronto
2. McDonald's (restaurant) - 180 Wellington Street, Toronto
3. Subway (restaurant) - 200 King Street West, Toronto

BUILDING TYPES PRESENT: restaurant, food

CONSTRUCTION DETAILS:
- Buildings placed: 1
- Road segments closed: 4
- Traffic congestion: Medium-High

Provide analysis covering:
1. BUSINESS IMPACT (competition, saturation)
2. FEASIBILITY CONCERNS (unusual patterns)
3. COMMUNITY IMPACT (access, parking, traffic)
4. OPPORTUNITIES (complementary uses, benefits)

Keep response concise (3-5 sentences), Toronto-focused.
`;
```

### Model Configuration

```typescript
llm_provider: 'openrouter'
model_name: 'google/gemini-2.0-flash-exp'
```

**Why Gemini 2.0 Flash?**
- Fast responses (1-2 seconds)
- Good at contextual reasoning
- Cost-effective ($0.075/1M tokens)
- Better than GPT-3.5 for structured analysis

---

## UI Design

### Loading State

```
🤖 AI Impact Analysis
┌─────────────────────────────────────┐
│ 🔄 Analyzing nearby context...      │
│ Evaluating business competition,    │
│ feasibility, and community impact   │
└─────────────────────────────────────┘
(Light blue background)
```

### Analysis Display

```
🤖 AI Impact Analysis
┌─────────────────────────────────────┐
│ Contextual Insights:                │
│                                     │
│ Business Impact: High restaurant    │
│ concentration detected. New         │
│ construction will increase...       │
│                                     │
│ ─────────────────────────────────  │
│ ⚡ Powered by Gemini 2.0 Flash ·   │
│ Based on local building context     │
└─────────────────────────────────────┘
(Yellow background, brown text)
```

### No API Key State

```
🤖 AI Impact Analysis
┌─────────────────────────────────────┐
│ Enable AI analysis by setting       │
│ VITE_BACKBOARD_API_KEY in .env      │
└─────────────────────────────────────┘
(Gray background, italic)
```

---

## Configuration

### Environment Variables Required

```bash
# .env file
VITE_BACKBOARD_API_KEY=your_backboard_key_here
```

**Backboard.io automatically routes to:**
- OpenRouter
- Gemini 2.0 Flash model
- No separate OpenRouter key needed

### Customizing Analysis Focus

Edit the prompt in `SimulationResultsPanel.tsx`:

```typescript
const query = `
// Add/remove analysis categories:
5. REGULATORY COMPLIANCE: Zoning restrictions, permit requirements
6. ECONOMIC IMPACT: Property values, tax revenue
7. ENVIRONMENTAL: Green space, sustainability
`;
```

### Adjusting Response Length

```typescript
// Current: "3-5 sentences max"
Provide a brief, actionable analysis (3-5 sentences max)

// For more detail:
Provide a detailed analysis (2-3 paragraphs)

// For executive summary:
Provide a one-sentence executive summary
```

---

## Performance

### API Call Timing

| Phase | Duration | Notes |
|-------|----------|-------|
| Nearby building query | ~5ms | Local vector tile query |
| Geocoding (5 buildings) | ~300ms | Mapbox API (parallel) |
| AI analysis | 1-2 seconds | Gemini 2.0 Flash |
| **Total** | **~2 seconds** | Async, doesn't block UI |

### Cost Analysis

**Per construction site analysis:**
- Geocoding: 5 requests × $0.005 = $0.025
- AI analysis: ~500 tokens × $0.000075 = $0.0000375
- **Total per analysis: ~$0.025** (2.5 cents)

**Monthly usage (100 analyses):**
- Geocoding: $2.50
- AI: $0.004
- **Total: ~$2.50/month**

### Optimization Strategies

1. **Cache geocoded addresses** - Reduce repeat API calls
2. **Debounce analysis** - Don't re-analyze on every building edit
3. **Progressive disclosure** - Load analysis only when section expanded
4. **Local caching** - Store analysis results by building ID

---

## State Management

### React State Variables

```typescript
const [nearbyBuildings, setNearbyBuildings] = useState<NearbyPlace[]>([]);
const [aiAnalysis, setAiAnalysis] = useState<string>('');
const [isAnalyzing, setIsAnalyzing] = useState(false);
```

### Trigger Conditions

AI analysis runs when ALL conditions are met:
- ✅ Panel is visible (`isVisible === true`)
- ✅ Panel is not minimized (`isMinimized === false`)
- ✅ Nearby buildings found (`nearbyBuildings.length > 0`)
- ✅ Not already analyzing (`isAnalyzing === false`)

### Dependencies

```typescript
useEffect(() => {
  // ... analysis logic
}, [nearbyBuildings, buildingCount, closedRoads, stats.closed, isVisible, isMinimized, isAnalyzing]);
```

Re-runs when:
- Nearby buildings change
- Building count changes
- Road closures change
- Panel visibility changes

---

## Error Handling

### API Failures

```typescript
try {
  const result = await backboard.addMessage(threadId, query, {...});
  setAiAnalysis(result.answer || '');
} catch (error) {
  console.error('[AI Analysis] Failed:', error);
  setAiAnalysis(''); // Clear analysis, show nothing
} finally {
  setIsAnalyzing(false); // Always reset loading state
}
```

### Missing API Key

```typescript
if (!apiKey) {
  console.warn('[AI Analysis] No Backboard API key found');
  setAiAnalysis('');
  return; // Show "Enable AI analysis" message
}
```

### No Nearby Buildings

```typescript
if (nearbyBuildings.length === 0) {
  return; // Don't run analysis, don't show section
}
```

---

## Testing

### Manual Test Scenarios

#### Test 1: Restaurant Competition
1. Place building near Yonge & Dundas (high restaurant density)
2. Expected analysis mentions: competition, market saturation, customer dilution

#### Test 2: School/Institution
1. Place building near University of Toronto
2. Expected analysis mentions: enrollment impact, construction timing, student access

#### Test 3: Mixed-Use
1. Place building in Financial District (offices, banks, retail)
2. Expected analysis mentions: complementary uses, synergy, opportunities

#### Test 4: No Nearby Buildings
1. Place building in park or water
2. Expected: No "AI Impact Analysis" section shown

#### Test 5: No API Key
1. Remove VITE_BACKBOARD_API_KEY from .env
2. Expected: Gray message "Enable AI analysis by setting..."

### Console Verification

Look for:
```
[AI Analysis] Starting analysis of nearby buildings...
[AI Analysis] Complete. Length: 347 chars
```

Or error:
```
[AI Analysis] Failed: Error: ...
```

---

## Integration with Existing Features

### Works With

- ✅ **Nearby Buildings** - Uses same building list as input
- ✅ **Traffic Simulation** - Considers closed roads and congestion
- ✅ **Construction Impact** - Factors in building count
- ✅ **Backboard RAG** - Uses same API client and thread system

### Future Integrations

- [ ] **Building Analysis Modal** - Show detailed analysis on click
- [ ] **Historical Data** - Learn from past construction impacts
- [ ] **Real-time Updates** - Re-analyze when buildings change
- [ ] **Export Reports** - PDF generation with AI insights

---

## API Details

### Backboard.io API

**Endpoint:** `https://app.backboard.io/api/threads/{threadId}/messages`  
**Auth:** `X-API-Key` header  
**Method:** POST (multipart/form-data)

**Request:**
```typescript
{
  content: "Analyze the impact...",
  llm_provider: "openrouter",
  model_name: "google/gemini-2.0-flash-exp"
}
```

**Response:**
```typescript
{
  answer: "Business Impact: High restaurant concentration...",
  content: "...",
  message: "..."
}
```

### Thread Management

**Thread ID:** `context_analysis_thread` (consistent across sessions)

**Why fixed thread ID?**
- Maintains conversation history
- AI learns patterns over multiple analyses
- Can reference previous insights

---

## Limitations & Future Work

### Current Limitations

1. **No spatial clustering** - Doesn't group buildings by proximity level
2. **Fixed response length** - Always 3-5 sentences (might need more/less)
3. **No image analysis** - Can't see actual building renders
4. **English only** - No multilingual support yet

### Planned Enhancements

#### Short-term
- [ ] Add retry logic for API failures
- [ ] Cache analysis results
- [ ] Progressive loading (show partial results)

#### Medium-term
- [ ] Sentiment analysis (positive/negative/neutral)
- [ ] Severity scoring (1-10 scale)
- [ ] Actionable recommendations with Toronto reg citations
- [ ] Integration with Toronto Open Data

#### Long-term
- [ ] Multi-model ensemble (GPT-4o + Claude + Gemini)
- [ ] Fine-tuned model on Toronto construction data
- [ ] Predictive impact modeling
- [ ] Real-time construction permit integration

---

## Examples by Building Type

### Construction Site Near Restaurants

**Input:**
- 3 restaurants within 10 pixels
- High foot traffic area
- 4 road closures

**Output:**
> *High restaurant concentration (3 establishments). Construction will intensify competition for reduced foot traffic. Expect 20-30% revenue decline for existing restaurants during active phase. Mitigation: Maintain pedestrian access, coordinate construction phases to preserve parking.*

---

### Construction Site Near Schools

**Input:**
- 2 schools/colleges nearby
- Academic district
- Limited parking

**Output:**
> *Educational corridor detected. Construction during school year (Sep-Jun) will impact 1,500+ students daily. Major concern: Lane closures affect school bus routes and parent drop-off. Critical: Coordinate with institutions, avoid exam periods (Dec, Apr), maintain sidewalk access per Toronto school zone regulations.*

---

### Construction Site in Retail Area

**Input:**
- Stores: BMV, Value Village, One Plant, Healthy Planet
- Mixed retail types
- Heavy pedestrian use

**Output:**
> *Diverse retail mix reduces direct competition but construction threatens shared customer base. Store Like businesses (value/thrift) attract price-sensitive shoppers who may avoid construction zones. Opportunity: Ground-floor retail in new building could create retail anchor. Maintain storefront visibility and sidewalk access to minimize revenue loss.*

---

## Debugging

### Enable Debug Output

Already included! Check console for:
```javascript
[AI Analysis] Starting analysis of nearby buildings...
[AI Analysis] Complete. Length: 347 chars
```

### Common Issues

#### "No analysis shown"

**Causes:**
1. No nearby buildings found (10px radius too tight)
2. No API key set
3. API call failed

**Check console for:**
```
[AI Analysis] No Backboard API key found  ← Missing key
[AI Analysis] Failed: Error: ...          ← API error
```

#### "Analysis takes forever"

**Causes:**
- Slow network connection
- Gemini API overloaded
- Too many nearby buildings (large prompt)

**Solutions:**
1. Reduce to top 3 buildings (not 5)
2. Add timeout (10 seconds)
3. Show "Taking longer than expected..." message

#### "Analysis not relevant"

**Causes:**
- Query buildings but got unrelated analysis
- AI hallucinating
- Prompt not specific enough

**Solutions:**
1. Add more constraints to prompt
2. Include specific Toronto context
3. Use structured output (JSON format)

---

## Cost Management

### Free Tier Limits

**Backboard.io:**
- Check their pricing page for current limits

**OpenRouter:**
- Gemini 2.0 Flash: $0.075 per 1M input tokens
- Typical analysis: ~500 tokens = $0.0000375

**Mapbox Geocoding:**
- Free: 100,000 requests/month
- Paid: $0.005 per request after

### Staying Within Budget

1. **Cache analyses** - Don't re-analyze same building twice
2. **Batch operations** - Analyze multiple buildings at once
3. **Lazy loading** - Only analyze when section expanded
4. **Sampling** - For many buildings, analyze subset

---

## Files Modified

- ✅ `src/components/SimulationResultsPanel.tsx`
  - Added AI analysis state and logic
  - Added Backboard API integration
  - Added yellow analysis card UI
  - Added loading/error states

- ✅ `src/App.tsx`
  - Fixed deck.gl import errors
  - Removed unused MapboxOverlay imports
  - Fixed TypeScript implicit any errors

- ✅ `docs/AI_CONTEXT_ANALYSIS_FEATURE.md` - This documentation

---

## Security Considerations

### API Key Protection

**Never commit:**
```bash
# ❌ DON'T
VITE_BACKBOARD_API_KEY=sk_live_abc123...

# ✓ DO (in .env.example)
VITE_BACKBOARD_API_KEY=your_backboard_api_key_here
```

### Rate Limiting

Backboard.io handles rate limiting internally. If you hit limits:
1. Implement exponential backoff
2. Add request queue
3. Cache more aggressively

### Data Privacy

**What gets sent to AI:**
- Building names (from OSM)
- Building types
- Addresses
- Traffic stats

**NOT sent:**
- User identity
- Project names
- Internal IDs
- Proprietary data

---

## Related Files

- `src/components/SimulationResultsPanel.tsx` - Implementation
- `src/lib/backboard.ts` - API client
- `docs/NEARBY_BUILDINGS_FEATURE.md` - Nearby buildings docs
- `docs/AI_CONTEXT_ANALYSIS_FEATURE.md` - This document

---

## References

- [Backboard.io API Documentation](https://docs.backboard.io/)
- [OpenRouter Gemini Models](https://openrouter.ai/models/google/gemini-2.0-flash-exp)
- [Toronto Construction Guidelines](https://www.toronto.ca/city-government/planning-development/)
- [Google Gemini 2.0 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-v2)

---

**Commit:** (pending)  
**Build Status:** ✓ TypeScript and Vite build successful  
**Bundle Size:** 1.36 MB (382 KB gzipped)
