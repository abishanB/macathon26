import type { GeoJSONSource, Map } from "maplibre-gl";
import type { RoadFeatureProperties } from "../traffic/types";

export const ROAD_SOURCE_ID = "roads";
export const CLOSURES_SOURCE_ID = "closures";

export const ROAD_LAYER_IDS = {
  base: "roads-base",
  heat: "roads-heat",
  closed: "roads-closed",
  closures: "closures",
} as const;

const DELAY_COLOR_EXPRESSION: unknown[] = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "delayFactor"], 1],
  1.0,
  "#3cb44b",
  1.3,
  "#ffe119",
  1.8,
  "#f58231",
  2.5,
  "#e6194b",
];

const BASE_LINE_WIDTH_EXPRESSION: unknown[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  1.2,
  15,
  3.0,
];

const HEAT_LINE_WIDTH_EXPRESSION: unknown[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  2,
  15,
  5,
];

const EMPTY_POLYGONS: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: "FeatureCollection",
  features: [],
};

function ensureRoadSource(
  map: Map,
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
): void {
  const source = map.getSource(ROAD_SOURCE_ID);
  if (source) {
    (source as GeoJSONSource).setData(roads);
    return;
  }
  map.addSource(ROAD_SOURCE_ID, {
    type: "geojson",
    data: roads,
  });
}

function ensureClosuresSource(map: Map): void {
  if (map.getSource(CLOSURES_SOURCE_ID)) {
    return;
  }
  map.addSource(CLOSURES_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_POLYGONS,
  });
}

export function addRoadLayers(
  map: Map,
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
): void {
  ensureRoadSource(map, roads);
  ensureClosuresSource(map);

  if (!map.getLayer(ROAD_LAYER_IDS.base)) {
    map.addLayer({
      id: ROAD_LAYER_IDS.base,
      type: "line",
      source: ROAD_SOURCE_ID,
      paint: {
        "line-color": "#8a8f99",
        "line-width": BASE_LINE_WIDTH_EXPRESSION,
        "line-opacity": 0.5,
      },
    });
  }

  if (!map.getLayer(ROAD_LAYER_IDS.heat)) {
    map.addLayer({
      id: ROAD_LAYER_IDS.heat,
      type: "line",
      source: ROAD_SOURCE_ID,
      paint: {
        "line-color": DELAY_COLOR_EXPRESSION,
        "line-width": HEAT_LINE_WIDTH_EXPRESSION,
        "line-opacity": 0.85,
      },
    });
  }

  if (!map.getLayer(ROAD_LAYER_IDS.closed)) {
    map.addLayer({
      id: ROAD_LAYER_IDS.closed,
      type: "line",
      source: ROAD_SOURCE_ID,
      filter: ["==", ["get", "closed"], true],
      paint: {
        "line-color": "#cc0000",
        "line-width": 7,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(ROAD_LAYER_IDS.closures)) {
    map.addLayer({
      id: ROAD_LAYER_IDS.closures,
      type: "fill",
      source: CLOSURES_SOURCE_ID,
      paint: {
        "fill-color": "#f54242",
        "fill-opacity": 0.2,
      },
    });
  }
}

export function updateRoadSourceData(
  map: Map,
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
): void {
  const source = map.getSource(ROAD_SOURCE_ID);
  if (!source) {
    return;
  }
  (source as GeoJSONSource).setData(roads);
}
