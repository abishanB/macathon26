import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "./App.css";
import { BuildingInput } from "./components/BuildingInput";
import { attachDraw } from "./map/draw";
import { DrawPolygonControl } from "./map/DrawPolygonControl";
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
import type { FeatureMetric, Graph, ODPair, RoadFeatureProperties } from "./traffic/types";
import { applyMetricsToRoads } from "./traffic/updateGeo";
import { extractBuildingContext } from "./traffic/buildingContext";
import { BuildingPlacer } from "./map/buildingPlacer";
import { BuildingControls } from "./components/BuildingControls";
import { BuildingInfoModal } from "./components/BuildingInfoModal";
import { ImpactReportModal } from "./components/ImpactReportModal";
import { SimulationResultsPanel } from "./components/SimulationResultsPanel";
import type { Building, BuildingFormData, ImpactAnalysis } from "./types/building";
import { getBackboardClient } from "./lib/backboard";
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
const FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";

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
  const closedFeaturesRef = useRef<Set<number>>(new Set<number>());
  const featureMetricsRef = useRef<Map<number, FeatureMetric>>(new Map());
  const recomputeTimerRef = useRef<number | null>(null);
  const buildingPlacerRef = useRef<BuildingPlacer | null>(null);
  const drawControlRef = useRef<DrawPolygonControl | null>(null);

  const [mapStyle, setMapStyle] = useState<MapboxStyle | string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [cursorCoordinates, setCursorCoordinates] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const [statusText, setStatusText] = useState(
    hasToken ? "Waiting for map..." : "No Mapbox token found. Loading fallback map style...",
  );
  const [isComputing, setIsComputing] = useState(false);
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);

  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [showBuildingInfo, setShowBuildingInfo] = useState(false);
  const [showImpactReport, setShowImpactReport] = useState(false);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [buildingMode, setBuildingMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [polygonBuildings, setPolygonBuildings] = useState<Map<string, GeoJSON.Feature>>(new Map());

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
      closed: closedFeaturesRef.current.size,
    });

    setIsComputing(true);
    setShowResultsPanel(true);

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
    featureMetricsRef.current = result.featureMetrics;
    const unreachableTrips = countDisconnectedTrips(
      graph,
      closedFeaturesRef.current,
      probePairsRef.current,
    );
    const updatedRoads = applyMetricsToRoads(roads, result.featureMetrics);
    updateRoadSourceData(map, updatedRoads);
    const runtimeMs = Math.round(performance.now() - start);

    const newStats = {
      nodes: graph.nodes.size,
      directedEdges: graph.edges.length,
      trips: odPairsRef.current.length,
      probeTrips: probePairsRef.current.length,
      closed: closedFeaturesRef.current.size,
      closureSeedNodes: closureSeedNodeCountRef.current,
      runtimeMs,
      unreachable: unreachableTrips,
    };

    setStats(newStats);

    console.log("✅ [RECOMPUTE] Simulation complete:", {
      runtime: `${runtimeMs}ms`,
      closedSegments: closedFeaturesRef.current.size,
      unreachableTrips,
      avgDelay: ((unreachableTrips / odPairsRef.current.length) * 100).toFixed(1) + "%",
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

      // Initialize building placer
      const placer = new BuildingPlacer(map, {
        onBuildingPlaced: (building) => {
          console.log("Building placed:", building);
          setSelectedBuilding(building);
          setBuildingMode(false); // Exit building mode after placement
        },
        onBuildingSelected: (building) => {
          setSelectedBuilding(building);
        },
        onBuildingUpdated: (building) => {
          setSelectedBuilding(building);
        },
      });
      buildingPlacerRef.current = placer;

      // Initialize Draw Polygon control (positioned below navigation controls on left)
      const drawControl = new DrawPolygonControl((active) => {
        console.log(`✏️ [DRAW POLYGON] Mode ${active ? "enabled" : "disabled"}`);
        setDrawMode(active);
        if (active) {
          setBuildingMode(false);
          buildingPlacerRef.current?.disablePlacementMode();
        }
      });
      map.addControl(drawControl, "top-left");
      drawControlRef.current = drawControl;

      // Handle polygon draw events - convert to 3D buildings
      const draw = drawControl.getDraw();
      const handlePolygonCreate = (e: any) => {
        console.log("🏗️ [POLYGON DRAW] Polygon created, converting to 3D building...", e);
        const feature = e.features[0];
        if (feature && feature.geometry.type === "Polygon") {
          const buildingId = feature.id || `polygon-${Date.now()}`;
          const buildingFeature: GeoJSON.Feature = {
            ...feature,
            id: buildingId,
            properties: {
              ...feature.properties,
              height: feature.properties?.height || 40,
              type: "polygon-building",
              baseHeight: 0,
            },
          };

          setPolygonBuildings((prev) => {
            const newMap = new Map(prev);
            newMap.set(String(buildingId), buildingFeature);
            return newMap;
          });

          const source = map.getSource("polygon-buildings") as maplibregl.GeoJSONSource;
          if (!source) {
            map.addSource("polygon-buildings", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [buildingFeature],
              },
            });

            map.addLayer({
              id: "polygon-buildings-3d",
              type: "fill-extrusion",
              source: "polygon-buildings",
              paint: {
                "fill-extrusion-color": "#4A90E2",
                "fill-extrusion-height": ["get", "height"],
                "fill-extrusion-base": ["get", "baseHeight"],
                "fill-extrusion-opacity": 0.8,
              },
            });

            map.addLayer({
              id: "polygon-buildings-outline",
              type: "line",
              source: "polygon-buildings",
              paint: {
                "line-color": "#2E5C8A",
                "line-width": 2,
              },
            });
          } else {
            const currentData = source._data as unknown as GeoJSON.FeatureCollection;
            source.setData({
              ...currentData,
              features: [...currentData.features, buildingFeature],
            });
          }

          if (draw) {
            draw.delete(feature.id);
          }
          console.log(`✅ [POLYGON DRAW] Building created with height ${buildingFeature.properties?.height || 40}m`);
        }
      };

      const handlePolygonUpdate = (e: any) => {
        console.log("🔄 [POLYGON DRAW] Polygon updated", e);
      };

      const handlePolygonDelete = (e: any) => {
        console.log("🗑️ [POLYGON DRAW] Polygon deleted", e);
        e.features.forEach((feature: any) => {
          setPolygonBuildings((prev) => {
            const newMap = new Map(prev);
            newMap.delete(String(feature.id));
            return newMap;
          });
        });
      };

      if (draw) {
        map.on("draw.create", handlePolygonCreate);
        map.on("draw.update", handlePolygonUpdate);
        map.on("draw.delete", handlePolygonDelete);
      }

      // Store handlers for cleanup
      (map as any)._polygonHandlers = { create: handlePolygonCreate, update: handlePolygonUpdate, delete: handlePolygonDelete };
    };

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const buildingFeatures = map.queryRenderedFeatures(event.point, {
        layers: ["placed-buildings-3d"],
      });
      if (buildingFeatures.length > 0) {
        return;
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

      const buildingFeatures = map.queryRenderedFeatures(event.point, {
        layers: ["placed-buildings-3d"],
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
      buildingPlacerRef.current?.destroy();
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
    console.log("🔄 [RESET CLOSURES] Clearing all road closures...");
    if (closedFeaturesRef.current.size === 0) {
      console.log("ℹ️ [RESET CLOSURES] No closures to reset");
      return;
    }
    const closedCount = closedFeaturesRef.current.size;
    closedFeaturesRef.current.clear();
    console.log(`✅ [RESET CLOSURES] Cleared ${closedCount} road closures`);
    scheduleSimulation(0);
  }, [scheduleSimulation]);

  const handleManualRecompute = useCallback(() => {
    console.log("🔄 [MANUAL RECOMPUTE] User triggered recompute");
    scheduleSimulation(0);
  }, [scheduleSimulation]);

  // Building placement handlers
  const handleToggleBuildingMode = useCallback(() => {
    console.log("🏗️ [BUILDING MODE] Toggling building placement mode...");
    setBuildingMode((prev) => {
      const newMode = !prev;
      if (newMode) {
        console.log("✅ [BUILDING MODE] Enabled - Click map to place building");
        buildingPlacerRef.current?.enablePlacementMode();
        setDrawMode(false); // Disable draw mode when entering building mode
        drawControlRef.current?.setActive(false);
      } else {
        console.log("❌ [BUILDING MODE] Disabled");
        buildingPlacerRef.current?.disablePlacementMode();
      }
      return newMode;
    });
  }, []);

  const handleToggleDrawMode = useCallback(() => {
    drawControlRef.current?.toggle();
  }, []);

  const handleBuildingUpdate = useCallback((updates: Partial<Building>) => {
    if (selectedBuilding) {
      buildingPlacerRef.current?.updateBuilding(selectedBuilding.id, updates);
    }
  }, [selectedBuilding]);

  const handleBuildingDelete = useCallback(() => {
    if (selectedBuilding) {
      buildingPlacerRef.current?.deleteBuilding(selectedBuilding.id);
      setSelectedBuilding(null);
    }
  }, [selectedBuilding]);

  const handleAnalyzeBuilding = useCallback(() => {
    if (selectedBuilding) {
      setShowBuildingInfo(true);
    }
  }, [selectedBuilding]);

  const handleBuildingInfoSubmit = useCallback(async (formData: BuildingFormData) => {
    if (!selectedBuilding) return;

    setShowBuildingInfo(false);
    setIsAnalyzing(true);
    setStatusText("Analyzing construction impact...");

    try {
      // ── Extract spatial + traffic context for this building ─────────────────
      const graph = graphRef.current;
      const roads = roadsRef.current;
      let networkContext: import("./traffic/buildingContext").NetworkContext | undefined;

      if (graph && roads) {
        const footprintM2 = formData.footprintWidth * formData.footprintLength;
        networkContext = extractBuildingContext(
          selectedBuilding.coordinates,
          footprintM2,
          graph,
          featureMetricsRef.current,
          roads,
          400,
          formData.laneClosures,
        );

        // Apply suggested road closures to the live traffic simulation
        for (const fi of networkContext.suggestedClosures) {
          closedFeaturesRef.current.add(fi);
        }
        if (networkContext.suggestedClosures.length > 0) {
          scheduleSimulation(0);
        }
      }

      const client = getBackboardClient();
      const assistant = await client.getOrCreateImprovedAssistant();
      const thread = await client.createThreadForAssistant(assistant.assistant_id);

      const analysis = await client.analyzeConstructionImpact(thread.thread_id, {
        location: selectedBuilding.coordinates,
        buildingType: formData.buildingType,
        stories: formData.stories,
        footprint: formData.footprintWidth * formData.footprintLength,
        duration: formData.constructionDuration,
        laneClosures: formData.laneClosures,
        parkingLost: formData.parkingSpacesLost,
        deliveryTrucks: formData.deliveryTrucksPerDay,
        excavationDepth: formData.excavationDepth,
        workHours: {
          start: formData.workHoursStart,
          end: formData.workHoursEnd,
          weekend: formData.weekendWork,
          night: formData.nightWork,
        },
        dustControl: formData.dustControl,
        noiseControl: formData.noiseControl,
        expectedOccupancy: formData.expectedOccupancy,
        networkContext,
      });

      // Convert the analysis to ImpactAnalysis type
      const impactAnalysis: ImpactAnalysis = {
        trafficCongestion: {
          peakHourDelay: analysis.trafficImpact?.peakHourDelay || 0,
          averageDelay: analysis.trafficImpact?.estimatedDelay || 0,
          affectedRoutes: analysis.trafficImpact?.affectedRoutes || [],
          detourRequired: analysis.trafficImpact?.detourRequired || false,
          transitRoutesAffected: [],
        },
        environmental: {
          airQuality: {
            pm10Increase: analysis.environmental?.airQuality?.pm10Estimate || 0,
            pm25Increase: analysis.environmental?.airQuality?.pm25Estimate || 0,
            complianceStatus: (analysis.environmental?.airQuality?.complianceStatus as any) || 'compliant',
          },
          noise: {
            peakLevel: analysis.environmental?.noise?.peakNoiseLevel || 0,
            exceedsLimits: analysis.environmental?.noise?.exceedsLimits || false,
            affectedResidents: 0,
            mitigationRequired: analysis.environmental?.noise?.mitigationRequired || false,
          },
          dust: {
            level: (analysis.environmental?.airQuality?.dustLevel as any) || 'low',
            controlMeasuresRequired: [],
          },
        },
        economic: {
          businessImpact: (analysis.economicImpact?.businessImpact as any) || 'minimal',
          estimatedRevenueLoss: analysis.economicImpact?.estimatedBusinessLoss || 0,
          affectedBusinesses: analysis.economicImpact?.affectedBusinessCount || 0,
        },
        compliance: {
          requiredPermits: analysis.compliance?.requiredPermits || [],
          trafficManagementPlanRequired: analysis.compliance?.trafficManagementPlanRequired || false,
          environmentalAssessmentRequired: analysis.compliance?.environmentalAssessment || false,
          communityConsultationRequired: analysis.compliance?.communityConsultation || false,
          mitigationMeasures: analysis.compliance?.mitigationMeasures || [],
        },
        overall: {
          riskLevel: (analysis.overall?.riskLevel as any) || 'medium',
          recommendedActions: analysis.overall?.recommendedActions || [],
          estimatedTotalImpact: analysis.overall?.estimatedTotalImpact || '',
          severity: analysis.overall?.severity || 5,
        },
        sources: analysis.sources || [],
        narrative: analysis.narrative || 'Analysis completed.',
        networkContext,
      };

      setImpactAnalysis(impactAnalysis);
      setShowImpactReport(true);
      setStatusText("Impact analysis completed");
    } catch (error) {
      console.error("Failed to analyze construction impact:", error);
      setStatusText("Failed to analyze impact. Check console for details.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedBuilding, scheduleSimulation]);

  return (
    <div className="app-shell">
      <div ref={mapContainerRef} className="map-container" />
      <BuildingInput onBuildingAdded={handleBuildingAdded} />

      <section className="controls">
        <h1>Toronto Reactive Traffic Heatmap</h1>
        <p className="status">{isComputing || isAnalyzing ? "Computing..." : statusText}</p>
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
              backgroundColor: buildingMode ? '#28a745' : '#6c757d',
              color: 'white',
            }}
          >
            {buildingMode ? '✓ Building Mode' : '+ Add Building'}
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
            ? 'Click on the map to place a building'
            : drawMode
            ? 'Click to draw polygon vertices. Double-click or click first point to complete.'
            : 'Click a road to toggle closure and reroute traffic. Use the ✏️ button on the left to draw polygons.'}
        </p>
        <div className="legend">
          <span className="chip flow-good">delay 1.0</span>
          <span className="chip flow-mid">delay 1.3+</span>
          <span className="chip flow-high">delay 1.8+</span>
          <span className="chip flow-closed">closed</span>
        </div>
      </section>

      {selectedBuilding && (
        <BuildingControls
          building={selectedBuilding}
          onUpdate={handleBuildingUpdate}
          onDelete={handleBuildingDelete}
          onAnalyze={handleAnalyzeBuilding}
        />
      )}

      {showBuildingInfo && selectedBuilding && (
        <BuildingInfoModal
          building={selectedBuilding}
          onSubmit={handleBuildingInfoSubmit}
          onCancel={() => setShowBuildingInfo(false)}
        />
      )}

      {showImpactReport && impactAnalysis && (
        <ImpactReportModal
          analysis={impactAnalysis}
          onClose={() => setShowImpactReport(false)}
        />
      )}

      <SimulationResultsPanel
        stats={stats}
        isVisible={showResultsPanel}
        onClose={() => setShowResultsPanel(false)}
        buildingCount={polygonBuildings.size + (selectedBuilding ? 1 : 0)}
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
