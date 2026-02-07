import type { FeatureMetric, RoadFeatureProperties } from "./types";

export function applyMetricsToRoads(
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
  featureMetrics: Map<number, FeatureMetric>,
): GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: roads.features.map((feature, featureIndex) => {
      const metric = featureMetrics.get(featureIndex);
      const coordinates = feature.geometry.coordinates.map((coord) => [coord[0], coord[1]]);
      return {
        type: "Feature",
        id: featureIndex,
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {
          ...(feature.properties ?? {}),
          featureIndex,
          volume: metric?.volume ?? 0,
          delayFactor: metric?.delayFactor ?? 1,
          closed: metric?.closed ?? false,
        },
      };
    }),
  };
}
