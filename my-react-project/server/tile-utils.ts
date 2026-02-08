import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';

export interface Building {
  id: string;
  coordinates: number[][]; // Array of [lng, lat] pairs forming a polygon
  height?: number;
  properties?: Record<string, any>;
}

// Store custom buildings in memory (in production, use a database)
const customBuildings: Building[] = [];

export function addCustomBuilding(building: Building) {
  customBuildings.push(building);
  console.log(`Added custom building ${building.id}:`, building);
}

export function getCustomBuildings(): Building[] {
  return customBuildings;
}

export function clearCustomBuildings() {
  customBuildings.length = 0;
}

export function deleteCustomBuilding(id: string): boolean {
  const index = customBuildings.findIndex(b => b.id === id);
  if (index !== -1) {
    customBuildings.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Convert lat/lng coordinates to tile pixel coordinates
 */
export function latLngToTileCoords(lng: number, lat: number, z: number, x: number, y: number, extent: number = 4096): { x: number, y: number } {
  // Convert lat/lng to tile numbers (fractional)
  const n = Math.pow(2, z);
  const tileX = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const tileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  // Get position within the tile
  const localX = (tileX - x) * extent;
  const localY = (tileY - y) * extent;

  return { x: Math.round(localX), y: Math.round(localY) };
}

/**
 * Check if a building intersects with a tile
 */
export function buildingIntersectsTile(building: Building, z: number, x: number, y: number): boolean {
  // Simple check: see if any coordinate is within the tile bounds
  for (const coord of building.coordinates) {
    const [lng, lat] = coord;
    const n = Math.pow(2, z);
    const tileX = Math.floor(((lng + 180) / 360) * n);
    const tileY = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    
    if (tileX === x && tileY === y) {
      return true;
    }
  }
  return false;
}

/**
 * Add custom buildings to a tile buffer
 */
export function addBuildingsToTile(originalBuffer: Buffer | null, z: number, x: number, y: number): Buffer {
  const extent = 4096;
  
  // Get buildings that intersect this tile
  const relevantBuildings = customBuildings.filter(b => buildingIntersectsTile(b, z, x, y));
  
  if (relevantBuildings.length === 0 && originalBuffer) {
    // No custom buildings for this tile, return original
    return originalBuffer;
  }

  // Parse existing tile if available
  let layers: any = {};
  if (originalBuffer && originalBuffer.length > 0) {
    try {
      const tile = new VectorTile(new Protobuf(originalBuffer));
      // Copy existing layers
      for (const layerName in tile.layers) {
        layers[layerName] = tile.layers[layerName];
      }
    } catch (e) {
      console.error('Error parsing tile:', e);
    }
  }

  // Create or get building layer
  const buildingFeatures: any[] = [];
  
  // Add existing building features if layer exists
  if (layers.building) {
    for (let i = 0; i < layers.building.length; i++) {
      const feature = layers.building.feature(i);
      buildingFeatures.push({
        type: feature.type,
        geometry: feature.loadGeometry(),
        properties: feature.properties
      });
    }
  }

  // Add custom buildings
  for (const building of relevantBuildings) {
    const coords = building.coordinates.map(([lng, lat]) => 
      latLngToTileCoords(lng, lat, z, x, y, extent)
    );

    // Close the polygon if not already closed
    if (coords.length > 0 && (coords[0].x !== coords[coords.length - 1].x || coords[0].y !== coords[coords.length - 1].y)) {
      coords.push(coords[0]);
    }

    buildingFeatures.push({
      type: 3, // Polygon
      geometry: [coords],
      properties: {
        id: building.id,
        height: building.height || 20,
        extrude: 'true',
        ...building.properties
      }
    });
  }

  // Encode the modified tile
  // Note: This is a simplified approach. For production, use proper MVT encoding
  // For now, we'll create a simple representation that MapLibre can understand
  
  // Since proper MVT encoding is complex, we'll return original tile for now
  // and handle custom buildings as a separate GeoJSON layer in the frontend
  return originalBuffer || Buffer.from([]);
}

/**
 * Convert custom buildings to GeoJSON for a simpler approach
 */
export function getCustomBuildingsAsGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: customBuildings.map(building => {
      // Ensure polygon is closed (first coord = last coord)
      const coords = [...building.coordinates];
      if (coords.length > 0) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push([first[0], first[1]]);
        }
      }
      
      return {
        type: 'Feature',
        id: building.id,
        geometry: {
          type: 'Polygon',
          coordinates: [coords]  // GeoJSON Polygon needs array of rings
        },
        properties: {
          height: building.height || 20,
          extrude: 'true',
          ...building.properties
        }
      };
    })
  };
}
