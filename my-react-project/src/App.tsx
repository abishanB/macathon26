import { useCallback, useEffect, useRef, useState } from "react";
import type { Map, MapboxGeoJSONFeature, MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "./App.css";
import { initMap } from "./map/initMap";
import { DrawPolygonControl } from "./map/DrawPolygonControl";
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
import { BuildingPlacer } from "./map/buildingPlacer";
import { BuildingControls } from "./components/BuildingControls";
import { BuildingInfoModal } from "./components/BuildingInfoModal";
import { ImpactReportModal } from "./components/ImpactReportModal";
import { SimulationResultsPanel } from "./components/SimulationResultsPanel";
import type { Building, BuildingFormData, ImpactAnalysis } from "./types/building";
import { getBackboardClient } from "./lib/backboard";

type RoadCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>;

export interface SimulationStats {
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
  // Support both variable names for compatibility
  const token = (import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN) as string | undefined;
  const hasToken = typeof token === "string" && token.trim().length > 0;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const roadsRef = useRef<RoadCollection | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const odPairsRef = useRef<ODPair[]>([]);
  const probePairsRef = useRef<ODPair[]>([]);
  const closedFeaturesRef = useRef<Set<number>>(new Set<number>());
  const recomputeTimerRef = useRef<number | null>(null);
  const buildingPlacerRef = useRef<BuildingPlacer | null>(null);
  const drawControlRef = useRef<DrawPolygonControl | null>(null);

  const [statusText, setStatusText] = useState(
    hasToken ? "Waiting for map..." : "Missing VITE_MAPBOX_TOKEN in .env.",
  );
  const [isComputing, setIsComputing] = useState(false);
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);

  // Building placement state
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [showBuildingInfo, setShowBuildingInfo] = useState(false);
  const [showImpactReport, setShowImpactReport] = useState(false);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [buildingMode, setBuildingMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [polygonBuildings, setPolygonBuildings] = useState<Map<string, GeoJSON.Feature>>(new Map());

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
    setShowResultsPanel(true); // Show results panel when recomputing
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

    const newStats = {
      nodes: graph.nodes.size,
      directedEdges: graph.edges.length,
      trips: odPairsRef.current.length,
      probeTrips: probePairsRef.current.length,
      closed: closedFeaturesRef.current.size,
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

          const source = map.getSource("polygon-buildings") as mapboxgl.GeoJSONSource;
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
            const currentData = source._data as GeoJSON.FeatureCollection;
            source.setData({
              ...currentData,
              features: [...currentData.features, buildingFeature],
            });
          }

          if (draw) {
            draw.delete(feature.id);
          }
          console.log(`✅ [POLYGON DRAW] Building created with height ${buildingFeature.properties.height}m`);
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

    const handleMapClick = (event: MapMouseEvent) => {
      // Building placement is handled directly by BuildingPlacer's internal click handler
      // We just need to handle road closures here

      // Check if we're clicking on a building (handled by BuildingPlacer)
      const buildingFeatures = map.queryRenderedFeatures(event.point, {
        layers: ['placed-buildings-3d'],
      });
      if (buildingFeatures.length > 0) {
        return; // Let BuildingPlacer handle this
      }

      // Handle road closure clicks
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
      // Check for building hover
      const buildingFeatures = map.queryRenderedFeatures(event.point, {
        layers: ['placed-buildings-3d'],
      });

      if (buildingFeatures.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        return;
      }

      // Check for road hover
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

      // Store draw event handlers for cleanup
      const draw = drawControl.getDraw();
      const drawHandlers = {
        create: (e: any) => {
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

            const source = map.getSource("polygon-buildings") as mapboxgl.GeoJSONSource;
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
              const currentData = source._data as GeoJSON.FeatureCollection;
              source.setData({
                ...currentData,
                features: [...currentData.features, buildingFeature],
              });
            }

            if (draw) {
              draw.delete(feature.id);
            }
            console.log(`✅ [POLYGON DRAW] Building created with height ${buildingFeature.properties.height}m`);
          }
        },
        update: (e: any) => {
          console.log("🔄 [POLYGON DRAW] Polygon updated", e);
        },
        delete: (e: any) => {
          console.log("🗑️ [POLYGON DRAW] Polygon deleted", e);
          e.features.forEach((feature: any) => {
            setPolygonBuildings((prev) => {
              const newMap = new Map(prev);
              newMap.delete(String(feature.id));
              return newMap;
            });
          });
        },
      };

      if (draw) {
        map.on("draw.create", drawHandlers.create);
        map.on("draw.update", drawHandlers.update);
        map.on("draw.delete", drawHandlers.delete);
      }

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
      map.off("load", handleLoad);
      map.off("click", handleMapClick);
      map.off("mousemove", handleMapMove);
      map.getCanvas().style.cursor = "";
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken, loadRoadNetwork, scheduleSimulation, token]);

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
  }, [selectedBuilding]);

  return (
    <div className="app-shell">
      <div ref={mapContainerRef} className="map-container" />

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

      {/* Building Controls */}
      {selectedBuilding && (
        <BuildingControls
          building={selectedBuilding}
          onUpdate={handleBuildingUpdate}
          onDelete={handleBuildingDelete}
          onAnalyze={handleAnalyzeBuilding}
        />
      )}

      {/* Building Info Modal */}
      {showBuildingInfo && selectedBuilding && (
        <BuildingInfoModal
          building={selectedBuilding}
          onSubmit={handleBuildingInfoSubmit}
          onCancel={() => setShowBuildingInfo(false)}
        />
      )}

      {/* Impact Report Modal */}
      {showImpactReport && impactAnalysis && (
        <ImpactReportModal
          analysis={impactAnalysis}
          onClose={() => setShowImpactReport(false)}
        />
      )}

      {/* Simulation Results Panel */}
      <SimulationResultsPanel
        stats={stats}
        isVisible={showResultsPanel}
        onClose={() => setShowResultsPanel(false)}
        buildingCount={polygonBuildings.size + (selectedBuilding ? 1 : 0)}
        closedRoads={stats.closed}
      />
    </div>
  );
}
