import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { addCustomBuilding, getCustomBuildingsAsGeoJSON, clearCustomBuildings, deleteCustomBuilding, getCustomBuildings } from './tile-utils.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Tile server running on http://localhost:${PORT}`);
  console.log(`- Tiles: http://localhost:${PORT}/tiles/{z}/{x}/{y}.mvt`);
  console.log(`- Buildings API: http://localhost:${PORT}/api/buildings`);
});
