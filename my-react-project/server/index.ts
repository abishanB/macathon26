import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { addCustomBuilding, getCustomBuildingsAsGeoJSON, clearCustomBuildings, deleteCustomBuilding, getCustomBuildings } from './tile-utils.js';
import { analyzeBuildingPlacement, analyzeBuildingsBatch, getAnalysisSummary, decodeBuilding } from './analysis.js';
import type { RoadNetwork } from './analysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Load road network data
let roadNetwork: RoadNetwork | null = null;
try {
  const roadPath = join(__dirname, '../public/data/roads_downtown.geojson');
  const roadData = readFileSync(roadPath, 'utf-8');
  roadNetwork = JSON.parse(roadData);
  console.log(`✅ Loaded road network: ${roadNetwork?.features.length} roads`);
} catch (error) {
  console.error('⚠️  Failed to load road network:', error);
}

// Mapbox access token (from environment)
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_ACCESS_TOKEN || '';

/**
 * Proxy tiles from Mapbox
 */
app.get('/tiles/:z/:x/:y.mvt', async (req, res) => {
  const { z, x, y } = req.params;
  
  try {
    // Fetch tile from Mapbox
    const mapboxUrl = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.mvt?access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(mapboxUrl);
    
    if (!response.ok) {
      return res.status(response.status).send('Tile not found');
    }

    const buffer = await response.buffer();
    
    // For now, just proxy the original tile
    // Custom buildings will be handled as a separate GeoJSON layer
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Content-Encoding', 'gzip');
    res.send(buffer);
  } catch (error) {
    console.error('Error fetching tile:', error);
    res.status(500).send('Error fetching tile');
  }
});

/**
 * Get custom buildings as GeoJSON
 */
app.get('/api/buildings', (req, res) => {
  const geojson = getCustomBuildingsAsGeoJSON();
  res.json(geojson);
});

/**
 * Add a custom building
 */
app.post('/api/buildings', (req, res) => {
  const { coordinates, height, properties } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({ error: 'Invalid coordinates. Need at least 3 points [lng, lat]' });
  }

  const building = {
    id: `custom-${Date.now()}`,
    coordinates,
    height: height || 20,
    properties: properties || {}
  };

  addCustomBuilding(building);
  
  res.json({ 
    success: true, 
    building,
    geojson: getCustomBuildingsAsGeoJSON()
  });
});

/**
 * Get list of all buildings (with metadata)
 */
app.get('/api/buildings/list', (req, res) => {
  const buildings = getCustomBuildings();
  res.json(buildings);
});

/**
 * Delete a specific building by ID
 */
app.delete('/api/buildings/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteCustomBuilding(id);
  
  if (deleted) {
    res.json({ success: true, message: `Building ${id} deleted` });
  } else {
    res.status(404).json({ error: `Building ${id} not found` });
  }
});

/**
 * Clear all custom buildings
 */
app.delete('/api/buildings', (req, res) => {
  clearCustomBuildings();
  res.json({ success: true });
});

/**
 * Analyze a specific building's placement relative to roads
 */
app.post('/api/buildings/analyze', (req, res) => {
  if (!roadNetwork) {
    return res.status(503).json({ error: 'Road network not loaded' });
  }

  const { buildingId, coordinates, radiusMeters } = req.body;

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const building = {
      id: buildingId || `temp-${Date.now()}`,
      coordinates,
      height: 20
    };

    const radius = radiusMeters || 500;
    const analysis = analyzeBuildingPlacement(building, roadNetwork, radius);
    const summary = getAnalysisSummary(analysis);

    res.json({
      success: true,
      analysis,
      summary
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed', message: (error as Error).message });
  }
});

/**
 * Analyze all custom buildings
 */
app.get('/api/buildings/analyze-all', (req, res) => {
  if (!roadNetwork) {
    return res.status(503).json({ error: 'Road network not loaded' });
  }

  const radiusMeters = parseInt(req.query.radius as string) || 500;
  
  try {
    const buildings = getCustomBuildings();
    const analyses = analyzeBuildingsBatch(buildings, roadNetwork, radiusMeters);
    const summaries = analyses.map(getAnalysisSummary);

    res.json({
      success: true,
      count: analyses.length,
      analyses,
      summaries
    });
  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({ error: 'Batch analysis failed', message: (error as Error).message });
  }
});

/**
 * Decode a building from Base64 encoding
 */
app.post('/api/buildings/decode', (req, res) => {
  const { encoded } = req.body;

  if (!encoded || typeof encoded !== 'string') {
    return res.status(400).json({ error: 'Invalid encoded data' });
  }

  try {
    const coordinates = decodeBuilding(encoded);
    res.json({
      success: true,
      coordinates
    });
  } catch (error) {
    console.error('Decode error:', error);
    res.status(400).json({ error: 'Failed to decode', message: (error as Error).message });
  }
});

/**
 * Get road network statistics
 */
app.get('/api/roads/stats', (req, res) => {
  if (!roadNetwork) {
    return res.status(503).json({ error: 'Road network not loaded' });
  }

  const stats = {
    totalRoads: roadNetwork.features.length,
    roadsByType: {} as Record<string, number>,
    namedRoads: 0,
    totalLength: 0
  };

  for (const road of roadNetwork.features) {
    // Count by highway type
    const highway = road.properties.highway;
    const highwayStr = Array.isArray(highway) ? highway[0] : highway || 'unknown';
    stats.roadsByType[highwayStr] = (stats.roadsByType[highwayStr] || 0) + 1;

    // Count named roads
    if (road.properties.name) {
      stats.namedRoads++;
    }
  }

  res.json(stats);
});

/**
 * Find roads near a point
 */
app.post('/api/roads/nearby', (req, res) => {
  if (!roadNetwork) {
    return res.status(503).json({ error: 'Road network not loaded' });
  }

  const { lng, lat, radiusMeters } = req.body;

  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const radius = radiusMeters || 500;
  
  try {
    // Create a temporary building at the point
    const tempBuilding = {
      id: 'temp',
      coordinates: [[lng, lat]]
    };

    const analysis = analyzeBuildingPlacement(tempBuilding, roadNetwork, radius);

    res.json({
      success: true,
      location: [lng, lat],
      radiusMeters: radius,
      nearbyRoads: analysis.nearbyRoads
    });
  } catch (error) {
    console.error('Nearby roads error:', error);
    res.status(500).json({ error: 'Failed to find nearby roads', message: (error as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Building Analysis Server running on http://localhost:${PORT}`);
  console.log(`\n📡 Available endpoints:`);
  console.log(`   - GET  /api/buildings - Get all buildings as GeoJSON`);
  console.log(`   - POST /api/buildings - Add a new building`);
  console.log(`   - GET  /api/buildings/list - Get buildings with metadata`);
  console.log(`   - DELETE /api/buildings/:id - Delete a specific building`);
  console.log(`   - DELETE /api/buildings - Clear all buildings`);
  console.log(`\n🔬 Analysis endpoints:`);
  console.log(`   - POST /api/buildings/analyze - Analyze a building's placement`);
  console.log(`   - GET  /api/buildings/analyze-all?radius=500 - Analyze all buildings`);
  console.log(`   - POST /api/buildings/decode - Decode Base64 building data`);
  console.log(`   - GET  /api/roads/stats - Get road network statistics`);
  console.log(`   - POST /api/roads/nearby - Find roads near a point`);
  console.log(`\n🗺️  Map tiles:`);
  console.log(`   - GET  /tiles/{z}/{x}/{y}.mvt - Mapbox vector tiles proxy\n`);
});
