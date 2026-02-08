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

function buildUndirectedNeighborMap(graph: Graph): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  for (const nodeId of graph.nodes.keys()) {
    neighbors.set(nodeId, new Set<string>());
  }
  for (const edge of graph.edges) {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  return neighbors;
}

function computeComponents(graph: Graph): string[][] {
  const neighbors = buildUndirectedNeighborMap(graph);
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) {
      continue;
    }

    const stack = [nodeId];
    const component: string[] = [];
    visited.add(nodeId);

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      component.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (visited.has(next)) {
          continue;
        }
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  components.sort((a, b) => b.length - a.length);
  return components;
}

function findNearestNodePair(
  graph: Graph,
  fromNodes: string[],
  toNodes: Set<string>,
): { fromNodeId: string; toNodeId: string; distanceM: number } | null {
  let bestFrom = "";
  let bestTo = "";
  let bestDistanceM = Number.POSITIVE_INFINITY;

  for (const fromNodeId of fromNodes) {
    const fromNode = graph.nodes.get(fromNodeId);
    if (!fromNode) {
      continue;
    }
    for (const toNodeId of toNodes) {
      const toNode = graph.nodes.get(toNodeId);
      if (!toNode) {
        continue;
      }
      const distanceM = haversineDistanceMeters(fromNode.coord, toNode.coord);
      if (distanceM < bestDistanceM) {
        bestDistanceM = distanceM;
        bestFrom = fromNodeId;
        bestTo = toNodeId;
      }
    }
  }

  if (!bestFrom || !bestTo || !Number.isFinite(bestDistanceM)) {
    return null;
  }

  return {
    fromNodeId: bestFrom,
    toNodeId: bestTo,
    distanceM: bestDistanceM,
  };
}

function connectAllComponents(graph: Graph): void {
  const components = computeComponents(graph);
  if (components.length <= 1) {
    return;
  }

  const connectorHighway = "connector";
  const connectorSpeedMps = speedMpsForHighway(connectorHighway);
  const connectorCapacity = capacityForHighway(connectorHighway);

  const primaryComponentNodes = new Set<string>(components[0]);
  let connectorIndex = 0;

  for (let idx = 1; idx < components.length; idx += 1) {
    const componentNodes = components[idx];
    const nearestPair = findNearestNodePair(graph, componentNodes, primaryComponentNodes);
    if (!nearestPair) {
      continue;
    }

    const fromNode = graph.nodes.get(nearestPair.fromNodeId);
    const toNode = graph.nodes.get(nearestPair.toNodeId);
    if (!fromNode || !toNode) {
      continue;
    }

    const lengthM = nearestPair.distanceM;
    if (!Number.isFinite(lengthM) || lengthM <= 0) {
      continue;
    }

    const t0 = lengthM / Math.max(1, connectorSpeedMps);
    const forwardId = `connector_${connectorIndex}_a`;
    const backwardId = `connector_${connectorIndex}_b`;
    connectorIndex += 1;

    registerEdge(
      {
        id: forwardId,
        from: nearestPair.fromNodeId,
        to: nearestPair.toNodeId,
        coords: [fromNode.coord, toNode.coord],
        lengthM,
        highway: connectorHighway,
        speedMps: connectorSpeedMps,
        t0,
        capacity: connectorCapacity,
        featureIndex: -1,
      },
      graph,
    );

    registerEdge(
      {
        id: backwardId,
        from: nearestPair.toNodeId,
        to: nearestPair.fromNodeId,
        coords: [toNode.coord, fromNode.coord],
        lengthM,
        highway: connectorHighway,
        speedMps: connectorSpeedMps,
        t0,
        capacity: connectorCapacity,
        featureIndex: -1,
      },
      graph,
    );

    for (const nodeId of componentNodes) {
      primaryComponentNodes.add(nodeId);
    }
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

    const highway = normalizeHighwayValue(feature.properties?.highway);
    const speedMps = speedMpsForHighway(highway);
    const capacity = capacityForHighway(highway);
    const featureEdgeIds: string[] = [];

    for (let idx = 1; idx < coords.length; idx += 1) {
      const start = coords[idx - 1];
      const end = coords[idx];
      const fromNode = ensureNode(start, nodes, adj);
      const toNode = ensureNode(end, nodes, adj);
      if (fromNode === toNode) {
        continue;
      }

      const segmentCoords: LngLat[] = [start, end];
      const lengthM = lineLengthMeters(segmentCoords);
      if (!Number.isFinite(lengthM) || lengthM <= 1) {
        continue;
      }

      const t0 = lengthM / Math.max(1, speedMps);
      const forwardEdgeId = `${featureIndex}_${idx}_a`;
      const backwardEdgeId = `${featureIndex}_${idx}_b`;

      registerEdge(
        {
          id: forwardEdgeId,
          from: fromNode,
          to: toNode,
          coords: segmentCoords,
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
          coords: [end, start],
          lengthM,
          highway,
          speedMps,
          t0,
          capacity,
          featureIndex,
        },
        { edges, edgesById, adj },
      );

      featureEdgeIds.push(forwardEdgeId, backwardEdgeId);
    }

    if (featureEdgeIds.length > 0) {
      featureToEdgeIds.set(featureIndex, featureEdgeIds);
    }
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

  const graph: Graph = {
    nodes,
    adj,
    edgesById,
    edges,
    featureToEdgeIds,
    bbox: hasValidBounds ? [minLng, minLat, maxLng, maxLat] : fallbackBbox,
  };

  connectAllComponents(graph);
  return graph;
}
