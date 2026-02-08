/**
 * Building Spatial Analysis Module
 * Analyzes building placement in relation to roads, calculates impacts, and provides encoding utilities
 */

import type { Building } from './tile-utils.js';

export interface RoadFeature {
  type: 'Feature';
  id?: string | number;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  properties: {
    highway?: string | string[];
    name?: string;
    featureIndex?: number;
    volume?: number;
    delayFactor?: number;
    closed?: boolean;
    [key: string]: any;
  };
}

export interface RoadNetwork {
  type: 'FeatureCollection';
  features: RoadFeature[];
}

export interface BuildingAnalysis {
  buildingId: string;
  coordinates: number[][];
  centroid: [number, number];
  bounds: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
  nearbyRoads: Array<{
    roadId: string | number;
    roadName?: string;
    highway?: string;
    distanceMeters: number;
    closestPoint: [number, number];
    roadLength: number;
  }>;
  affectedArea: {
    radiusMeters: number;
    roadsWithinRadius: number;
    estimatedTrafficImpact: 'low' | 'medium' | 'high' | 'severe';
  };
  encoding: {
    base64: string;
    byteSize: number;
  };
}

/**
 * Calculate haversine distance between two points in meters
 */
function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate the centroid of a polygon
 */
function calculateCentroid(coordinates: number[][]): [number, number] {
  let sumLng = 0;
  let sumLat = 0;
  
  for (const [lng, lat] of coordinates) {
    sumLng += lng;
    sumLat += lat;
  }
  
  return [sumLng / coordinates.length, sumLat / coordinates.length];
}

/**
 * Calculate bounding box of a building
 */
function calculateBounds(coordinates: number[][]) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  
  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Calculate distance from a point to a line segment
 */
function pointToLineSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { distance: number; closestPoint: [number, number] } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  
  if (dx === 0 && dy === 0) {
    // Line segment is a point
    const dist = haversineDistance(px, py, x1, y1);
    return { distance: dist, closestPoint: [x1, y1] };
  }
  
  // Calculate parameter t that represents the closest point on the line segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const dist = haversineDistance(px, py, closestX, closestY);
  
  return { distance: dist, closestPoint: [closestX, closestY] };
}

/**
 * Calculate distance from a building centroid to a road (LineString)
 */
function distanceBuildingToRoad(
  centroid: [number, number],
  roadCoordinates: number[][]
): { distance: number; closestPoint: [number, number] } {
  let minDistance = Infinity;
  let closestPoint: [number, number] = roadCoordinates[0] as [number, number];
  
  for (let i = 1; i < roadCoordinates.length; i++) {
    const [x1, y1] = roadCoordinates[i - 1];
    const [x2, y2] = roadCoordinates[i];
    
    const result = pointToLineSegmentDistance(
      centroid[0],
      centroid[1],
      x1,
      y1,
      x2,
      y2
    );
    
    if (result.distance < minDistance) {
      minDistance = result.distance;
      closestPoint = result.closestPoint;
    }
  }
  
  return { distance: minDistance, closestPoint };
}

/**
 * Calculate the length of a road (LineString) in meters
 */
function calculateRoadLength(coordinates: number[][]): number {
  let totalLength = 0;
  
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    totalLength += haversineDistance(lng1, lat1, lng2, lat2);
  }
  
  return totalLength;
}

/**
 * Encode building coordinates to Base64
 */
function encodeBuilding(coordinates: number[][]): { base64: string; byteSize: number } {
  const json = JSON.stringify(coordinates);
  const base64 = Buffer.from(json, 'utf-8').toString('base64');
  return {
    base64,
    byteSize: Buffer.byteLength(base64, 'base64')
  };
}

/**
 * Decode building coordinates from Base64
 */
export function decodeBuilding(base64: string): number[][] {
  const json = Buffer.from(base64, 'base64').toString('utf-8');
  return JSON.parse(json);
}

/**
 * Estimate traffic impact based on proximity and number of affected roads
 */
function estimateTrafficImpact(
  nearbyRoadsCount: number,
  closestRoadDistance: number
): 'low' | 'medium' | 'high' | 'severe' {
  if (closestRoadDistance < 50 && nearbyRoadsCount > 10) {
    return 'severe';
  } else if (closestRoadDistance < 100 && nearbyRoadsCount > 5) {
    return 'high';
  } else if (closestRoadDistance < 200 && nearbyRoadsCount > 3) {
    return 'medium';
  }
  return 'low';
}

/**
 * Main analysis function: Analyze a building's relationship to the road network
 */
export function analyzeBuildingPlacement(
  building: Building,
  roadNetwork: RoadNetwork,
  radiusMeters: number = 500
): BuildingAnalysis {
  // Calculate building properties
  const centroid = calculateCentroid(building.coordinates);
  const bounds = calculateBounds(building.coordinates);
  const encoding = encodeBuilding(building.coordinates);
  
  // Find nearby roads and calculate distances
  const nearbyRoads: BuildingAnalysis['nearbyRoads'] = [];
  const roadsWithinRadius: RoadFeature[] = [];
  
  for (const road of roadNetwork.features) {
    if (road.geometry.type !== 'LineString') continue;
    
    const { distance, closestPoint } = distanceBuildingToRoad(
      centroid,
      road.geometry.coordinates
    );
    
    if (distance <= radiusMeters) {
      roadsWithinRadius.push(road);
      
      // Get highway type
      const highway = road.properties.highway;
      const highwayStr = Array.isArray(highway) ? highway[0] : highway;
      
      nearbyRoads.push({
        roadId: road.id || `road-${nearbyRoads.length}`,
        roadName: road.properties.name,
        highway: highwayStr,
        distanceMeters: Math.round(distance),
        closestPoint,
        roadLength: Math.round(calculateRoadLength(road.geometry.coordinates))
      });
    }
  }
  
  // Sort by distance
  nearbyRoads.sort((a, b) => a.distanceMeters - b.distanceMeters);
  
  // Calculate traffic impact
  const closestRoadDistance = nearbyRoads.length > 0 ? nearbyRoads[0].distanceMeters : Infinity;
  const estimatedTrafficImpact = estimateTrafficImpact(nearbyRoads.length, closestRoadDistance);
  
  return {
    buildingId: building.id,
    coordinates: building.coordinates,
    centroid,
    bounds,
    nearbyRoads,
    affectedArea: {
      radiusMeters,
      roadsWithinRadius: roadsWithinRadius.length,
      estimatedTrafficImpact
    },
    encoding
  };
}

/**
 * Batch analysis: Analyze multiple buildings at once
 */
export function analyzeBuildingsBatch(
  buildings: Building[],
  roadNetwork: RoadNetwork,
  radiusMeters: number = 500
): BuildingAnalysis[] {
  return buildings.map(building => 
    analyzeBuildingPlacement(building, roadNetwork, radiusMeters)
  );
}

/**
 * Get summary statistics for a building analysis
 */
export function getAnalysisSummary(analysis: BuildingAnalysis) {
  const majorRoads = analysis.nearbyRoads.filter(road => 
    road.highway && ['motorway', 'trunk', 'primary', 'secondary'].includes(road.highway)
  );
  
  const totalRoadLength = analysis.nearbyRoads.reduce((sum, road) => sum + road.roadLength, 0);
  
  return {
    buildingId: analysis.buildingId,
    centroid: analysis.centroid,
    closestRoadDistance: analysis.nearbyRoads.length > 0 
      ? analysis.nearbyRoads[0].distanceMeters 
      : null,
    closestRoadName: analysis.nearbyRoads.length > 0 
      ? analysis.nearbyRoads[0].roadName 
      : null,
    totalNearbyRoads: analysis.nearbyRoads.length,
    majorRoadsAffected: majorRoads.length,
    totalRoadLengthAffected: Math.round(totalRoadLength),
    impactLevel: analysis.affectedArea.estimatedTrafficImpact,
    encodingSize: analysis.encoding.byteSize
  };
}
