/**
 * Test AI Analysis: Restaurant Competition Scenario
 * 
 * This script simulates placing a restaurant next to existing restaurants
 * to test the AI impact analysis feature.
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

interface NearbyPlace {
  name: string;
  type: string;
  address: string;
}

/**
 * Test scenario: Multiple restaurants in close proximity
 */
async function testRestaurantCompetitionAnalysis() {
  console.log('\n🧪 AI Analysis Test: Restaurant Competition Scenario\n');
  console.log('=' .repeat(60));
  
  // Simulate nearby buildings data - multiple restaurants
  const nearbyBuildings: NearbyPlace[] = [
    { name: 'Taco Bell', type: 'restaurant', address: '234 King Street West, Toronto' },
    { name: "McDonald's", type: 'restaurant', address: '180 Wellington Street, Toronto' },
    { name: 'Subway', type: 'restaurant', address: '200 King Street West, Toronto' },
    { name: 'Tim Hortons', type: 'cafe', address: '195 King Street West, Toronto' },
    { name: 'Pizza Pizza', type: 'restaurant', address: '210 Adelaide Street West, Toronto' },
  ];

  const buildingCount = 1; // User is placing 1 new restaurant
  const closedRoads = 4;
  const trafficCongestion = 'Medium-High';

  console.log('📍 Nearby Buildings:');
  nearbyBuildings.forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.name} (${b.type}) - ${b.address}`);
  });
  console.log('');
  console.log(`🏗️  Construction Details:`);
  console.log(`   - Buildings placed: ${buildingCount}`);
  console.log(`   - Road segments closed: ${closedRoads}`);
  console.log(`   - Traffic congestion: ${trafficCongestion}`);
  console.log('\n' + '='.repeat(60) + '\n');

  // Build the analysis query
  const buildingsList = nearbyBuildings.map((b, i) => 
    `${i + 1}. ${b.name} (${b.type}) - ${b.address}`
  ).join('\n');

  const buildingTypes = nearbyBuildings.map(b => b.type);
  const uniqueTypes = [...new Set(buildingTypes)];

  const query = `Analyze the impact of a NEW CONSTRUCTION PROJECT given these nearby buildings:

NEARBY BUILDINGS (within immediate vicinity, 2-10m radius):
${buildingsList}

BUILDING TYPES PRESENT: ${uniqueTypes.join(', ')}

CONSTRUCTION DETAILS:
- Buildings placed: ${buildingCount}
- Road segments closed: ${closedRoads}
- Traffic congestion: ${trafficCongestion}

Provide a brief, actionable analysis (3-5 sentences max) covering:

1. BUSINESS IMPACT: If multiple similar businesses (restaurants, stores, schools), discuss:
   - Competition effects (2+ restaurants = increased competition)
   - Market saturation concerns
   - Customer base dilution

2. FEASIBILITY CONCERNS: If unusual patterns detected:
   - Multiple schools/institutions (class size, enrollment impact)
   - Conflicting uses (industrial near residential)
   - Over-concentration of single type

3. COMMUNITY IMPACT: Consider:
   - Access disruption to essential services (hospitals, schools)
   - Parking shortage effects on nearby businesses
   - Foot traffic changes during construction

4. OPPORTUNITIES: Positive aspects:
   - Complementary businesses (coffee shop + bookstore)
   - Mixed-use development benefits
   - Urban density improvements

Keep response concise, specific, and Toronto-focused. Use plain language for city planners.`;

  console.log('📤 Sending request to AI analysis endpoint...\n');
  console.log('ℹ️  Note: Backend will automatically create/reuse Backboard thread\n');

  try {
    const startTime = Date.now();
    
    const response = await fetch(`${API_BASE}/api/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        // Let Backboard use its default model
        options: {}
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Error:', response.status, error);
      
      if (response.status === 503) {
        console.error('\n⚠️  BACKBOARD_API_KEY not configured in .env file!');
        console.error('   Please set VITE_BACKBOARD_API_KEY in my-react-project/.env\n');
      }
      
      process.exit(1);
    }

    const result = await response.json();
    const analysis = result.answer || result.content || result.message || '';

    console.log('✅ AI Analysis Complete!\n');
    console.log('='.repeat(60));
    console.log('🤖 AI IMPACT ANALYSIS:\n');
    console.log(analysis);
    console.log('\n' + '='.repeat(60));
    console.log(`\n⏱️  Response time: ${elapsed}ms`);
    console.log(`📊 Analysis length: ${analysis.length} characters\n`);

    // Check for expected keywords
    const keywords = ['restaurant', 'competition', 'saturation', 'business', 'impact'];
    const foundKeywords = keywords.filter(k => 
      analysis.toLowerCase().includes(k)
    );

    console.log('🔍 Keyword Analysis:');
    foundKeywords.forEach(k => console.log(`   ✅ Found: "${k}"`));
    
    const missingKeywords = keywords.filter(k => !foundKeywords.includes(k));
    if (missingKeywords.length > 0) {
      console.log(`   ⚠️  Missing: ${missingKeywords.join(', ')}`);
    }

    if (foundKeywords.length >= 3) {
      console.log('\n✅ TEST PASSED: AI analysis is contextually relevant!\n');
    } else {
      console.log('\n⚠️  TEST WARNING: Analysis may lack relevant context\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if ((error as any).code === 'ECONNREFUSED') {
      console.error('\n⚠️  Server is not running! Start the backend server first:');
      console.error('   npm run server\n');
    }
    
    process.exit(1);
  }
}

// Run the test
testRestaurantCompetitionAnalysis().catch(console.error);
