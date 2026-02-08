import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { BuildingInput } from "./components/BuildingInput";
import { attachDraw } from "./map/draw";
import { addRoadLayers, ROAD_LAYER_IDS, updateRoadSourceData } from "./map/layers";
import { buildGraphFromGeoJSON } from "./traffic/graph";
import {
  assignTraffic,
  countDisconnectedTrips,
  generateOD,
  generateODFromOrigins,
  generateReachabilityProbe,
  getClosedFeatureNodeIds,
} from "./traffic/model";
import type { Graph, ODPair, RoadFeatureProperties } from "./traffic/types";
import { applyMetricsToRoads } from "./traffic/updateGeo";
import { fetchAndConvertMapboxStyle, type MapboxStyle } from "./utils/mapbox-style-converter";

type RoadCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>;

interface SimulationStats {
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

const INITIAL_CENTER: [number, number] = [-79.385, 43.65];
const INITIAL_ZOOM = 12.8;
const PITCH = 45;
const BEARING = -12;

const TORONTO_BOUNDS: [[number, number], [number, number]] = [
  [-79.6, 43.58],
  [-79.2, 43.85],
];
const MIN_ZOOM = 9;
const MAX_ZOOM = 18;

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

export default function App() {
  const mapboxToken =
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
    (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined);
  const hasToken = typeof mapboxToken === "string" && mapboxToken.trim().length > 0;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const roadsRef = useRef<RoadCollection | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const odPairsRef = useRef<ODPair[]>([]);
  const probePairsRef = useRef<ODPair[]>([]);
  const sampleSignatureRef = useRef("");
  const closureSeedNodeCountRef = useRef(0);
  const closedFeaturesRef = useRef<Set<number>>(new Set<number>());
  const recomputeTimerRef = useRef<number | null>(null);

  const [mapStyle, setMapStyle] = useState<MapboxStyle | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [cursorCoordinates, setCursorCoordinates] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const [statusText, setStatusText] = useState(
    hasToken ? "Waiting for map..." : "Missing VITE_MAPBOX_TOKEN in .env.",
  );
  const [isComputing, setIsComputing] = useState(false);
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);

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
    const map = mapRef.current;
    const roads = roadsRef.current;
    const graph = graphRef.current;
    if (!map || !roads || !graph) {
      return;
    }

    setIsComputing(true);

    const sampleSignature = Array.from(closedFeaturesRef.current)
      .sort((a, b) => a - b)
      .join(",");
    if (sampleSignature !== sampleSignatureRef.current) {
      const adaptiveSamples = buildAdaptiveSamples(graph, closedFeaturesRef.current);
      odPairsRef.current = adaptiveSamples.odPairs;
      closureSeedNodeCountRef.current = adaptiveSamples.closureSeedNodes;
      sampleSignatureRef.current = sampleSignature;
    }

    const start = performance.now();
    const result = assignTraffic(graph, closedFeaturesRef.current, odPairsRef.current, 2);
    const unreachableTrips = countDisconnectedTrips(
      graph,
      closedFeaturesRef.current,
      probePairsRef.current,
    );
    const updatedRoads = applyMetricsToRoads(roads, result.featureMetrics);
    updateRoadSourceData(map, updatedRoads);
    const runtimeMs = Math.round(performance.now() - start);

    setStats({
      nodes: graph.nodes.size,
      directedEdges: graph.edges.length,
      trips: odPairsRef.current.length,
      probeTrips: probePairsRef.current.length,
      closed: closedFeaturesRef.current.size,
      closureSeedNodes: closureSeedNodeCountRef.current,
      runtimeMs,
      unreachable: unreachableTrips,
    });

    setStatusText(
      `Heatmap updated in ${runtimeMs} ms (${odPairsRef.current.length} OD / ${probePairsRef.current.length} fixed probes).`,
    );
    setIsComputing(false);
  }, [buildAdaptiveSamples]);

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

      const graph = buildGraphFromGeoJSON(roads);
      graphRef.current = graph;

      const adaptiveSamples = buildAdaptiveSamples(graph, closedFeaturesRef.current);
      odPairsRef.current = adaptiveSamples.odPairs;
      const stableProbeCount = Math.max(1200, Math.min(3200, Math.round(graph.nodes.size * 0.35)));
      probePairsRef.current = generateReachabilityProbe(graph, stableProbeCount);
      closureSeedNodeCountRef.current = adaptiveSamples.closureSeedNodes;
      sampleSignatureRef.current = "";

      const start = performance.now();
      const baseline = assignTraffic(graph, closedFeaturesRef.current, odPairsRef.current, 2);
      const unreachableTrips = countDisconnectedTrips(
        graph,
        closedFeaturesRef.current,
        probePairsRef.current,
      );
      const roadsWithMetrics = applyMetricsToRoads(roads, baseline.featureMetrics);
      addRoadLayers(map, roadsWithMetrics);
      const runtimeMs = Math.round(performance.now() - start);

      setStats({
        nodes: graph.nodes.size,
        directedEdges: graph.edges.length,
        trips: odPairsRef.current.length,
        probeTrips: probePairsRef.current.length,
        closed: 0,
        closureSeedNodes: adaptiveSamples.closureSeedNodes,
        runtimeMs,
        unreachable: unreachableTrips,
      });
      setStatusText(
        `Loaded ${roads.features.length} roads, ${graph.nodes.size} nodes, ${odPairsRef.current.length} OD trips.`,
      );
    },
    [buildAdaptiveSamples],
  );

  useEffect(() => {
    if (!hasToken || !mapboxToken) {
      return;
    }

    fetchAndConvertMapboxStyle("mapbox://styles/mapbox/streets-v11", mapboxToken)
      .then((style) => setMapStyle(style))
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown style load error";
        setStatusText(`Style load failed: ${message}`);
      });
  }, [hasToken, mapboxToken]);

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
      style: mapStyle as unknown as maplibregl.StyleSpecification,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      maxBounds: TORONTO_BOUNDS,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      antialias: true,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
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
    };

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
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

      if (closedFeaturesRef.current.has(featureIndex)) {
        closedFeaturesRef.current.delete(featureIndex);
      } else {
        closedFeaturesRef.current.add(featureIndex);
      }
      scheduleSimulation();
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      setCursorCoordinates({
        lng: Number(event.lngLat.lng.toFixed(6)),
        lat: Number(event.lngLat.lat.toFixed(6)),
      });

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
      map.getCanvas().style.cursor = "";
    };

    map.on("style.load", handleStyleLoad);
    map.on("click", handleMapClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseLeave);

    return () => {
      if (recomputeTimerRef.current !== null) {
        window.clearTimeout(recomputeTimerRef.current);
      }
      try {
        detach();
      } catch {
        // no-op
      }
      map.off("style.load", handleStyleLoad);
      map.off("click", handleMapClick);
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", handleMouseLeave);
      map.getCanvas().style.cursor = "";
      map.remove();
      mapRef.current = null;
    };
  }, [loadRoadNetwork, mapStyle, refreshCustomBuildings, scheduleSimulation]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      void refreshCustomBuildings();
    }
  }, [refreshCustomBuildings, refreshTrigger]);

  const handleBuildingAdded = useCallback(() => {
    setRefreshTrigger((previous) => previous + 1);
  }, []);

  const handleResetClosures = useCallback(() => {
    if (closedFeaturesRef.current.size === 0) {
      return;
    }
    closedFeaturesRef.current.clear();
    scheduleSimulation(0);
  }, [scheduleSimulation]);

  const handleManualRecompute = useCallback(() => {
    scheduleSimulation(0);
  }, [scheduleSimulation]);

  return (
    <div className="app-shell">
      <div id="map-container" ref={mapContainerRef} />
      <BuildingInput onBuildingAdded={handleBuildingAdded} />

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
        <p className="hint">Click a road to toggle closure and reroute traffic.</p>
        <div className="legend">
          <span className="chip flow-good">delay 1.0</span>
          <span className="chip flow-mid">delay 1.3+</span>
          <span className="chip flow-high">delay 1.8+</span>
          <span className="chip flow-closed">closed</span>
        </div>
      </section>

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
