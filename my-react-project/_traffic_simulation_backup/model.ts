import { dijkstraPath } from "./dijkstra";
import type { AssignmentResult, Graph, ODPair } from "./types";

const KMH_TO_MPS = 1000 / 3600;

const SPEED_BY_HIGHWAY_KMH: Record<string, number> = {
  motorway: 70,
  trunk: 60,
  primary: 50,
  secondary: 45,
  tertiary: 40,
  residential: 30,
  service: 20,
  road: 35,
};

const CAPACITY_BY_HIGHWAY: Record<string, number> = {
  motorway: 2200,
  trunk: 1800,
  primary: 1500,
  secondary: 1200,
  tertiary: 900,
  residential: 500,
  service: 300,
  road: 700,
};

const CBD_DESTINATIONS: Array<{ coord: [number, number]; weight: number }> = [
  { coord: [-79.3794, 43.6452], weight: 6 },
  { coord: [-79.3815, 43.6482], weight: 5 },
  { coord: [-79.3871, 43.6487], weight: 5 },
  { coord: [-79.3929, 43.6521], weight: 4 },
  { coord: [-79.3951, 43.6537], weight: 4 },
  { coord: [-79.4012, 43.6476], weight: 3 },
  { coord: [-79.3728, 43.6415], weight: 4 },
  { coord: [-79.3678, 43.6462], weight: 3 },
  { coord: [-79.3628, 43.6518], weight: 2 },
  { coord: [-79.3878, 43.6585], weight: 2 },
];

function normalizeHighway(highway: string): string {
  return highway.trim().toLowerCase();
}

export function speedMpsForHighway(highway: string): number {
  const normalized = normalizeHighway(highway);
  return (SPEED_BY_HIGHWAY_KMH[normalized] ?? SPEED_BY_HIGHWAY_KMH.road) * KMH_TO_MPS;
}

export function capacityForHighway(highway: string): number {
  const normalized = normalizeHighway(highway);
  return CAPACITY_BY_HIGHWAY[normalized] ?? CAPACITY_BY_HIGHWAY.road;
}

function nearestNodeId(point: [number, number], graph: Graph): string | null {
  let bestNode: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of graph.nodes.values()) {
    const dx = node.coord[0] - point[0];
    const dy = node.coord[1] - point[1];
    const distance2 = dx * dx + dy * dy;
    if (distance2 < bestDistance) {
      bestDistance = distance2;
      bestNode = node.id;
    }
  }
  return bestNode;
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedChoice(items: Array<{ nodeId: string; weight: number }>): string {
  const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0) {
    return items[0].nodeId;
  }
  let remaining = Math.random() * totalWeight;
  for (const item of items) {
    remaining -= item.weight;
    if (remaining <= 0) {
      return item.nodeId;
    }
  }
  return items[items.length - 1].nodeId;
}

function weightedChoiceFromUnit(
  items: Array<{ nodeId: string; weight: number }>,
  unitValue: number,
): string {
  const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0) {
    return items[0].nodeId;
  }
  let remaining = Math.max(0, Math.min(0.999999, unitValue)) * totalWeight;
  for (const item of items) {
    remaining -= item.weight;
    if (remaining <= 0) {
      return item.nodeId;
    }
  }
  return items[items.length - 1].nodeId;
}

function deterministicUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function buildDestinationCandidates(graph: Graph): Array<{ nodeId: string; weight: number }> {
  const candidates = CBD_DESTINATIONS.map((entry) => {
    const nodeId = nearestNodeId(entry.coord, graph);
    return nodeId ? { nodeId, weight: entry.weight } : null;
  }).filter((entry): entry is { nodeId: string; weight: number } => Boolean(entry));

  const deduped = new Map<string, number>();
  for (const candidate of candidates) {
    deduped.set(candidate.nodeId, (deduped.get(candidate.nodeId) ?? 0) + candidate.weight);
  }

  return Array.from(deduped.entries()).map(([nodeId, weight]) => ({ nodeId, weight }));
}

export function generateOD(graph: Graph, tripCount: number): ODPair[] {
  const nodes = Array.from(graph.nodes.values());
  if (nodes.length === 0 || tripCount <= 0) {
    return [];
  }

  const [minLng, minLat, maxLng, maxLat] = graph.bbox;
  const lngMargin = (maxLng - minLng) * 0.14;
  const latMargin = (maxLat - minLat) * 0.14;

  const outerRing = nodes.filter((node) => {
    const [lng, lat] = node.coord;
    return (
      lng <= minLng + lngMargin ||
      lng >= maxLng - lngMargin ||
      lat <= minLat + latMargin ||
      lat >= maxLat - latMargin
    );
  });
  const originCandidates = outerRing.length > 0 ? outerRing : nodes;

  const destinationCandidates = buildDestinationCandidates(graph);

  if (destinationCandidates.length === 0) {
    return [];
  }

  const odPairs: ODPair[] = [];
  let attempts = 0;
  const maxAttempts = tripCount * 5;

  while (odPairs.length < tripCount && attempts < maxAttempts) {
    attempts += 1;
    const origin = randomChoice(originCandidates).id;
    const dest = weightedChoice(destinationCandidates);
    if (origin === dest) {
      continue;
    }
    odPairs.push({ originNode: origin, destNode: dest });
  }

  return odPairs;
}

export function generateReachabilityProbe(graph: Graph, probeCount: number): ODPair[] {
  const nodes = Array.from(graph.nodes.values());
  if (nodes.length === 0 || probeCount <= 0) {
    return [];
  }

  const destinationCandidates = buildDestinationCandidates(graph);
  if (destinationCandidates.length === 0) {
    return [];
  }

  const targetCount = Math.max(1, Math.min(probeCount, nodes.length));
  const step = Math.max(1, Math.floor(nodes.length / targetCount));

  const probePairs: ODPair[] = [];
  let seed = 1;
  for (let idx = 0; idx < nodes.length && probePairs.length < targetCount; idx += step) {
    const originNode = nodes[idx].id;
    let destNode = weightedChoiceFromUnit(destinationCandidates, deterministicUnit(seed));
    if (destNode === originNode && destinationCandidates.length > 1) {
      destNode = weightedChoiceFromUnit(destinationCandidates, deterministicUnit(seed + 17));
    }
    seed += 1;
    if (destNode === originNode) {
      continue;
    }
    probePairs.push({ originNode, destNode });
  }

  return probePairs;
}

export function countDisconnectedTrips(
  graph: Graph,
  closedFeatures: ReadonlySet<number>,
  odPairs: ODPair[],
): number {
  if (odPairs.length === 0) {
    return 0;
  }

  const openNeighbors = new Map<string, Set<string>>();
  for (const nodeId of graph.nodes.keys()) {
    openNeighbors.set(nodeId, new Set<string>());
  }

  for (const edge of graph.edges) {
    if (closedFeatures.has(edge.featureIndex)) {
      continue;
    }
    const fromNeighbors = openNeighbors.get(edge.from);
    const toNeighbors = openNeighbors.get(edge.to);
    if (fromNeighbors) {
      fromNeighbors.add(edge.to);
    }
    if (toNeighbors) {
      toNeighbors.add(edge.from);
    }
  }

  const componentByNode = new Map<string, number>();
  let componentId = 0;

  for (const nodeId of graph.nodes.keys()) {
    if (componentByNode.has(nodeId)) {
      continue;
    }

    const queue: string[] = [nodeId];
    componentByNode.set(nodeId, componentId);

    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) {
        continue;
      }
      const neighbors = openNeighbors.get(current);
      if (!neighbors) {
        continue;
      }
      for (const neighbor of neighbors) {
        if (componentByNode.has(neighbor)) {
          continue;
        }
        componentByNode.set(neighbor, componentId);
        queue.push(neighbor);
      }
    }

    componentId += 1;
  }

  let unreachable = 0;
  for (const od of odPairs) {
    const originComponent = componentByNode.get(od.originNode);
    const destComponent = componentByNode.get(od.destNode);
    if (originComponent === undefined || destComponent === undefined || originComponent !== destComponent) {
      unreachable += 1;
    }
  }
  return unreachable;
}

export function computeEdgeTimes(
  graph: Graph,
  edgeVolume: Map<string, number>,
  closedFeatures: ReadonlySet<number>,
): Map<string, number> {
  const edgeTimes = new Map<string, number>();
  for (const edge of graph.edges) {
    if (closedFeatures.has(edge.featureIndex)) {
      edgeTimes.set(edge.id, Number.POSITIVE_INFINITY);
      continue;
    }
    const volume = edgeVolume.get(edge.id) ?? 0;
    const capacity = edge.capacity <= 0 ? 1 : edge.capacity;
    const vcRatio = volume / capacity;
    const travelTime = edge.t0 * (1 + 0.15 * vcRatio ** 4);
    edgeTimes.set(edge.id, travelTime);
  }
  return edgeTimes;
}

function initializeEdgeVolume(graph: Graph): Map<string, number> {
  const edgeVolume = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeVolume.set(edge.id, 0);
  }
  return edgeVolume;
}

export function assignTraffic(
  graph: Graph,
  closedFeatures: ReadonlySet<number>,
  odPairs: ODPair[],
  iterations = 2,
): AssignmentResult {
  let edgeVolume = initializeEdgeVolume(graph);
  let unreachableTrips = 0;

  for (let iter = 0; iter < Math.max(1, iterations); iter += 1) {
    const edgeTimes = computeEdgeTimes(graph, edgeVolume, closedFeatures);
    const nextVolume = initializeEdgeVolume(graph);
    unreachableTrips = 0;

    for (const od of odPairs) {
      const pathEdgeIds = dijkstraPath(graph, od.originNode, od.destNode, edgeTimes);
      if (pathEdgeIds.length === 0) {
        unreachableTrips += 1;
        continue;
      }
      for (const edgeId of pathEdgeIds) {
        nextVolume.set(edgeId, (nextVolume.get(edgeId) ?? 0) + 1);
      }
    }
    edgeVolume = nextVolume;
  }

  const finalEdgeTimes = computeEdgeTimes(graph, edgeVolume, closedFeatures);
  const edgeMetrics = new Map<string, { volume: number; time: number; delayFactor: number; closed: boolean }>();

  for (const edge of graph.edges) {
    const volume = edgeVolume.get(edge.id) ?? 0;
    const time = finalEdgeTimes.get(edge.id) ?? edge.t0;
    const rawDelay = edge.t0 > 0 ? time / edge.t0 : 1;
    const delayFactor = Number.isFinite(rawDelay) ? Math.min(3, Math.max(1, rawDelay)) : 3;
    edgeMetrics.set(edge.id, {
      volume,
      time,
      delayFactor,
      closed: closedFeatures.has(edge.featureIndex),
    });
  }

  const featureMetrics = new Map<number, { volume: number; delayFactor: number; closed: boolean }>();
  for (const [featureIndex, edgeIds] of graph.featureToEdgeIds) {
    let volume = 0;
    let delayFactor = 1;
    let closed = false;

    for (const edgeId of edgeIds) {
      const metric = edgeMetrics.get(edgeId);
      if (!metric) {
        continue;
      }
      volume += metric.volume;
      delayFactor = Math.max(delayFactor, metric.delayFactor);
      closed = closed || metric.closed;
    }

    featureMetrics.set(featureIndex, {
      volume,
      delayFactor,
      closed,
    });
  }

  return {
    edgeMetrics,
    featureMetrics,
    unreachableTrips,
  };
}
