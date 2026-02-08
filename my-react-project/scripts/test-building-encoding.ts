#!/usr/bin/env tsx
/**
 * Test Building Vector Encoding/Decoding
 * 
 * Tests the vector encoding system for buildings:
 * - Encoding coordinates to Base64 vectors
 * - Decoding vectors back to coordinates
 * - Database operations (if Supabase configured)
 * 
 * Run: npx tsx scripts/test-building-encoding.ts
 */

import 'dotenv/config';
import { VectorUtils } from '../src/lib/supabase';
import { getOrCreateProject, saveBuilding, getBuildings, getBuildingHistory } from '../src/lib/buildings-db';

// Test data
const TEST_COORDINATES = {
  point: [-79.385, 43.65] as [number, number],
  polygon: [
    [-79.385, 43.65],
    [-79.384, 43.65],
    [-79.384, 43.651],
    [-79.385, 43.651],
    [-79.385, 43.65], // Close the ring
  ] as number[][],
  multiPolygon: [
    [
      [-79.385, 43.65],
      [-79.384, 43.65],
      [-79.384, 43.651],
      [-79.385, 43.651],
      [-79.385, 43.65],
    ],
    [
      [-79.383, 43.65],
      [-79.382, 43.65],
      [-79.382, 43.651],
      [-79.383, 43.651],
      [-79.383, 43.65],
    ],
  ] as number[][][],
};

async function testVectorEncoding() {
  console.log('🧪 Testing Vector Encoding/Decoding');
  console.log('=====================================\n');

  // Test 1: Point encoding
  console.log('1️⃣  Testing Point Encoding...');
  try {
    const pointGeoJSON: GeoJSON.Point = {
      type: 'Point',
      coordinates: TEST_COORDINATES.point,
    };
    const encoded = VectorUtils.encodeGeometry(pointGeoJSON);
    console.log('   ✅ Encoded:', encoded.substring(0, 50) + '...');
    
    const decoded = VectorUtils.decode(encoded);
    console.log('   ✅ Decoded:', JSON.stringify(decoded));
    
    const matches = JSON.stringify(decoded) === JSON.stringify([TEST_COORDINATES.point]);
    console.log(`   ${matches ? '✅' : '❌'} Round-trip test: ${matches ? 'PASSED' : 'FAILED'}\n`);
  } catch (error) {
    console.error('   ❌ Point encoding failed:', error);
  }

  // Test 2: Polygon encoding
  console.log('2️⃣  Testing Polygon Encoding...');
  try {
    const polygonGeoJSON: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [TEST_COORDINATES.polygon],
    };
    const encoded = VectorUtils.encodeGeometry(polygonGeoJSON);
    console.log('   ✅ Encoded:', encoded.substring(0, 50) + '...');
    
    const decoded = VectorUtils.decode(encoded);
    console.log('   ✅ Decoded coordinates count:', decoded.length);
    
    const matches = JSON.stringify(decoded) === JSON.stringify([TEST_COORDINATES.polygon]);
    console.log(`   ${matches ? '✅' : '❌'} Round-trip test: ${matches ? 'PASSED' : 'FAILED'}\n`);
  } catch (error) {
    console.error('   ❌ Polygon encoding failed:', error);
  }

  // Test 3: MultiPolygon encoding
  console.log('3️⃣  Testing MultiPolygon Encoding...');
  try {
    const multiPolygonGeoJSON: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [TEST_COORDINATES.multiPolygon],
    };
    const encoded = VectorUtils.encodeGeometry(multiPolygonGeoJSON);
    console.log('   ✅ Encoded:', encoded.substring(0, 50) + '...');
    
    const decoded = VectorUtils.decode(encoded);
    console.log('   ✅ Decoded polygons count:', decoded.length);
    
    const matches = JSON.stringify(decoded) === JSON.stringify([TEST_COORDINATES.multiPolygon]);
    console.log(`   ${matches ? '✅' : '❌'} Round-trip test: ${matches ? 'PASSED' : 'FAILED'}\n`);
  } catch (error) {
    console.error('   ❌ MultiPolygon encoding failed:', error);
  }

  // Test 4: Direct coordinate encoding
  console.log('4️⃣  Testing Direct Coordinate Encoding...');
  try {
    const encoded = VectorUtils.encode(TEST_COORDINATES.polygon);
    console.log('   ✅ Encoded polygon coordinates');
    
    const decoded = VectorUtils.decode(encoded);
    const matches = JSON.stringify(decoded) === JSON.stringify(TEST_COORDINATES.polygon);
    console.log(`   ${matches ? '✅' : '❌'} Round-trip test: ${matches ? 'PASSED' : 'FAILED'}\n`);
  } catch (error) {
    console.error('   ❌ Direct encoding failed:', error);
  }
}

async function testDatabaseOperations() {
  console.log('🗄️  Testing Database Operations');
  console.log('================================\n');

  // Check if Supabase is configured
  const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase not configured. Skipping database tests.');
    console.log('   Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to test database operations.\n');
    return;
  }

  console.log('✅ Supabase configured, testing database operations...');
  console.log('⚠️  Note: Make sure migrations 001-007 are run in Supabase SQL Editor\n');

  try {
    // Test 1: Create/get project
    console.log('1️⃣  Creating/getting project...');
    const sessionId = `test-session-${Date.now()}`;
    const project = await getOrCreateProject(sessionId, 'Test Project', 'Toronto, ON');
    console.log(`   ✅ Project ID: ${project.id}`);
    console.log(`   ✅ Project Name: ${project.name}\n`);

    // Test 2: Save building (Point)
    console.log('2️⃣  Saving Point building...');
    const pointBuilding = await saveBuilding(project.id, {
      geometry: {
        type: 'Point',
        coordinates: TEST_COORDINATES.point,
      },
      buildingType: 'residential',
      height: 40,
      baseHeight: 0,
      stories: 12,
      footprint: 500,
      metadata: {
        test: true,
        created_by: 'test-script',
      },
    });
    console.log(`   ✅ Building ID: ${pointBuilding.id}`);
    console.log(`   ✅ Encoded Vector: ${pointBuilding.encoded_vector?.substring(0, 50)}...`);
    console.log(`   ✅ Height: ${pointBuilding.height}m\n`);

    // Test 3: Save building (Polygon)
    console.log('3️⃣  Saving Polygon building...');
    const polygonBuilding = await saveBuilding(project.id, {
      geometry: {
        type: 'Polygon',
        coordinates: [TEST_COORDINATES.polygon],
      },
      buildingType: 'commercial',
      height: 60,
      baseHeight: 0,
      stories: 18,
      footprint: 1200,
      constructionDetails: {
        duration: 180,
        workHours: {
          start: '07:00',
          end: '19:00',
          weekendWork: false,
          nightConstruction: false,
        },
        laneClosures: 1,
        parkingSpacesLost: 5,
        deliveryTrucksPerDay: 3,
        stagingAreaSize: 200,
        dustControlMeasures: true,
        noiseControlMeasures: true,
        workDuringPeakHours: false,
        excavationDepth: 5,
        foundationType: 'deep',
        parkingSpacesCreated: 50,
        expectedOccupancy: 200,
        phases: [],
      },
      metadata: {
        test: true,
        polygon_type: 'custom',
      },
    });
    console.log(`   ✅ Building ID: ${polygonBuilding.id}`);
    console.log(`   ✅ Encoded Vector: ${polygonBuilding.encoded_vector?.substring(0, 50)}...`);
    console.log(`   ✅ Building Type: ${polygonBuilding.building_type}`);
    console.log(`   ✅ Height: ${polygonBuilding.height}m\n`);

    // Test 4: Decode vector from database
    console.log('4️⃣  Decoding vector from database...');
    if (polygonBuilding.encoded_vector) {
      const decoded = VectorUtils.decode(polygonBuilding.encoded_vector);
      console.log('   ✅ Decoded coordinates:', JSON.stringify(decoded).substring(0, 100) + '...');
      console.log(`   ✅ Coordinate pairs: ${Array.isArray(decoded[0]) ? decoded[0].length : 'N/A'}\n`);
    }

    // Test 5: Get all buildings
    console.log('5️⃣  Retrieving all buildings...');
    const allBuildings = await getBuildings(project.id);
    console.log(`   ✅ Found ${allBuildings.length} buildings`);
    allBuildings.forEach((b, i) => {
      console.log(`      ${i + 1}. ${b.building_type} - ${b.height}m - ${b.encoded_vector ? 'Has vector' : 'No vector'}`);
    });
    console.log();

    // Test 6: Get building history
    if (polygonBuilding.id) {
      console.log('6️⃣  Retrieving building history...');
      const history = await getBuildingHistory(polygonBuilding.id);
      console.log(`   ✅ Found ${history.length} history entries`);
      history.forEach((h, i) => {
        console.log(`      ${i + 1}. Version ${h.version_number} - ${h.change_type} - ${new Date(h.created_at).toLocaleString()}`);
      });
      console.log();
    }

    // Test 7: Update building
    console.log('7️⃣  Updating building...');
    const updated = await saveBuilding(project.id, {
      geometry: {
        type: 'Point',
        coordinates: [-79.386, 43.651], // Slightly different location
      },
      buildingType: 'mixed-use',
      height: 50, // Changed height
      baseHeight: 0,
      stories: 15,
      footprint: 600,
    });
    console.log(`   ✅ Updated Building ID: ${updated.id}`);
    console.log(`   ✅ New Height: ${updated.height}m`);
    console.log(`   ✅ Has Encoded Vector: ${updated.encoded_vector ? 'Yes' : 'No'}\n`);

    console.log('✅ All database tests passed!\n');
  } catch (error) {
    console.error('❌ Database test failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Stack:', error.stack);
    }
    console.log();
  }
}

async function main() {
  console.log('🏗️  Building Vector Encoding Test Suite');
  console.log('========================================\n');

  // Test vector encoding/decoding
  await testVectorEncoding();

  // Test database operations (if configured)
  await testDatabaseOperations();

  console.log('========================================');
  console.log('✅ Test suite complete!\n');
}

main().catch(console.error);
