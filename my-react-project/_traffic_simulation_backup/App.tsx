import { useCallback, useEffect, useRef, useState } from "react";
import type { Map, MapboxGeoJSONFeature, MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import "./App.css";
import { initMap } from "./map/initMap";
import { addRoadLayers, ROAD_LAYER_IDS, updateRoadSourceData } from "./map/layers";
import { buildGraphFromGeoJSON } from "./traffic/graph";
import {
  assignTraffic,
  countDisconnectedTrips,
  generateOD,
  generateReachabilityProbe,
} from "./traffic/model";
import type { Graph, ODPair, RoadFeatureProperties } from "./traffic/types";
import { applyMetricsToRoads } from "./traffic/updateGeo";

type RoadCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>;

interface SimulationStats {
  nodes: number;
  directedEdges: number;
  trips: number;
  probeTrips: number;
  closed: number;
  runtimeMs: number;
  unreachable: number;
}

const DEFAULT_STATS: SimulationStats = {
  nodes: 0,
  directedEdges: 0,
  trips: 0,
  probeTrips: 0,
  closed: 0,
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
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: { ...(feature.properties ?? {}) },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function extractFeatureIndex(feature: MapboxGeoJSONFeature): number | null {
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
  map: Map,
  feature: MapboxGeoJSONFeature,
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
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const hasToken = typeof token === "string" && token.trim().length > 0;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const roadsRef = useRef<RoadCollection | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const odPairsRef = useRef<ODPair[]>([]);
  const probePairsRef = useRef<ODPair[]>([]);
  const closedFeaturesRef = useRef<Set<number>>(new Set<number>());
  const recomputeTimerRef = useRef<number | null>(null);

  const [statusText, setStatusText] = useState(
    hasToken ? "Waiting for map..." : "Missing VITE_MAPBOX_TOKEN in .env.",
  );
  const [isComputing, setIsComputing] = useState(false);
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);

  const runSimulation = useCallback(() => {
    const map = mapRef.current;
    const roads = roadsRef.current;
    const graph = graphRef.current;
    if (!map || !roads || !graph) {
      return;
    }

    setIsComputing(true);
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
      runtimeMs,
      unreachable: unreachableTrips,
    });

    setStatusText(
      `Heatmap updated in ${runtimeMs} ms (${closedFeaturesRef.current.size} closed segments).`,
    );
    setIsComputing(false);
  }, []);

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

  const loadRoadNetwork = useCallback(async (map: Map) => {
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

    const tripCount = Math.max(180, Math.min(320, Math.round(graph.edges.length / 40)));
    const odPairs = generateOD(graph, tripCount);
    odPairsRef.current = odPairs;
    const probeCount = Math.max(800, Math.min(1800, Math.round(graph.nodes.size * 0.25)));
    const probePairs = generateReachabilityProbe(graph, probeCount);
    probePairsRef.current = probePairs;

    const start = performance.now();
    const baseline = assignTraffic(graph, closedFeaturesRef.current, odPairs, 2);
    const unreachableTrips = countDisconnectedTrips(graph, closedFeaturesRef.current, probePairs);
    const roadsWithMetrics = applyMetricsToRoads(roads, baseline.featureMetrics);
    addRoadLayers(map, roadsWithMetrics);
    const runtimeMs = Math.round(performance.now() - start);

    setStats({
      nodes: graph.nodes.size,
      directedEdges: graph.edges.length,
      trips: odPairs.length,
      probeTrips: probePairs.length,
      closed: 0,
      runtimeMs,
      unreachable: unreachableTrips,
    });
    setStatusText(
      `Loaded ${roads.features.length} roads, ${graph.nodes.size} nodes, ${odPairs.length} OD trips.`,
    );
  }, []);

  useEffect(() => {
    if (!hasToken || !token) {
      return;
    }

    const container = mapContainerRef.current;
    if (!container) {
      return;
    }

    const map = initMap(container, token);
    mapRef.current = map;

    const handleLoad = () => {
      void loadRoadNetwork(map).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown load error";
        setStatusText(`Load failed: ${message}`);
      });
    };

    const handleMapClick = (event: MapMouseEvent) => {
      if (!map.getLayer(ROAD_LAYER_IDS.heat)) {
        return;
      }
      const tolerance = 8;
      const features = map.queryRenderedFeatures(
        [
          [event.point.x - tolerance, event.point.y - tolerance],
          [event.point.x + tolerance, event.point.y + tolerance],
        ],
        {
          layers: [ROAD_LAYER_IDS.heat],
        },
      );
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

    const handleMapMove = (event: MapMouseEvent) => {
      if (!map.getLayer(ROAD_LAYER_IDS.heat)) {
        map.getCanvas().style.cursor = "";
        return;
      }
      const hovered = map.queryRenderedFeatures(event.point, {
        layers: [ROAD_LAYER_IDS.heat],
      });
      map.getCanvas().style.cursor = hovered.length > 0 ? "pointer" : "";
    };

    map.on("load", handleLoad);
    map.on("click", handleMapClick);
    map.on("mousemove", handleMapMove);

    return () => {
      if (recomputeTimerRef.current !== null) {
        window.clearTimeout(recomputeTimerRef.current);
      }
      map.off("load", handleLoad);
      map.off("click", handleMapClick);
      map.off("mousemove", handleMapMove);
      map.getCanvas().style.cursor = "";
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken, loadRoadNetwork, scheduleSimulation, token]);

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
        </div>
        <div className="stats">
          <div>Nodes: {stats.nodes}</div>
          <div>Directed edges: {stats.directedEdges}</div>
          <div>Trips/sample: {stats.trips}</div>
          <div>Probe trips: {stats.probeTrips}</div>
          <div>Closed roads: {stats.closed}</div>
          <div>Last run: {stats.runtimeMs} ms</div>
          <div>Unreachable trips: {stats.unreachable}</div>
        </div>
        <p className="hint">Click a road to toggle closure and reroute traffic.</p>
      </section>
    </div>
  );
}
