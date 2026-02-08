import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "./App.css";
import { attachDraw } from "./map/draw";
import { DrawPolygonControl } from "./map/DrawPolygonControl";
import { addRoadLayers, ROAD_LAYER_IDS, updateRoadSourceData } from "./map/layers";
import { buildGraphFromGeoJSON } from "./traffic/graph";
import {
  buildReverseAdjacency,
  dijkstraTreeToDestination,
  reconstructPathFromTree,
} from "./traffic/dijkstra";
import {
  assignTraffic,
  countDisconnectedTrips,
  generateOD,
  generateODFromOrigins,
  generateReachabilityProbe,
  getClosedFeatureNodeIds,
} from "./traffic/model";
import {
  computeLineFeatureBBoxes,
  detectRoadClosuresFromBuildingRings,
  extractPolygonRings,
} from "./traffic/buildingClosures";
import type { EdgeMetric, Graph, ODPair, RoadFeatureProperties } from "./traffic/types";
import { applyMetricsToRoads } from "./traffic/updateGeo";
import { SimulationResultsPanel } from "./components/SimulationResultsPanel";
import { fetchAndConvertMapboxStyle, type MapboxStyle } from "./utils/mapbox-style-converter";

type RoadCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>;

export interface SimulationStats {
  nodes: number;
  directedEdges: number;
  trips: number;
  probeTrips: number;
  closed: number;
  closureSeedNodes: number;
  runtimeMs: number;
  unreachable: number;
}

type FeatureLike = {
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
};

const INITIAL_CENTER: [number, number] = [-79.385, 45];
const INITIAL_ZOOM = 12;
const PITCH = 45;
const BEARING = -12;

const TORONTO_BOUNDS: [[number, number], [number, number]] = [
  [-79.5005, 43.6],
  [-79.280, 43.7],
];
const MIN_ZOOM = 8;
const MAX_ZOOM = 20;
const FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";
const TRAFFIC_PARTICLE_SOURCE_ID = "traffic-particles";
const TRAFFIC_PARTICLE_LAYER_ID = "traffic-particles";
const TRAFFIC_PARTICLE_MAX_COUNT = 420;
const TRAFFIC_ROUTE_POOL_MAX = 1600;
const TRAFFIC_PARTICLE_FRAME_MS = 90;
const TRAFFIC_PARTICLE_SPEED_SCALE = 1.25;
const POLYGON_BUILDINGS_SOURCE_ID = "polygon-buildings";
const POLYGON_BUILDINGS_LAYER_ID = "polygon-buildings-3d";
const POLYGON_BUILDINGS_OUTLINE_LAYER_ID = "polygon-buildings-outline";
const RECTANGLE_PREVIEW_SOURCE_ID = "rectangle-preview";
const RECTANGLE_PREVIEW_FILL_LAYER_ID = "rectangle-preview-fill";
const RECTANGLE_PREVIEW_LINE_LAYER_ID = "rectangle-preview-line";

const DEFAULT_STATS: SimulationStats = {
  nodes: 0,
  directedEdges: 0,
  trips: 0,
  probeTrips: 0,
  closed: 0,
  closureSeedNodes: 0,
  runtimeMs: 0,
  unreachable: 0,
};

function parseRoadCollection(raw: unknown): RoadCollection {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Road data is missing or invalid.");
  }
  const candidate = raw as GeoJSON.FeatureCollection<GeoJSON.Geometry, RoadFeatureProperties>;
  if (candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    throw new Error("Road data is not a GeoJSON FeatureCollection.");
  }

  const features: Array<GeoJSON.Feature<GeoJSON.LineString, RoadFeatureProperties>> = [];
  for (const feature of candidate.features) {
    if (!feature.geometry || feature.geometry.type !== "LineString") {
      continue;
    }
    const coordinates = feature.geometry.coordinates
      .filter((coord): coord is number[] => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => [Number(coord[0]), Number(coord[1])]);
    if (coordinates.length < 2) {
      continue;
    }

    features.push({
      type: "Feature",
      id: feature.id,
      geometry: { type: "LineString", coordinates },
      properties: { ...(feature.properties ?? {}) },
    });
  }

  return { type: "FeatureCollection", features };
}

function extractFeatureIndex(feature: FeatureLike): number | null {
  const fromProperties = feature.properties?.featureIndex;
  if (typeof fromProperties === "number" && Number.isFinite(fromProperties)) {
    return fromProperties;
  }
  if (typeof fromProperties === "string") {
    const parsed = Number.parseInt(fromProperties, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof feature.id === "number" && Number.isFinite(feature.id)) {
    return feature.id;
  }
  if (typeof feature.id === "string") {
    const parsed = Number.parseInt(feature.id, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function distance2ToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const ddx = px - x1;
    const ddy = py - y1;
    return ddx * ddx + ddy * ddy;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;
  return ddx * ddx + ddy * ddy;
}

function featureDistance2InPixels(
  map: maplibregl.Map,
  feature: FeatureLike,
  px: number,
  py: number,
): number {
  if (!feature.geometry) {
    return Number.POSITIVE_INFINITY;
  }

  const measureLine = (line: number[][]): number => {
    if (line.length < 2) {
      return Number.POSITIVE_INFINITY;
    }
    let best = Number.POSITIVE_INFINITY;
    for (let idx = 1; idx < line.length; idx += 1) {
      const a = map.project([line[idx - 1][0], line[idx - 1][1]]);
      const b = map.project([line[idx][0], line[idx][1]]);
      best = Math.min(best, distance2ToSegment(px, py, a.x, a.y, b.x, b.y));
    }
    return best;
  };

  if (feature.geometry.type === "LineString") {
    return measureLine(feature.geometry.coordinates as number[][]);
  }
  if (feature.geometry.type === "MultiLineString") {
    let best = Number.POSITIVE_INFINITY;
    for (const line of feature.geometry.coordinates as number[][][]) {
      best = Math.min(best, measureLine(line));
    }
    return best;
  }
  return Number.POSITIVE_INFINITY;
}

type GeoJsonSourceWithData = maplibregl.GeoJSONSource & { _data?: GeoJSON.GeoJSON };
type TrafficRoute = {
  originNode: string;
  destNode: string;
  edgeIds: string[];
};
type TrafficParticle = {
  id: string;
  route: TrafficRoute;
  edgeIndex: number;
  edgeProgressM: number;
  position: [number, number];
};

function asFeatureCollection(
  geojson: GeoJSON.GeoJSON | undefined,
): GeoJSON.FeatureCollection | null {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return null;
  }
  return geojson;
}

function mergeClosedFeatureSets(...sets: ReadonlyArray<ReadonlySet<number>>): Set<number> {
  const merged = new Set<number>();
  for (const set of sets) {
    for (const value of set) {
      merged.add(value);
    }
  }
  return merged;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asPropertiesRecord(
  properties: GeoJSON.GeoJsonProperties | null | undefined,
): Record<string, unknown> {
  if (!properties || typeof properties !== "object") {
    return {};
  }
  return { ...properties } as Record<string, unknown>;
}

function extractBuildingId(
  feature:
    | GeoJSON.Feature
    | maplibregl.MapGeoJSONFeature
    | { id?: string | number; properties?: Record<string, unknown> },
): string | null {
  const idFromProperties = feature.properties?.id;
  if (typeof idFromProperties === "string" || typeof idFromProperties === "number") {
    return String(idFromProperties);
  }
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }
  return null;
}

function rectangleCoordinates(
  start: [number, number],
  end: [number, number],
): GeoJSON.Position[][] {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;
  const minLng = Math.min(lng1, lng2);
  const maxLng = Math.max(lng1, lng2);
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);
  return [[
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ]];
}

function createRectangleFeature(
  id: string,
  start: [number, number],
  end: [number, number],
  height: number,
  selected = false,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Polygon",
      coordinates: rectangleCoordinates(start, end),
    },
    properties: {
      id,
      height,
      type: "rectangle-building",
      baseHeight: 0,
      selected,
    },
  };
}

function rectangleAreaTooSmall(start: [number, number], end: [number, number]): boolean {
  const deltaLng = Math.abs(start[0] - end[0]);
  const deltaLat = Math.abs(start[1] - end[1]);
  return deltaLng < 0.00001 || deltaLat < 0.00001;
}

function emptyTrafficPointCollection(): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { particleId: string }
> {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function edgeSpeedMps(edgeLengthM: number, edgeMetric: EdgeMetric | undefined): number {
  if (!edgeMetric || edgeMetric.closed || !Number.isFinite(edgeMetric.time) || edgeMetric.time <= 0) {
    return 0;
  }
  return clampNumber(edgeLengthM / edgeMetric.time, 1.2, 30);
}

function interpolateAlongEdge(
  edge: Graph["edges"][number],
  progressM: number,
): [number, number] {
  const start = edge.coords[0];
  const end = edge.coords[edge.coords.length - 1];
  if (!start || !end) {
    return [0, 0];
  }
  const edgeLength = Math.max(1, edge.lengthM);
  const t = clampNumber(progressM / edgeLength, 0, 1);
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ];
}

function buildTrafficRoutePool(
  graph: Graph,
  odPairs: ODPair[],
  edgeMetrics: Map<string, EdgeMetric>,
): TrafficRoute[] {
  const edgeTimes = new Map<string, number>();
  for (const edge of graph.edges) {
    const metric = edgeMetrics.get(edge.id);
    if (!metric || metric.closed || !Number.isFinite(metric.time)) {
      edgeTimes.set(edge.id, Number.POSITIVE_INFINITY);
      continue;
    }
    edgeTimes.set(edge.id, Math.max(0.05, metric.time));
  }

  const routes: TrafficRoute[] = [];
  const reverseAdjacency = buildReverseAdjacency(graph);
  const byDestination = new Map<string, ODPair[]>();

  for (const od of odPairs) {
    const bucket = byDestination.get(od.destNode);
    if (bucket) {
      bucket.push(od);
    } else {
      byDestination.set(od.destNode, [od]);
    }
  }

  for (const [destinationNode, destinationPairs] of byDestination) {
    if (routes.length >= TRAFFIC_ROUTE_POOL_MAX) {
      break;
    }

    const tree = dijkstraTreeToDestination(
      graph,
      destinationNode,
      edgeTimes,
      reverseAdjacency,
    );

    for (const od of destinationPairs) {
      if (routes.length >= TRAFFIC_ROUTE_POOL_MAX) {
        break;
      }
      const edgeIds = reconstructPathFromTree(graph, od.originNode, od.destNode, tree);
      if (edgeIds.length === 0) {
        continue;
      }
      routes.push({
        originNode: od.originNode,
        destNode: od.destNode,
        edgeIds,
      });
    }
  }

  if (routes.length > 0) {
    return routes;
  }

  for (const edge of graph.edges) {
    if (routes.length >= TRAFFIC_ROUTE_POOL_MAX) {
      break;
    }
    const metric = edgeMetrics.get(edge.id);
    if (!metric || metric.closed || !Number.isFinite(metric.time)) {
      continue;
    }
    routes.push({
      originNode: edge.from,
      destNode: edge.to,
      edgeIds: [edge.id],
    });
  }

  return routes;
}

function randomTrafficRoute(routePool: TrafficRoute[]): TrafficRoute | null {
  if (routePool.length === 0) {
    return null;
  }
  return routePool[Math.floor(Math.random() * routePool.length)] ?? null;
}

function assignParticleRoute(
  particle: TrafficParticle,
  graph: Graph,
  routePool: TrafficRoute[],
): boolean {
  const route = randomTrafficRoute(routePool);
  if (!route) {
    return false;
  }

  const edgeIndex = Math.min(
    route.edgeIds.length - 1,
    Math.floor(Math.random() * Math.max(1, route.edgeIds.length)),
  );
  const edge = graph.edgesById.get(route.edgeIds[edgeIndex]);
  if (!edge) {
    return false;
  }

  const edgeProgressM = Math.random() * Math.max(1, edge.lengthM * 0.8);
  particle.route = route;
  particle.edgeIndex = edgeIndex;
  particle.edgeProgressM = edgeProgressM;
  particle.position = interpolateAlongEdge(edge, edgeProgressM);
  return true;
}

function buildTrafficParticles(
  graph: Graph,
  routePool: TrafficRoute[],
): TrafficParticle[] {
  if (routePool.length === 0) {
    return [];
  }

  const particleCount = clampNumber(
    Math.max(40, Math.round(routePool.length * 0.14)),
    40,
    TRAFFIC_PARTICLE_MAX_COUNT,
  );

  const particles: TrafficParticle[] = [];
  for (let index = 0; index < particleCount; index += 1) {
    const route = randomTrafficRoute(routePool);
    if (!route) {
      break;
    }
    const firstEdge = graph.edgesById.get(route.edgeIds[0]);
    if (!firstEdge) {
      continue;
    }
    const particle: TrafficParticle = {
      id: `particle-${index}`,
      route,
      edgeIndex: 0,
      edgeProgressM: 0,
      position: firstEdge.coords[0] ?? [0, 0],
    };
    if (!assignParticleRoute(particle, graph, routePool)) {
      continue;
    }
    particles.push(particle);
  }

  return particles;
}

function advanceTrafficParticles(
  particles: TrafficParticle[],
  graph: Graph,
  edgeMetrics: Map<string, EdgeMetric>,
  routePool: TrafficRoute[],
  deltaSeconds: number,
): void {
  if (particles.length === 0) {
    return;
  }

  const dt = Math.max(0.01, Math.min(0.3, deltaSeconds));
  for (const particle of particles) {
    let edgeId = particle.route.edgeIds[particle.edgeIndex];
    let edge = edgeId ? graph.edgesById.get(edgeId) : undefined;
    let metric = edge ? edgeMetrics.get(edge.id) : undefined;

    if (!edge || !metric || metric.closed || !Number.isFinite(metric.time)) {
      if (!assignParticleRoute(particle, graph, routePool)) {
        continue;
      }
      edgeId = particle.route.edgeIds[particle.edgeIndex];
      edge = edgeId ? graph.edgesById.get(edgeId) : undefined;
      metric = edge ? edgeMetrics.get(edge.id) : undefined;
      if (!edge || !metric || metric.closed || !Number.isFinite(metric.time)) {
        continue;
      }
    }

    const speedMps = edgeSpeedMps(edge.lengthM, metric) * TRAFFIC_PARTICLE_SPEED_SCALE;
    particle.edgeProgressM += speedMps * dt;

    let edgeLength = Math.max(1, edge.lengthM);
    let hop = 0;
    while (particle.edgeProgressM >= edgeLength && hop < 6) {
      particle.edgeProgressM -= edgeLength;
      particle.edgeIndex += 1;
      hop += 1;

      if (particle.edgeIndex >= particle.route.edgeIds.length) {
        if (!assignParticleRoute(particle, graph, routePool)) {
          break;
        }
      }

      edgeId = particle.route.edgeIds[particle.edgeIndex];
      edge = edgeId ? graph.edgesById.get(edgeId) : undefined;
      metric = edge ? edgeMetrics.get(edge.id) : undefined;
      if (!edge || !metric || metric.closed || !Number.isFinite(metric.time)) {
        if (!assignParticleRoute(particle, graph, routePool)) {
          break;
        }
        edgeId = particle.route.edgeIds[particle.edgeIndex];
        edge = edgeId ? graph.edgesById.get(edgeId) : undefined;
        metric = edge ? edgeMetrics.get(edge.id) : undefined;
        if (!edge || !metric || metric.closed || !Number.isFinite(metric.time)) {
          break;
        }
      }
      edgeLength = Math.max(1, edge.lengthM);
    }

    edgeId = particle.route.edgeIds[particle.edgeIndex];
    edge = edgeId ? graph.edgesById.get(edgeId) : undefined;
    if (!edge) {
      continue;
    }
    particle.position = interpolateAlongEdge(edge, particle.edgeProgressM);
  }
}

function trafficParticlesToFeatures(
  particles: TrafficParticle[],
): Array<GeoJSON.Feature<GeoJSON.Point, { particleId: string }>> {
  return particles.map((particle) => ({
    type: "Feature",
    properties: { particleId: particle.id },
    geometry: {
      type: "Point",
      coordinates: particle.position,
    },
  }));
}

export default function App() {
  const token =
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
    (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined);
  const hasToken = typeof token === "string" && token.trim().length > 0;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const roadsRef = useRef<RoadCollection | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const odPairsRef = useRef<ODPair[]>([]);
  const probePairsRef = useRef<ODPair[]>([]);
  const sampleSignatureRef = useRef("");
  const closureSeedNodeCountRef = useRef(0);
  const manualClosedFeaturesRef = useRef<Set<number>>(new Set<number>());
  const buildingClosedFeaturesRef = useRef<Set<number>>(new Set<number>());
  const roadFeatureBBoxesRef = useRef<Array<[number, number, number, number]>>([]);
  const trafficParticlesRef = useRef<TrafficParticle[]>([]);
  const trafficRoutePoolRef = useRef<TrafficRoute[]>([]);
  const trafficEdgeMetricsRef = useRef<Map<string, EdgeMetric>>(new Map());
  const trafficAnimationFrameRef = useRef<number | null>(null);
  const trafficLastFrameRef = useRef(0);
  const recomputeTimerRef = useRef<number | null>(null);
  const drawControlRef = useRef<DrawPolygonControl | null>(null);
  const polygonBuildingsRef = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const selectedPolygonBuildingIdRef = useRef<string | null>(null);
  const buildingModeRef = useRef(false);
  const drawModeRef = useRef(false);
  const rectHeightRef = useRef("40");
  const rectangleDragActiveRef = useRef(false);
  const rectangleDragStartRef = useRef<[number, number] | null>(null);
  const rectangleDragCurrentRef = useRef<[number, number] | null>(null);
  const rectFirstCornerRef = useRef<[number, number] | null>(null);

  const [mapStyle, setMapStyle] = useState<MapboxStyle | string | null>(null);
  const [cursorCoordinates, setCursorCoordinates] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const [statusText, setStatusText] = useState(
    hasToken ? "Waiting for map..." : "No Mapbox token found. Loading fallback map style...",
  );
  const [isComputing, setIsComputing] = useState(false);
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);

  const [selectedPolygonBuildingId, setSelectedPolygonBuildingId] = useState<string | null>(null);
  const [buildingMode, setBuildingMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [polygonBuildings, setPolygonBuildings] = useState<Map<string, GeoJSON.Feature>>(new Map());
  const [rectHeight, setRectHeight] = useState("40");
  const [rectFirstCorner, setRectFirstCorner] = useState<[number, number] | null>(null);

  useEffect(() => {
    buildingModeRef.current = buildingMode;
    const map = mapRef.current;
    if (!map) {
      return;
    }
    if (buildingMode) {
      map.dragPan.disable();
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = "crosshair";
      setStatusText("Build mode enabled. Click and drag to add a building.");
    } else {
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      rectangleDragActiveRef.current = false;
      rectangleDragStartRef.current = null;
      rectangleDragCurrentRef.current = null;
      rectFirstCornerRef.current = null;
      setRectFirstCorner(null);
      const previewSource = map.getSource(RECTANGLE_PREVIEW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (previewSource) {
        previewSource.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
    }
  }, [buildingMode]);

  useEffect(() => {
    rectHeightRef.current = rectHeight;
  }, [rectHeight]);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    selectedPolygonBuildingIdRef.current = selectedPolygonBuildingId;
  }, [selectedPolygonBuildingId]);

  useEffect(() => {
    rectFirstCornerRef.current = rectFirstCorner;
  }, [rectFirstCorner]);

  const refreshCustomBuildings = useCallback(async () => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    try {
      const response = await fetch("http://localhost:3001/api/buildings");
      if (!response.ok) {
        return;
      }
      const geojson = (await response.json()) as GeoJSON.FeatureCollection<
        GeoJSON.Polygon,
        Record<string, unknown>
      >;

      const sourceId = "custom-buildings";
      const layerId = "custom-buildings-3d";
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
        return;
      }

      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (layer) => layer.type === "symbol" && layer.layout && layer.layout["text-field"],
      )?.id;

      map.addSource(sourceId, {
        type: "geojson",
        data: geojson,
      });

      map.addLayer(
        {
          id: layerId,
          type: "fill-extrusion",
          source: sourceId,
          paint: {
            "fill-extrusion-color": "#aaa",
            "fill-extrusion-height": ["coalesce", ["get", "height"], 20],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.8,
          },
        },
        labelLayerId,
      );
    } catch (error) {
      console.error("Error refreshing custom buildings:", error);
    }
  }, []);

  const ensurePolygonBuildingsLayer = useCallback((map: maplibregl.Map) => {
    if (!map.getSource(POLYGON_BUILDINGS_SOURCE_ID)) {
      map.addSource(POLYGON_BUILDINGS_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!map.getLayer(POLYGON_BUILDINGS_LAYER_ID)) {
      map.addLayer({
        id: POLYGON_BUILDINGS_LAYER_ID,
        type: "fill-extrusion",
        source: POLYGON_BUILDINGS_SOURCE_ID,
        paint: {
          "fill-extrusion-color": [
            "case",
            ["==", ["coalesce", ["get", "selected"], false], true],
            "#f59e0b",
            "#4A90E2",
          ],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "baseHeight"],
          "fill-extrusion-opacity": 0.8,
        },
      });
    }

    if (!map.getLayer(POLYGON_BUILDINGS_OUTLINE_LAYER_ID)) {
      map.addLayer({
        id: POLYGON_BUILDINGS_OUTLINE_LAYER_ID,
        type: "line",
        source: POLYGON_BUILDINGS_SOURCE_ID,
        filter: ["==", ["coalesce", ["get", "selected"], false], true],
        paint: {
          "line-color": "#ffd166",
          "line-width": 3,
          "line-opacity": 1,
        },
      });
    }
  }, []);

  const updatePolygonBuildingsSource = useCallback(
    (map: maplibregl.Map, buildings: Map<string, GeoJSON.Feature>) => {
      ensurePolygonBuildingsLayer(map);
      const source = map.getSource(POLYGON_BUILDINGS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) {
        return;
      }
      const features = Array.from(buildings.values());
      source.setData({
        type: "FeatureCollection",
        features,
      });
    },
    [ensurePolygonBuildingsLayer],
  );

  const ensureRectanglePreviewLayer = useCallback((map: maplibregl.Map) => {
    if (!map.getSource(RECTANGLE_PREVIEW_SOURCE_ID)) {
      map.addSource(RECTANGLE_PREVIEW_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!map.getLayer(RECTANGLE_PREVIEW_FILL_LAYER_ID)) {
      map.addLayer({
        id: RECTANGLE_PREVIEW_FILL_LAYER_ID,
        type: "fill",
        source: RECTANGLE_PREVIEW_SOURCE_ID,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.16,
        },
      });
    }

    if (!map.getLayer(RECTANGLE_PREVIEW_LINE_LAYER_ID)) {
      map.addLayer({
        id: RECTANGLE_PREVIEW_LINE_LAYER_ID,
        type: "line",
        source: RECTANGLE_PREVIEW_SOURCE_ID,
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
    }
  }, []);

  const updateRectanglePreview = useCallback(
    (map: maplibregl.Map, start: [number, number], end: [number, number], height: number) => {
      ensureRectanglePreviewLayer(map);
      const source = map.getSource(RECTANGLE_PREVIEW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) {
        return;
      }
      source.setData({
        type: "FeatureCollection",
        features: [createRectangleFeature("rectangle-preview", start, end, height, false)],
      });
    },
    [ensureRectanglePreviewLayer],
  );

  const clearRectanglePreview = useCallback((map: maplibregl.Map) => {
    const source = map.getSource(RECTANGLE_PREVIEW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) {
      return;
    }
    source.setData({
      type: "FeatureCollection",
      features: [],
    });
  }, []);

  const ensureTrafficParticleLayer = useCallback((map: maplibregl.Map) => {
    if (!map.getSource(TRAFFIC_PARTICLE_SOURCE_ID)) {
      map.addSource(TRAFFIC_PARTICLE_SOURCE_ID, {
        type: "geojson",
        data: emptyTrafficPointCollection(),
      });
    }

    if (!map.getLayer(TRAFFIC_PARTICLE_LAYER_ID)) {
      map.addLayer({
        id: TRAFFIC_PARTICLE_LAYER_ID,
        type: "circle",
        source: TRAFFIC_PARTICLE_SOURCE_ID,
        paint: {
          "circle-color": "#22d3ee",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.4, 14, 4.6, 17, 7.2],
          "circle-opacity": 0.96,
          "circle-blur": 0.06,
          "circle-pitch-alignment": "map",
          "circle-pitch-scale": "map",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }
  }, []);

  const bringTrafficParticlesToFront = useCallback((map: maplibregl.Map) => {
    if (!map.getLayer(TRAFFIC_PARTICLE_LAYER_ID)) {
      return;
    }
    try {
      map.moveLayer(TRAFFIC_PARTICLE_LAYER_ID);
    } catch {
      // no-op
    }
  }, []);

  const updateTrafficParticleSource = useCallback(
    (
      map: maplibregl.Map,
      features: Array<GeoJSON.Feature<GeoJSON.Point, { particleId: string }>>,
    ) => {
      ensureTrafficParticleLayer(map);
      bringTrafficParticlesToFront(map);
      const source = map.getSource(TRAFFIC_PARTICLE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) {
        return;
      }
      source.setData({
        type: "FeatureCollection",
        features,
      });
    },
    [bringTrafficParticlesToFront, ensureTrafficParticleLayer],
  );

  const stopTrafficParticleAnimation = useCallback(() => {
    if (trafficAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(trafficAnimationFrameRef.current);
      trafficAnimationFrameRef.current = null;
    }
  }, []);

  const startTrafficParticleAnimation = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    ensureTrafficParticleLayer(map);
    stopTrafficParticleAnimation();
    trafficLastFrameRef.current = 0;
    if (trafficParticlesRef.current.length === 0) {
      updateTrafficParticleSource(map, []);
      return;
    }
    updateTrafficParticleSource(map, trafficParticlesToFeatures(trafficParticlesRef.current));

    const animate = (timestampMs: number) => {
      const activeMap = mapRef.current;
      const activeGraph = graphRef.current;
      if (!activeMap) {
        trafficAnimationFrameRef.current = null;
        return;
      }
      if (!activeGraph) {
        trafficAnimationFrameRef.current = null;
        return;
      }

      if (trafficLastFrameRef.current <= 0) {
        trafficLastFrameRef.current = timestampMs;
      }
      const deltaMs = timestampMs - trafficLastFrameRef.current;

      if (deltaMs >= TRAFFIC_PARTICLE_FRAME_MS) {
        trafficLastFrameRef.current = timestampMs;
        const particles = trafficParticlesRef.current;

        if (particles.length === 0) {
          updateTrafficParticleSource(activeMap, []);
        } else {
          advanceTrafficParticles(
            particles,
            activeGraph,
            trafficEdgeMetricsRef.current,
            trafficRoutePoolRef.current,
            deltaMs / 1000,
          );
          updateTrafficParticleSource(activeMap, trafficParticlesToFeatures(particles));
        }
      }

      trafficAnimationFrameRef.current = window.requestAnimationFrame(animate);
    };

    trafficAnimationFrameRef.current = window.requestAnimationFrame(animate);
  }, [ensureTrafficParticleLayer, stopTrafficParticleAnimation, updateTrafficParticleSource]);

  const setPolygonBuildingSelection = useCallback(
    (map: maplibregl.Map, nextSelectedId: string | null) => {
      let selectedHeight: number | null = null;
      let resolvedSelectedId: string | null = nextSelectedId;
      setPolygonBuildings((prev) => {
        if (nextSelectedId && !prev.has(nextSelectedId)) {
          resolvedSelectedId = null;
        }
        const next = new Map<string, GeoJSON.Feature>();
        for (const [id, feature] of prev.entries()) {
          const properties = asPropertiesRecord(feature.properties);
          const isSelected = id === resolvedSelectedId;
          if (isSelected) {
            const heightValue = Number.parseFloat(String(properties.height));
            if (Number.isFinite(heightValue)) {
              selectedHeight = heightValue;
            }
          }
          next.set(id, {
            ...feature,
            properties: {
              ...properties,
              selected: isSelected,
            },
          });
        }
        polygonBuildingsRef.current = next;
        updatePolygonBuildingsSource(map, next);
        return next;
      });
      setSelectedPolygonBuildingId(resolvedSelectedId);
      if (selectedHeight !== null) {
        setRectHeight(String(selectedHeight));
      }
      if (resolvedSelectedId) {
        console.log("[BUILDING SELECT] Selected building", { id: resolvedSelectedId });
      } else {
        console.log("[BUILDING SELECT] Cleared building selection");
      }
    },
    [updatePolygonBuildingsSource],
  );

  const addPolygonBuilding = useCallback(
    (map: maplibregl.Map, feature: GeoJSON.Feature) => {
      const buildingId = extractBuildingId(feature) ?? `rect-${Date.now()}`;
      const rawProperties = asPropertiesRecord(feature.properties);
      const heightValue = Math.max(1, Number.parseFloat(String(rawProperties.height ?? rectHeightRef.current)) || 20);

      setPolygonBuildings((prev) => {
        const next = new Map<string, GeoJSON.Feature>();
        for (const [id, existingFeature] of prev.entries()) {
          const existingProperties = asPropertiesRecord(existingFeature.properties);
          next.set(id, {
            ...existingFeature,
            properties: {
              ...existingProperties,
              selected: false,
            },
          });
        }

        next.set(buildingId, {
          ...feature,
          id: buildingId,
          properties: {
            ...rawProperties,
            id: buildingId,
            height: heightValue,
            type: rawProperties.type ?? "rectangle-building",
            baseHeight: rawProperties.baseHeight ?? 0,
            selected: true,
          },
        });

        polygonBuildingsRef.current = next;
        updatePolygonBuildingsSource(map, next);
        return next;
      });

      setSelectedPolygonBuildingId(buildingId);
      setRectHeight(String(heightValue));
      console.log("[BUILDING ADD] Added building", { id: buildingId, height: heightValue });
    },
    [updatePolygonBuildingsSource],
  );

  const collectBuildingRings = useCallback((): Array<[number, number][]> => {
    const rings: Array<[number, number][]> = [];

    for (const feature of polygonBuildingsRef.current.values()) {
      rings.push(...extractPolygonRings(feature));
    }

    const map = mapRef.current;
    if (!map) {
      return rings;
    }

    const customBuildingsSource = map.getSource("custom-buildings") as GeoJsonSourceWithData | undefined;
    const customBuildingsData = asFeatureCollection(customBuildingsSource?._data);
    if (customBuildingsData) {
      for (const feature of customBuildingsData.features) {
        rings.push(...extractPolygonRings(feature));
      }
    }

    return rings;
  }, []);

  const computeEffectiveClosedFeatures = useCallback(
    (roads: RoadCollection): Set<number> => {
      const buildingRings = collectBuildingRings();
      const buildingClosures = detectRoadClosuresFromBuildingRings(
        roads,
        buildingRings,
        roadFeatureBBoxesRef.current,
      );
      buildingClosedFeaturesRef.current = buildingClosures;
      return mergeClosedFeatureSets(manualClosedFeaturesRef.current, buildingClosures);
    },
    [collectBuildingRings],
  );

  const buildAdaptiveSamples = useCallback(
    (graph: Graph, closedFeatures: ReadonlySet<number>): { odPairs: ODPair[]; closureSeedNodes: number } => {
      const baseTripCount = Math.max(220, Math.min(520, Math.round(graph.edges.length / 25)));

      if (closedFeatures.size === 0) {
        return {
          odPairs: generateOD(graph, baseTripCount),
          closureSeedNodes: 0,
        };
      }

      const closureNodeIds = getClosedFeatureNodeIds(graph, closedFeatures);
      if (closureNodeIds.length === 0) {
        return {
          odPairs: generateOD(graph, baseTripCount),
          closureSeedNodes: 0,
        };
      }

      const closureScale = Math.min(1.5, 0.35 + closedFeatures.size * 0.08);
      const localTripCount = Math.max(120, Math.round(baseTripCount * closureScale));

      return {
        odPairs: [
          ...generateOD(graph, baseTripCount),
          ...generateODFromOrigins(graph, localTripCount, closureNodeIds),
        ],
        closureSeedNodes: closureNodeIds.length,
      };
    },
    [],
  );

  const runSimulation = useCallback(() => {
    console.log("🔄 [RECOMPUTE] Starting simulation...");
    const map = mapRef.current;
    const roads = roadsRef.current;
    const graph = graphRef.current;
    if (!map || !roads || !graph) {
      console.error("❌ [RECOMPUTE] Missing map, roads, or graph");
      return;
    }

    console.log("📊 [RECOMPUTE] Network stats:", {
      nodes: graph.nodes.size,
      edges: graph.edges.length,
      trips: odPairsRef.current.length,
      closed: manualClosedFeaturesRef.current.size + buildingClosedFeaturesRef.current.size,
      manualClosed: manualClosedFeaturesRef.current.size,
      buildingClosed: buildingClosedFeaturesRef.current.size,
    });

    setIsComputing(true);
    setShowResultsPanel(true);

    const effectiveClosedFeatures = computeEffectiveClosedFeatures(roads);
    const manualClosedCount = manualClosedFeaturesRef.current.size;
    const buildingClosedCount = buildingClosedFeaturesRef.current.size;

    const sampleSignature = Array.from(effectiveClosedFeatures)
      .sort((a, b) => a - b)
      .join(",");
    if (sampleSignature !== sampleSignatureRef.current) {
      const adaptiveSamples = buildAdaptiveSamples(graph, effectiveClosedFeatures);
      odPairsRef.current = adaptiveSamples.odPairs;
      closureSeedNodeCountRef.current = adaptiveSamples.closureSeedNodes;
      sampleSignatureRef.current = sampleSignature;
    }

    const start = performance.now();
    const result = assignTraffic(graph, effectiveClosedFeatures, odPairsRef.current, 2);
    const unreachableTrips = countDisconnectedTrips(
      graph,
      effectiveClosedFeatures,
      probePairsRef.current,
    );
    trafficEdgeMetricsRef.current = result.edgeMetrics;
    trafficRoutePoolRef.current = buildTrafficRoutePool(graph, odPairsRef.current, result.edgeMetrics);
    trafficParticlesRef.current = buildTrafficParticles(graph, trafficRoutePoolRef.current);
    startTrafficParticleAnimation();
    const updatedRoads = applyMetricsToRoads(roads, result.featureMetrics);
    updateRoadSourceData(map, updatedRoads);
    bringTrafficParticlesToFront(map);
    const runtimeMs = Math.round(performance.now() - start);
    const liveParticleCount = trafficParticlesRef.current.length;

    const newStats = {
      nodes: graph.nodes.size,
      directedEdges: graph.edges.length,
      trips: odPairsRef.current.length,
      probeTrips: probePairsRef.current.length,
      closed: effectiveClosedFeatures.size,
      closureSeedNodes: closureSeedNodeCountRef.current,
      runtimeMs,
      unreachable: unreachableTrips,
    };

    setStats(newStats);

    console.log("✅ [RECOMPUTE] Simulation complete:", {
      runtime: `${runtimeMs}ms`,
      closedSegments: effectiveClosedFeatures.size,
      manualClosed: manualClosedCount,
      buildingClosed: buildingClosedCount,
      unreachableTrips,
      avgDelay: ((unreachableTrips / odPairsRef.current.length) * 100).toFixed(1) + "%",
    });

    setStatusText(
      `Heatmap updated in ${runtimeMs} ms (${effectiveClosedFeatures.size} closed = ${manualClosedCount} manual + ${buildingClosedCount} blocked by buildings, ${liveParticleCount} live vehicles).`,
    );
    setIsComputing(false);
  }, [
    bringTrafficParticlesToFront,
    buildAdaptiveSamples,
    computeEffectiveClosedFeatures,
    startTrafficParticleAnimation,
  ]);

  const scheduleSimulation = useCallback(
    (delayMs = 300) => {
      if (recomputeTimerRef.current !== null) {
        window.clearTimeout(recomputeTimerRef.current);
      }
      recomputeTimerRef.current = window.setTimeout(() => {
        recomputeTimerRef.current = null;
        runSimulation();
      }, delayMs);
    },
    [runSimulation],
  );

  const loadRoadNetwork = useCallback(
    async (map: maplibregl.Map) => {
      setStatusText("Loading downtown roads...");
      const response = await fetch("/data/roads_downtown.geojson");
      if (!response.ok) {
        throw new Error(`Unable to load roads_downtown.geojson (${response.status})`);
      }

      const raw = (await response.json()) as unknown;
      const roads = parseRoadCollection(raw);
      roadsRef.current = roads;
      roadFeatureBBoxesRef.current = computeLineFeatureBBoxes(roads);

      const graph = buildGraphFromGeoJSON(roads);
      graphRef.current = graph;

      const effectiveClosedFeatures = computeEffectiveClosedFeatures(roads);
      const adaptiveSamples = buildAdaptiveSamples(graph, effectiveClosedFeatures);
      odPairsRef.current = adaptiveSamples.odPairs;
      const stableProbeCount = Math.max(1200, Math.min(3200, Math.round(graph.nodes.size * 0.35)));
      probePairsRef.current = generateReachabilityProbe(graph, stableProbeCount);
      closureSeedNodeCountRef.current = adaptiveSamples.closureSeedNodes;
      sampleSignatureRef.current = "";

      const start = performance.now();
      const baseline = assignTraffic(graph, effectiveClosedFeatures, odPairsRef.current, 2);
      const unreachableTrips = countDisconnectedTrips(
        graph,
        effectiveClosedFeatures,
        probePairsRef.current,
      );
      trafficEdgeMetricsRef.current = baseline.edgeMetrics;
      trafficRoutePoolRef.current = buildTrafficRoutePool(graph, odPairsRef.current, baseline.edgeMetrics);
      trafficParticlesRef.current = buildTrafficParticles(graph, trafficRoutePoolRef.current);
      startTrafficParticleAnimation();
      const roadsWithMetrics = applyMetricsToRoads(roads, baseline.featureMetrics);
      addRoadLayers(map, roadsWithMetrics);
      bringTrafficParticlesToFront(map);
      const runtimeMs = Math.round(performance.now() - start);

      setStats({
        nodes: graph.nodes.size,
        directedEdges: graph.edges.length,
        trips: odPairsRef.current.length,
        probeTrips: probePairsRef.current.length,
        closed: effectiveClosedFeatures.size,
        closureSeedNodes: adaptiveSamples.closureSeedNodes,
        runtimeMs,
        unreachable: unreachableTrips,
      });
      setStatusText(
        `Loaded ${roads.features.length} roads, ${graph.nodes.size} nodes, ${odPairsRef.current.length} OD trips.`,
      );
    },
    [
      bringTrafficParticlesToFront,
      buildAdaptiveSamples,
      computeEffectiveClosedFeatures,
      startTrafficParticleAnimation,
    ],
  );

  useEffect(() => {
    if (!hasToken || !token) {
      setMapStyle(FALLBACK_STYLE_URL);
      return;
    }

    fetchAndConvertMapboxStyle("mapbox://styles/mapbox/streets-v11", token)
      .then((style) => setMapStyle(style))
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown style load error";
        setStatusText(`Mapbox style failed (${message}). Using fallback style.`);
        setMapStyle(FALLBACK_STYLE_URL);
      });
  }, [hasToken, token]);

  useEffect(() => {
    if (!mapStyle) {
      return;
    }

    const container = mapContainerRef.current;
    if (!container) {
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: mapStyle as maplibregl.StyleSpecification | string,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      maxBounds: TORONTO_BOUNDS,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      canvasContextAttributes: {
        antialias: true,
      },
    });
   
    mapRef.current = map;

    const { detach } = attachDraw(map);

    const ensureUserSourceAndLayer = () => {
      if (!map.getSource("user-shape")) {
        map.addSource("user-shape", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("user-shape-extrude")) {
        map.addLayer({
          id: "user-shape-extrude",
          type: "fill-extrusion",
          source: "user-shape",
          paint: {
            "fill-extrusion-color": "#ff7e5f",
            "fill-extrusion-height": ["coalesce", ["get", "height"], 40],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.8,
          },
        });
      }
    };

    const handleStyleLoad = () => {
      ensureUserSourceAndLayer();
      ensurePolygonBuildingsLayer(map);
      ensureRectanglePreviewLayer(map);
      updatePolygonBuildingsSource(map, polygonBuildingsRef.current);
      ensureTrafficParticleLayer(map);
      bringTrafficParticlesToFront(map);

      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (layer) => layer.type === "symbol" && layer.layout && layer.layout["text-field"],
      )?.id;

      if (!map.getLayer("add-3d-buildings")) {
        map.addLayer(
          {
            id: "add-3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 15,
            paint: {
              "fill-extrusion-color": "#aaa",
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                15.05,
                ["get", "height"],
              ],
              "fill-extrusion-base": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                15.05,
                ["get", "min_height"],
              ],
              "fill-extrusion-opacity": 0.6,
            },
          },
          labelLayerId,
        );
      }

      void refreshCustomBuildings();
      void loadRoadNetwork(map).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown road load error";
        setStatusText(`Road load failed: ${message}`);
      });

      // Initialize Draw Polygon control (positioned below navigation controls on left)
      const drawControl = new DrawPolygonControl((active) => {
        console.log(`✏️ [DRAW POLYGON] Mode ${active ? "enabled" : "disabled"}`);
        setDrawMode(active);
        if (active) {
          setBuildingMode(false);
          rectangleDragActiveRef.current = false;
          rectangleDragStartRef.current = null;
          rectangleDragCurrentRef.current = null;
          rectFirstCornerRef.current = null;
          setRectFirstCorner(null);
          clearRectanglePreview(map);
        }
      });
    
      drawControlRef.current = drawControl;

      // Handle polygon draw events - convert to 3D buildings
      const draw = drawControl.getDraw();
      const handlePolygonCreate = (e: any) => {
        console.log("🏗️ [POLYGON DRAW] Polygon created, converting to 3D building...", e);
        const feature = e.features[0];
        if (feature && feature.geometry.type === "Polygon") {
          const buildingId = feature.id || `polygon-${Date.now()}`;
          const buildingHeight = feature.properties?.height ?? 40;
          const buildingFeature: GeoJSON.Feature = {
            ...feature,
            id: buildingId,
            properties: {
              ...feature.properties,
              height: buildingHeight,
              type: "polygon-building",
              baseHeight: 0,
            },
          };

          addPolygonBuilding(map, buildingFeature);
          scheduleSimulation(0);

          if (draw) {
            draw.delete(feature.id);
          }
          console.log(`✅ [POLYGON DRAW] Building created with height ${buildingHeight}m`);
        }
      };

      const handlePolygonUpdate = (e: any) => {
        console.log("🔄 [POLYGON DRAW] Polygon updated", e);
      };

      const handlePolygonDelete = (e: any) => {
        console.log("🗑️ [POLYGON DRAW] Polygon deleted", e);
        const removedIds = new Set<string>(e.features.map((feature: any) => String(feature.id)));
        setPolygonBuildings((prev) => {
          const next = new Map<string, GeoJSON.Feature>(prev);
          removedIds.forEach((featureId) => {
            if (next.has(featureId)) {
              console.log("[BUILDING DELETE] Removed polygon building", { id: featureId });
            }
            next.delete(featureId);
          });
          polygonBuildingsRef.current = next;
          updatePolygonBuildingsSource(map, next);
          return next;
        });
        const selectedId = selectedPolygonBuildingIdRef.current;
        if (selectedId && removedIds.has(selectedId)) {
          selectedPolygonBuildingIdRef.current = null;
          setSelectedPolygonBuildingId(null);
        }
        scheduleSimulation(0);
      };

      if (draw) {
        map.on("draw.create", handlePolygonCreate);
        map.on("draw.update", handlePolygonUpdate);
        map.on("draw.delete", handlePolygonDelete);
      }

      // Store handlers for cleanup
      (map as any)._polygonHandlers = { create: handlePolygonCreate, update: handlePolygonUpdate, delete: handlePolygonDelete };
    };

    const handleMapMouseDown = (event: maplibregl.MapMouseEvent) => {
      if (!buildingModeRef.current || drawModeRef.current) {
        return;
      }
      const dragStart: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      rectangleDragActiveRef.current = true;
      rectangleDragStartRef.current = dragStart;
      rectangleDragCurrentRef.current = dragStart;
      rectFirstCornerRef.current = dragStart;
      setRectFirstCorner(dragStart);
      const heightValue = Math.max(1, Number.parseFloat(rectHeightRef.current) || 20);
      updateRectanglePreview(map, dragStart, dragStart, heightValue);
      setStatusText("Drag to define building footprint.");
    };

    const handleMapMouseUp = (event: maplibregl.MapMouseEvent) => {
      if (!rectangleDragActiveRef.current) {
        return;
      }
      rectangleDragActiveRef.current = false;
      const dragStart = rectangleDragStartRef.current;
      rectangleDragStartRef.current = null;
      rectangleDragCurrentRef.current = null;
      rectFirstCornerRef.current = null;
      setRectFirstCorner(null);
      clearRectanglePreview(map);
      if (!dragStart) {
        return;
      }

      const dragEnd: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      if (rectangleAreaTooSmall(dragStart, dragEnd)) {
        setStatusText("Building not added. Drag a larger rectangle.");
        return;
      }

      const heightValue = Math.max(1, Number.parseFloat(rectHeightRef.current) || 20);
      const buildingId = `rect-${Date.now()}`;
      const buildingFeature = createRectangleFeature(buildingId, dragStart, dragEnd, heightValue, true);
      addPolygonBuilding(map, buildingFeature);
      scheduleSimulation(0);
      setStatusText(`Building created (height ${heightValue}m).`);
    };

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const buildingFeatures = map.queryRenderedFeatures(event.point, {
        layers: [POLYGON_BUILDINGS_LAYER_ID],
      });
      if (buildingFeatures.length > 0) {
        const buildingId = extractBuildingId(buildingFeatures[0]);
        if (buildingId) {
          setPolygonBuildingSelection(map, buildingId);
        }
        return;
      }

      if (buildingModeRef.current || drawModeRef.current) {
        return;
      }

      if (selectedPolygonBuildingIdRef.current) {
        setPolygonBuildingSelection(map, null);
      }

      if (!map.getLayer(ROAD_LAYER_IDS.heat)) {
        return;
      }
      const tolerance = 8;
      const features = map.queryRenderedFeatures(
        [
          [event.point.x - tolerance, event.point.y - tolerance],
          [event.point.x + tolerance, event.point.y + tolerance],
        ],
        { layers: [ROAD_LAYER_IDS.heat] },
      ) as unknown as FeatureLike[];
      if (features.length === 0) {
        return;
      }

      let selectedFeature = features[0];
      let selectedDistance = featureDistance2InPixels(
        map,
        selectedFeature,
        event.point.x,
        event.point.y,
      );
      for (let idx = 1; idx < features.length; idx += 1) {
        const candidate = features[idx];
        const distance = featureDistance2InPixels(map, candidate, event.point.x, event.point.y);
        if (distance < selectedDistance) {
          selectedDistance = distance;
          selectedFeature = candidate;
        }
      }

      const featureIndex = extractFeatureIndex(selectedFeature);
      if (featureIndex === null) {
        return;
      }

      if (manualClosedFeaturesRef.current.has(featureIndex)) {
        manualClosedFeaturesRef.current.delete(featureIndex);
      } else {
        manualClosedFeaturesRef.current.add(featureIndex);
      }
      scheduleSimulation();
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      setCursorCoordinates({
        lng: Number(event.lngLat.lng.toFixed(6)),
        lat: Number(event.lngLat.lat.toFixed(6)),
      });

      if (rectangleDragActiveRef.current) {
        const dragStart = rectangleDragStartRef.current;
        if (dragStart) {
          const dragCurrent: [number, number] = [event.lngLat.lng, event.lngLat.lat];
          rectangleDragCurrentRef.current = dragCurrent;
          const heightValue = Math.max(1, Number.parseFloat(rectHeightRef.current) || 20);
          updateRectanglePreview(map, dragStart, dragCurrent, heightValue);
        }
        map.getCanvas().style.cursor = "crosshair";
        return;
      }

      if (buildingModeRef.current && !drawModeRef.current) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }

      const buildingFeatures = map.queryRenderedFeatures(event.point, {
        layers: [POLYGON_BUILDINGS_LAYER_ID],
      });
      if (buildingFeatures.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        return;
      }

      if (!map.getLayer(ROAD_LAYER_IDS.heat)) {
        map.getCanvas().style.cursor = "";
        return;
      }
      const hovered = map.queryRenderedFeatures(event.point, {
        layers: [ROAD_LAYER_IDS.heat],
      });
      map.getCanvas().style.cursor = hovered.length > 0 ? "pointer" : "";
    };

    const handleMouseLeave = () => {
      setCursorCoordinates(null);
      map.getCanvas().style.cursor = buildingModeRef.current ? "crosshair" : "";
    };

    map.on("style.load", handleStyleLoad);
    map.on("mousedown", handleMapMouseDown);
    map.on("mouseup", handleMapMouseUp);
    map.on("click", handleMapClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseLeave);

    return () => {
      if (recomputeTimerRef.current !== null) {
        window.clearTimeout(recomputeTimerRef.current);
      }
      stopTrafficParticleAnimation();
      trafficParticlesRef.current = [];
      trafficRoutePoolRef.current = [];
      trafficEdgeMetricsRef.current = new Map();
      if (drawControlRef.current) {
        const handlers = (map as any)._polygonHandlers;
        if (handlers) {
          map.off("draw.create", handlers.create);
          map.off("draw.update", handlers.update);
          map.off("draw.delete", handlers.delete);
        }
        map.removeControl(drawControlRef.current);
      }
      try {
        detach();
      } catch {
        // no-op
      }
      map.off("style.load", handleStyleLoad);
      map.off("mousedown", handleMapMouseDown);
      map.off("mouseup", handleMapMouseUp);
      map.off("click", handleMapClick);
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", handleMouseLeave);
      map.getCanvas().style.cursor = "";
      map.remove();
      mapRef.current = null;
    };
  }, [
    addPolygonBuilding,
    bringTrafficParticlesToFront,
    clearRectanglePreview,
    ensureRectanglePreviewLayer,
    ensurePolygonBuildingsLayer,
    ensureTrafficParticleLayer,
    loadRoadNetwork,
    mapStyle,
    refreshCustomBuildings,
    scheduleSimulation,
    setPolygonBuildingSelection,
    stopTrafficParticleAnimation,
    updateRectanglePreview,
    updatePolygonBuildingsSource,
  ]);

  const handleResetClosures = useCallback(() => {
    console.log("🔄 [RESET CLOSURES] Clearing all road closures...");
    if (manualClosedFeaturesRef.current.size === 0) {
      console.log("ℹ️ [RESET CLOSURES] No manual closures to reset");
      scheduleSimulation(0);
      return;
    }
    const closedCount = manualClosedFeaturesRef.current.size;
    manualClosedFeaturesRef.current.clear();
    console.log(`✅ [RESET CLOSURES] Cleared ${closedCount} manual road closures`);
    scheduleSimulation(0);
  }, [scheduleSimulation]);

  const handleManualRecompute = useCallback(() => {
    console.log("🔄 [MANUAL RECOMPUTE] User triggered recompute");
    scheduleSimulation(0);
  }, [scheduleSimulation]);

  // Building placement handlers
  const handleToggleBuildingMode = useCallback(() => {
    console.log("[BUILD MODE] Toggling build mode");
    setBuildingMode((prev) => {
      const newMode = !prev;
      if (newMode) {
        console.log("[BUILD MODE] Enabled");
        setDrawMode(false);
        drawControlRef.current?.setActive(false);
      } else {
        console.log("[BUILD MODE] Disabled");
      }
      return newMode;
    });
  }, []);

  const handleDeleteSelectedBuilding = useCallback(() => {
    const selectedId = selectedPolygonBuildingIdRef.current;
    const map = mapRef.current;
    if (!selectedId || !map) {
      return;
    }

    setPolygonBuildings((prev) => {
      if (!prev.has(selectedId)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(selectedId);
      polygonBuildingsRef.current = next;
      updatePolygonBuildingsSource(map, next);
      return next;
    });

    selectedPolygonBuildingIdRef.current = null;
    setSelectedPolygonBuildingId(null);
    console.log("[BUILDING DELETE] Deleted selected building", { id: selectedId });
    scheduleSimulation(0);
    setStatusText("Selected building deleted.");
  }, [scheduleSimulation, updatePolygonBuildingsSource]);

  const handleRectHeightChange = useCallback(
    (value: string) => {
      setRectHeight(value);
      const heightValue = clampNumber(Math.max(1, Number.parseFloat(value) || 20), 1, 300);
      const map = mapRef.current;
      const selectedId = selectedPolygonBuildingIdRef.current;

      if (map && rectangleDragActiveRef.current) {
        const dragStart = rectangleDragStartRef.current;
        const dragCurrent = rectangleDragCurrentRef.current;
        if (dragStart && dragCurrent) {
          updateRectanglePreview(map, dragStart, dragCurrent, heightValue);
        }
      }

      if (!map || !selectedId) {
        return;
      }

      setPolygonBuildings((prev) => {
        const selectedFeature = prev.get(selectedId);
        if (!selectedFeature) {
          return prev;
        }
        const next = new Map(prev);
        const properties = asPropertiesRecord(selectedFeature.properties);
        next.set(selectedId, {
          ...selectedFeature,
          properties: {
            ...properties,
            height: heightValue,
            selected: true,
          },
        });
        polygonBuildingsRef.current = next;
        updatePolygonBuildingsSource(map, next);
        return next;
      });

      console.log("[BUILDING UPDATE] Updated selected building height", {
        id: selectedId,
        height: heightValue,
      });
      scheduleSimulation(120);
    },
    [scheduleSimulation, updatePolygonBuildingsSource, updateRectanglePreview],
  );

  useEffect(() => {
    const handleBackspaceDelete = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || !selectedPolygonBuildingIdRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        const isEditableElement =
          target.isContentEditable ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT";
        if (isEditableElement) {
          return;
        }
      }

      event.preventDefault();
      handleDeleteSelectedBuilding();
    };

    window.addEventListener("keydown", handleBackspaceDelete);
    return () => {
      window.removeEventListener("keydown", handleBackspaceDelete);
    };
  }, [handleDeleteSelectedBuilding]);

  return (
    <div className="app-shell">
      <div ref={mapContainerRef} className="map-container" />

      <section className="controls">
        <h1>Toronto Reactive Traffic Heatmap</h1>
        <p className="status">{isComputing ? "Computing..." : statusText}</p>
        <div className="actions">
          <button type="button" onClick={handleManualRecompute}>
            Recompute
          </button>
          <button type="button" onClick={handleResetClosures}>
            Reset Closures
          </button>
          <button
            type="button"
            onClick={handleToggleBuildingMode}
            style={{
              backgroundColor: buildingMode ? "#28a745" : "#6c757d",
              color: "white",
            }}
          >
            {buildingMode ? "Switch to Free Move" : "Switch to Build Mode"}
          </button>
        </div>
        <div className="stats">
          <div>Nodes: {stats.nodes}</div>
          <div>Directed edges: {stats.directedEdges}</div>
          <div>Trips/sample: {stats.trips}</div>
          <div>Probe trips: {stats.probeTrips}</div>
          <div>Closed roads: {stats.closed}</div>
          <div>Closure seed nodes: {stats.closureSeedNodes}</div>
          <div>Last run: {stats.runtimeMs} ms</div>
          <div>Unreachable trips: {stats.unreachable}</div>
        </div>
        <p className="hint">
          {buildingMode
            ? rectFirstCorner
              ? "Build mode: drag to finish this building footprint."
              : "Build mode: click and drag once to create a building footprint."
            : drawMode
              ? "Polygon draw mode active."
              : "Free move mode: click roads to toggle closures and click buildings to select."}
        </p>
        <div className="legend">
          <span className="chip flow-good">delay 1.0</span>
          <span className="chip flow-mid">delay 1.3+</span>
          <span className="chip flow-high">delay 1.8+</span>
          <span className="chip flow-closed">closed</span>
          <span className="chip flow-live">live flow</span>
        </div>
      </section>

      <section className="shape-panel">
        <h2>Add Building</h2>
        <div className="shape-row">
          <label htmlFor="shape-height">
            Height: {Math.max(1, Number.parseFloat(rectHeight) || 20).toFixed(0)} m
          </label>
          <input
            id="shape-height"
            type="range"
            min="1"
            max="300"
            step="1"
            value={Math.max(1, Number.parseFloat(rectHeight) || 20)}
            onChange={(e) => handleRectHeightChange(e.target.value)}
          />
        </div>
        <p className="shape-help">
          {selectedPolygonBuildingId
            ? `Selected: ${selectedPolygonBuildingId}`
            : "No building selected. Click one to select it."}
        </p>
        <button
          type="button"
          className="shape-cancel"
          onClick={handleDeleteSelectedBuilding}
          disabled={!selectedPolygonBuildingId}
        >
          Delete Selected Building
        </button>
      </section>

      <SimulationResultsPanel
        stats={stats}
        isVisible={showResultsPanel}
        onClose={() => setShowResultsPanel(false)}
        buildingCount={polygonBuildings.size}
        closedRoads={stats.closed}
      />

      {cursorCoordinates && (
        <div className="coordinate-display">
          <div className="coordinate-label">Coordinates</div>
          <div className="coordinate-value">
            <span className="coord-lng">{cursorCoordinates.lng.toFixed(6)}</span>
            <span className="coord-separator">, </span>
            <span className="coord-lat">{cursorCoordinates.lat.toFixed(6)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
