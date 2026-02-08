/**
 * Spatial context extractor: links a placed building to the real traffic graph.
 *
 * Given a building location + the live graph + current feature metrics, this
 * module returns everything the Backboard RAG needs to give a grounded,
 * data-driven impact analysis instead of generic estimates.
 */

import type { Graph, FeatureMetric, LngLat } from "./types";

const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinDLng * sinDLng;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Minimum distance from a point to a line segment (in metres).
 */
function pointToSegmentMeters(p: LngLat, a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineMeters(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const proj: LngLat = [a[0] + t * dx, a[1] + t * dy];
  return haversineMeters(p, proj);
}

/**
 * Minimum distance from a point to any segment of a polyline.
 */
function pointToPolylineMeters(p: LngLat, coords: LngLat[]): number {
  let min = Infinity;
  for (let i = 1; i < coords.length; i++) {
    min = Math.min(min, pointToSegmentMeters(p, coords[i - 1], coords[i]));
  }
  return min;
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface NearbyRoad {
  featureIndex: number;
  name: string;
  highway: string;
  distanceM: number;
  lengthM: number;
  /** current volume from traffic assignment (vehicles/hr equivalent) */
  volume: number;
  /** current delay factor from BPR function (1.0 = free-flow) */
  delayFactor: number;
  /** capacity (vehicles/hr) */
  capacity: number;
  /** volume / capacity ratio */
  vcRatio: number;
}

export interface NetworkContext {
  /** Nearest node ID in the graph */
  nearestNodeId: string;
  /** Distance to nearest node (metres) */
  nearestNodeDistanceM: number;
  /** Roads within the search radius, sorted by distance */
  nearbyRoads: NearbyRoad[];
  /** Feature indices of roads directly within the building footprint */
  footprintRoads: number[];
  /** Feature indices recommended for closure based on lane-closure count */
  suggestedClosures: number[];
  /** Pre-construction summary */
  baseline: TrafficSummary;
  /** Estimated post-construction summary (with suggested closures applied) */
  estimated: TrafficSummary;
}

export interface TrafficSummary {
  avgDelayFactor: number;
  maxDelayFactor: number;
  totalVolume: number;
  networkCapacityPct: number; // volume / capacity * 100
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Extract spatial + traffic context for a building placement.
 *
 * @param buildingCenter   [lng, lat] of the building centroid
 * @param footprintM       side-length of the square footprint in metres
 * @param graph            current road graph
 * @param featureMetrics   latest assignment results (may be empty on first call)
 * @param roads            original GeoJSON feature collection for names
 * @param searchRadiusM    how far to look for roads (default 400 m)
 * @param laneClosures     how many lanes the user said will be closed
 */
export function extractBuildingContext(
  buildingCenter: LngLat,
  footprintM: number,
  graph: Graph,
  featureMetrics: Map<number, FeatureMetric>,
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, { highway?: string | string[]; name?: string; featureIndex?: number }>,
  searchRadiusM = 400,
  laneClosures = 0,
): NetworkContext {
  const sideM = Math.sqrt(footprintM);
  const halfSideDeg = sideM / 2 / 111000; // crude but sufficient for footprint

  // ── 1. Nearest node ──────────────────────────────────────────────────────
  let nearestNodeId = "";
  let nearestNodeDistanceM = Infinity;
  for (const node of graph.nodes.values()) {
    const d = haversineMeters(buildingCenter, node.coord);
    if (d < nearestNodeDistanceM) {
      nearestNodeDistanceM = d;
      nearestNodeId = node.id;
    }
  }

  // ── 2. Nearby roads ──────────────────────────────────────────────────────
  // We iterate all edges and keep unique featureIndex entries within radius.
  const seen = new Set<number>();
  const nearbyRoads: NearbyRoad[] = [];

  for (const edge of graph.edges) {
    const fi = edge.featureIndex;
    if (fi < 0 || seen.has(fi)) continue;

    const dist = pointToPolylineMeters(buildingCenter, edge.coords);
    if (dist > searchRadiusM) continue;

    seen.add(fi);

    const metric = featureMetrics.get(fi);
    const volume = metric?.volume ?? 0;
    const delayFactor = metric?.delayFactor ?? 1.0;

    // Aggregate capacity across all edges of this feature
    const edgeIds = graph.featureToEdgeIds.get(fi) ?? [];
    let totalCapacity = 0;
    for (const eid of edgeIds) {
      const e = graph.edgesById.get(eid);
      if (e) totalCapacity += e.capacity;
    }
    // Use max capacity of a single edge as representative capacity
    const repEdge = graph.edgesById.get(edgeIds[0]);
    const capacity = repEdge?.capacity ?? 700;

    const vcRatio = capacity > 0 ? volume / capacity : 0;

    // Feature length: sum of forward edges for this feature
    const forwardEdgeIds = edgeIds.filter((_, i) => i % 2 === 0);
    const lengthM = forwardEdgeIds.reduce((sum, eid) => {
      return sum + (graph.edgesById.get(eid)?.lengthM ?? 0);
    }, 0);

    // Road name from GeoJSON
    const feature = roads.features[fi];
    const rawName = feature?.properties?.name;
    const name = typeof rawName === "string" && rawName.length > 0 ? rawName : "(unnamed)";
    const rawHighway = feature?.properties?.highway;
    const highway =
      typeof rawHighway === "string"
        ? rawHighway
        : Array.isArray(rawHighway)
        ? rawHighway[0]
        : edge.highway;

    nearbyRoads.push({
      featureIndex: fi,
      name,
      highway,
      distanceM: Math.round(dist),
      lengthM: Math.round(lengthM),
      volume: Math.round(volume),
      delayFactor: Math.round(delayFactor * 100) / 100,
      capacity,
      vcRatio: Math.round(vcRatio * 100) / 100,
    });
  }

  nearbyRoads.sort((a, b) => a.distanceM - b.distanceM);

  // ── 3. Footprint roads (within building polygon bounding box) ────────────
  const footprintRoads: number[] = [];
  for (const road of nearbyRoads) {
    if (road.distanceM <= halfSideDeg * 111000) {
      footprintRoads.push(road.featureIndex);
    }
  }

  // ── 4. Suggested closures: pick the N closest roads by distance ──────────
  const nClose = Math.max(0, laneClosures);
  const suggestedClosures = nearbyRoads.slice(0, nClose).map((r) => r.featureIndex);

  // ── 5. Baseline summary (current state) ─────────────────────────────────
  const baseline = summarise(nearbyRoads);

  // ── 6. Estimated post-construction (mark suggested closures as infinite delay) ─
  const closedSet = new Set(suggestedClosures);
  const afterRoads = nearbyRoads.map((r) =>
    closedSet.has(r.featureIndex)
      ? { ...r, delayFactor: 3.0, volume: r.capacity * 1.5 }
      : r,
  );
  const estimated = summarise(afterRoads);

  return {
    nearestNodeId,
    nearestNodeDistanceM: Math.round(nearestNodeDistanceM),
    nearbyRoads,
    footprintRoads,
    suggestedClosures,
    baseline,
    estimated,
  };
}

function summarise(roads: NearbyRoad[]): TrafficSummary {
  if (roads.length === 0) {
    return { avgDelayFactor: 1, maxDelayFactor: 1, totalVolume: 0, networkCapacityPct: 0 };
  }
  let sumDelay = 0;
  let maxDelay = 0;
  let totalVol = 0;
  let totalCap = 0;
  for (const r of roads) {
    sumDelay += r.delayFactor;
    maxDelay = Math.max(maxDelay, r.delayFactor);
    totalVol += r.volume;
    totalCap += r.capacity;
  }
  return {
    avgDelayFactor: Math.round((sumDelay / roads.length) * 100) / 100,
    maxDelayFactor: Math.round(maxDelay * 100) / 100,
    totalVolume: Math.round(totalVol),
    networkCapacityPct: totalCap > 0 ? Math.round((totalVol / totalCap) * 100) : 0,
  };
}
