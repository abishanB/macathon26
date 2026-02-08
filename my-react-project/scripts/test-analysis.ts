/**
 * Test script for building spatial analysis API
 * Run with: npx tsx scripts/test-analysis.ts
 */

const API_BASE = 'http://localhost:3001';

// Test building near CN Tower area
const TEST_BUILDING = {
  coordinates: [
    [-79.3871, 43.6426],
    [-79.3869, 43.6426],
    [-79.3869, 43.6424],
    [-79.3871, 43.6424]
  ],
  radiusMeters: 500
};

async function testRoadStats() {
  console.log('\n📊 Testing Road Network Statistics...');
  console.log('=====================================');
  
  const response = await fetch(`${API_BASE}/api/roads/stats`);
  const data = await response.json();
  
  console.log(`Total roads: ${data.totalRoads}`);
  console.log(`Named roads: ${data.namedRoads}`);
  console.log(`\nRoads by type:`);
  
  const sorted = Object.entries(data.roadsByType)
    .sort(([, a], [, b]) => (b as number) - (a as number));
  
  for (const [type, count] of sorted) {
    console.log(`  ${type}: ${count}`);
  }
}

async function testNearbyRoads() {
  console.log('\n\n🗺️  Testing Nearby Roads Search...');
  console.log('=====================================');
  
  const point = TEST_BUILDING.coordinates[0];
  console.log(`Location: [${point[0]}, ${point[1]}]`);
  console.log(`Radius: ${TEST_BUILDING.radiusMeters}m`);
  
  const response = await fetch(`${API_BASE}/api/roads/nearby`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lng: point[0],
      lat: point[1],
      radiusMeters: TEST_BUILDING.radiusMeters
    })
  });
  
  const data = await response.json();
  
  console.log(`\nFound ${data.nearbyRoads.length} roads within ${data.radiusMeters}m:`);
  
  for (const road of data.nearbyRoads.slice(0, 10)) {
    const name = road.roadName || '(unnamed)';
    const type = road.highway || 'unknown';
    console.log(`  • ${name} (${type}) - ${road.distanceMeters}m away`);
  }
  
  if (data.nearbyRoads.length > 10) {
    console.log(`  ... and ${data.nearbyRoads.length - 10} more`);
  }
}

async function testBuildingAnalysis() {
  console.log('\n\n🏗️  Testing Building Placement Analysis...');
  console.log('=========================================');
  
  console.log(`Building coordinates: ${TEST_BUILDING.coordinates.length} points`);
  console.log(`Analysis radius: ${TEST_BUILDING.radiusMeters}m`);
  
  const response = await fetch(`${API_BASE}/api/buildings/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      buildingId: 'test-building-001',
      coordinates: TEST_BUILDING.coordinates,
      radiusMeters: TEST_BUILDING.radiusMeters
    })
  });
  
  const data = await response.json();
  
  if (!data.success) {
    console.error('❌ Analysis failed:', data.error);
    return;
  }
  
  const { analysis, summary } = data;
  
  console.log(`\n✅ Analysis complete!`);
  console.log(`\nBuilding Info:`);
  console.log(`  Centroid: [${analysis.centroid[0].toFixed(6)}, ${analysis.centroid[1].toFixed(6)}]`);
  console.log(`  Bounds:`);
  console.log(`    Lng: ${analysis.bounds.minLng.toFixed(6)} to ${analysis.bounds.maxLng.toFixed(6)}`);
  console.log(`    Lat: ${analysis.bounds.minLat.toFixed(6)} to ${analysis.bounds.maxLat.toFixed(6)}`);
  
  console.log(`\n📏 Encoding:`);
  console.log(`  Base64: ${analysis.encoding.base64.substring(0, 50)}...`);
  console.log(`  Size: ${analysis.encoding.byteSize} bytes`);
  
  console.log(`\n🚗 Traffic Impact:`);
  console.log(`  Impact Level: ${analysis.affectedArea.estimatedTrafficImpact.toUpperCase()}`);
  console.log(`  Roads within radius: ${analysis.affectedArea.roadsWithinRadius}`);
  console.log(`  Closest road: ${summary.closestRoadDistance}m away`);
  if (summary.closestRoadName) {
    console.log(`  Closest road name: ${summary.closestRoadName}`);
  }
  console.log(`  Major roads affected: ${summary.majorRoadsAffected}`);
  console.log(`  Total road length affected: ${summary.totalRoadLengthAffected}m`);
  
  console.log(`\n📍 Top 5 Nearest Roads:`);
  for (const road of analysis.nearbyRoads.slice(0, 5)) {
    const name = road.roadName || '(unnamed)';
    const type = road.highway || 'unknown';
    const closestPt = `[${road.closestPoint[0].toFixed(6)}, ${road.closestPoint[1].toFixed(6)}]`;
    console.log(`  ${road.distanceMeters}m - ${name} (${type})`);
    console.log(`          Closest point: ${closestPt}`);
    console.log(`          Road length: ${road.roadLength}m`);
  }
}

async function testEncoding() {
  console.log('\n\n🔐 Testing Building Encoding/Decoding...');
  console.log('=========================================');
  
  // First, analyze to get encoding
  const analyzeResponse = await fetch(`${API_BASE}/api/buildings/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: TEST_BUILDING.coordinates,
      radiusMeters: 100
    })
  });
  
  const analyzeData = await analyzeResponse.json();
  const encoded = analyzeData.analysis.encoding.base64;
  
  console.log(`Original coordinates: ${JSON.stringify(TEST_BUILDING.coordinates)}`);
  console.log(`\nEncoded to Base64: ${encoded}`);
  console.log(`Size: ${encoded.length} characters (${analyzeData.analysis.encoding.byteSize} bytes)`);
  
  // Now decode
  const decodeResponse = await fetch(`${API_BASE}/api/buildings/decode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encoded })
  });
  
  const decodeData = await decodeResponse.json();
  
  console.log(`\nDecoded coordinates: ${JSON.stringify(decodeData.coordinates)}`);
  
  const match = JSON.stringify(TEST_BUILDING.coordinates) === JSON.stringify(decodeData.coordinates);
  console.log(`\n${match ? '✅' : '❌'} Encoding/Decoding: ${match ? 'PASSED' : 'FAILED'}`);
}

async function testAddAndAnalyze() {
  console.log('\n\n➕ Testing Add Building + Auto-Analysis...');
  console.log('=========================================');
  
  // Add a building
  const addResponse = await fetch(`${API_BASE}/api/buildings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: TEST_BUILDING.coordinates,
      height: 45,
      properties: {
        name: 'Test Building',
        type: 'residential'
      }
    })
  });
  
  const addData = await addResponse.json();
  console.log(`✅ Building added: ${addData.building.id}`);
  
  // Analyze all buildings
  const analyzeResponse = await fetch(`${API_BASE}/api/buildings/analyze-all?radius=500`);
  const analyzeData = await analyzeResponse.json();
  
  console.log(`\n📊 Analyzed ${analyzeData.count} building(s):`);
  
  for (const summary of analyzeData.summaries) {
    console.log(`\n  Building: ${summary.buildingId}`);
    console.log(`    Centroid: [${summary.centroid[0].toFixed(6)}, ${summary.centroid[1].toFixed(6)}]`);
    console.log(`    Nearest road: ${summary.closestRoadDistance}m - ${summary.closestRoadName || '(unnamed)'}`);
    console.log(`    Impact level: ${summary.impactLevel.toUpperCase()}`);
    console.log(`    Roads affected: ${summary.totalNearbyRoads} (${summary.majorRoadsAffected} major)`);
  }
  
  // Clean up
  await fetch(`${API_BASE}/api/buildings/${addData.building.id}`, {
    method: 'DELETE'
  });
  console.log(`\n🗑️  Cleaned up test building`);
}

async function main() {
  console.log('🧪 Building Spatial Analysis Test Suite');
  console.log('========================================');
  console.log('Make sure the server is running: npm run server\n');
  
  try {
    // Check if server is running
    await fetch(`${API_BASE}/api/roads/stats`);
  } catch (error) {
    console.error('❌ Server is not running! Start it with: npm run server');
    process.exit(1);
  }
  
  try {
    await testRoadStats();
    await testNearbyRoads();
    await testBuildingAnalysis();
    await testEncoding();
    await testAddAndAnalyze();
    
    console.log('\n\n✅ All tests completed successfully!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
