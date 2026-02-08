import { capacityForHighway, speedMpsForHighway } from "./model";
import type { Edge, Graph, GraphNode, LngLat, RoadFeatureProperties } from "./types";

const SNAP_DECIMALS = 4;
const EARTH_RADIUS_M = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_M * c;
}

function lineLengthMeters(coords: LngLat[]): number {
  let total = 0;
  for (let idx = 1; idx < coords.length; idx += 1) {
    total += haversineDistanceMeters(coords[idx - 1], coords[idx]);
  }
  return total;
}

function snapNodeKey(coord: LngLat): string {
  const lng = coord[0].toFixed(SNAP_DECIMALS);
  const lat = coord[1].toFixed(SNAP_DECIMALS);
  return `${lng}:${lat}`;
}

function toLngLat(coords: number[][]): LngLat[] {
  return coords
    .filter((coord): coord is [number, number] => coord.length >= 2)
    .map((coord) => [coord[0], coord[1]]);
}

function normalizeHighwayValue(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0];
  }
  return "road";
}

function ensureNode(
  coord: LngLat,
  nodes: Map<string, GraphNode>,
  adjacency: Map<string, Edge[]>,
): string {
  const nodeId = snapNodeKey(coord);
  if (!nodes.has(nodeId)) {
    nodes.set(nodeId, { id: nodeId, coord });
    adjacency.set(nodeId, []);
  }
  return nodeId;
}

function registerEdge(edge: Edge, graph: Pick<Graph, "edges" | "edgesById" | "adj">): void {
  graph.edges.push(edge);
  graph.edgesById.set(edge.id, edge);
  const bucket = graph.adj.get(edge.from);
  if (bucket) {
    bucket.push(edge);
  } else {
    graph.adj.set(edge.from, [edge]);
  }
}

export function buildGraphFromGeoJSON(
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
): Graph {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, Edge[]>();
  const edgesById = new Map<string, Edge>();
  const edges: Edge[] = [];
  const featureToEdgeIds = new Map<number, string[]>();

  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  roads.features.forEach((feature, featureIndex) => {
    if (!feature.geometry || feature.geometry.type !== "LineString") {
      return;
    }

    const coords = toLngLat(feature.geometry.coordinates);
    if (coords.length < 2) {
      return;
    }

    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }

    const start = coords[0];
    const end = coords[coords.length - 1];
    const fromNode = ensureNode(start, nodes, adj);
    const toNode = ensureNode(end, nodes, adj);
    if (fromNode === toNode) {
      return;
    }

    const highway = normalizeHighwayValue(feature.properties?.highway);
    const speedMps = speedMpsForHighway(highway);
    const lengthM = lineLengthMeters(coords);
    if (!Number.isFinite(lengthM) || lengthM <= 1) {
      return;
    }

    const t0 = lengthM / Math.max(1, speedMps);
    const capacity = capacityForHighway(highway);
    const forwardEdgeId = `${featureIndex}_a`;
    const backwardEdgeId = `${featureIndex}_b`;

    registerEdge(
      {
        id: forwardEdgeId,
        from: fromNode,
        to: toNode,
        coords,
        lengthM,
        highway,
        speedMps,
        t0,
        capacity,
        featureIndex,
      },
      { edges, edgesById, adj },
    );

    registerEdge(
      {
        id: backwardEdgeId,
        from: toNode,
        to: fromNode,
        coords: [...coords].reverse() as LngLat[],
        lengthM,
        highway,
        speedMps,
        t0,
        capacity,
        featureIndex,
      },
      { edges, edgesById, adj },
    );

    featureToEdgeIds.set(featureIndex, [forwardEdgeId, backwardEdgeId]);
  });

  const fallbackBbox: [number, number, number, number] = [
    -79.44,
    43.62,
    -79.35,
    43.69,
  ];

  const hasValidBounds =
    Number.isFinite(minLng) &&
    Number.isFinite(minLat) &&
    Number.isFinite(maxLng) &&
    Number.isFinite(maxLat);

  return {
    nodes,
    adj,
    edgesById,
    edges,
    featureToEdgeIds,
    bbox: hasValidBounds ? [minLng, minLat, maxLng, maxLat] : fallbackBbox,
  };
}
