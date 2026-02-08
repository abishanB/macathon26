import type { RoadFeatureProperties } from "./types";

type LngLat = [number, number];
type BBox = [number, number, number, number];

const EPSILON = 1e-9;

const EMPTY_BBOX: BBox = [
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

function toLngLat(coord: number[]): LngLat | null {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return [lng, lat];
}

function isValidBbox(bbox: BBox): boolean {
  return (
    Number.isFinite(bbox[0]) &&
    Number.isFinite(bbox[1]) &&
    Number.isFinite(bbox[2]) &&
    Number.isFinite(bbox[3]) &&
    bbox[0] <= bbox[2] &&
    bbox[1] <= bbox[3]
  );
}

function bboxIntersects(a: BBox, b: BBox): boolean {
  if (!isValidBbox(a) || !isValidBbox(b)) {
    return false;
  }
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function computeRingBbox(ring: LngLat[]): BBox {
  if (ring.length === 0) {
    return EMPTY_BBOX;
  }
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return [minLng, minLat, maxLng, maxLat];
}

function ensureClosedRing(points: LngLat[]): LngLat[] {
  if (points.length < 3) {
    return [];
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first[0] - last[0]) <= EPSILON && Math.abs(first[1] - last[1]) <= EPSILON) {
    return points;
  }
  return [...points, first];
}

function cross(a: LngLat, b: LngLat, c: LngLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function isPointOnSegment(p: LngLat, a: LngLat, b: LngLat): boolean {
  if (Math.abs(cross(a, b, p)) > EPSILON) {
    return false;
  }
  const minX = Math.min(a[0], b[0]) - EPSILON;
  const maxX = Math.max(a[0], b[0]) + EPSILON;
  const minY = Math.min(a[1], b[1]) - EPSILON;
  const maxY = Math.max(a[1], b[1]) + EPSILON;
  return p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;
}

function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) {
    if ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON)) {
      return true;
    }
  }

  if (Math.abs(abC) <= EPSILON && isPointOnSegment(c, a, b)) {
    return true;
  }
  if (Math.abs(abD) <= EPSILON && isPointOnSegment(d, a, b)) {
    return true;
  }
  if (Math.abs(cdA) <= EPSILON && isPointOnSegment(a, c, d)) {
    return true;
  }
  if (Math.abs(cdB) <= EPSILON && isPointOnSegment(b, c, d)) {
    return true;
  }

  return false;
}

function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  if (ring.length < 4) {
    return false;
  }

  for (let idx = 1; idx < ring.length; idx += 1) {
    if (isPointOnSegment(point, ring[idx - 1], ring[idx])) {
      return true;
    }
  }

  const x = point[0];
  const y = point[1];
  let inside = false;
  let prev = ring[ring.length - 1];

  for (const curr of ring) {
    const xi = curr[0];
    const yi = curr[1];
    const xj = prev[0];
    const yj = prev[1];

    const intersectsY = (yi > y) !== (yj > y);
    if (intersectsY) {
      const xAtY = ((xj - xi) * (y - yi)) / (yj - yi + EPSILON) + xi;
      if (x < xAtY) {
        inside = !inside;
      }
    }

    prev = curr;
  }

  return inside;
}

function lineIntersectsRing(lineCoords: number[][], ring: LngLat[]): boolean {
  if (lineCoords.length < 2 || ring.length < 4) {
    return false;
  }

  const ringSegments: Array<[LngLat, LngLat]> = [];
  for (let idx = 1; idx < ring.length; idx += 1) {
    ringSegments.push([ring[idx - 1], ring[idx]]);
  }

  for (let idx = 1; idx < lineCoords.length; idx += 1) {
    const start = toLngLat(lineCoords[idx - 1]);
    const end = toLngLat(lineCoords[idx]);
    if (!start || !end) {
      continue;
    }

    if (pointInRing(start, ring) || pointInRing(end, ring)) {
      return true;
    }

    for (const [ringStart, ringEnd] of ringSegments) {
      if (segmentsIntersect(start, end, ringStart, ringEnd)) {
        return true;
      }
    }
  }

  return false;
}

function lineBbox(lineCoords: number[][]): BBox {
  if (lineCoords.length === 0) {
    return EMPTY_BBOX;
  }
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const coord of lineCoords) {
    const point = toLngLat(coord);
    if (!point) {
      continue;
    }
    minLng = Math.min(minLng, point[0]);
    minLat = Math.min(minLat, point[1]);
    maxLng = Math.max(maxLng, point[0]);
    maxLat = Math.max(maxLat, point[1]);
  }

  return [minLng, minLat, maxLng, maxLat];
}

function ringFromCoordinates(coords: number[][]): LngLat[] {
  const points = coords
    .map((coord) => toLngLat(coord))
    .filter((coord): coord is LngLat => coord !== null);
  return ensureClosedRing(points);
}

export function extractPolygonRings(
  feature: GeoJSON.Feature,
): Array<LngLat[]> {
  if (!feature.geometry) {
    return [];
  }

  if (feature.geometry.type === "Polygon") {
    const [outerRing] = feature.geometry.coordinates as number[][][];
    if (!outerRing) {
      return [];
    }
    const ring = ringFromCoordinates(outerRing);
    return ring.length >= 4 ? [ring] : [];
  }

  if (feature.geometry.type === "MultiPolygon") {
    const rings: Array<LngLat[]> = [];
    for (const polygon of feature.geometry.coordinates as number[][][][]) {
      const [outerRing] = polygon;
      if (!outerRing) {
        continue;
      }
      const ring = ringFromCoordinates(outerRing);
      if (ring.length >= 4) {
        rings.push(ring);
      }
    }
    return rings;
  }

  return [];
}

export function computeLineFeatureBBoxes(
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
): BBox[] {
  return roads.features.map((feature) => {
    if (!feature.geometry || feature.geometry.type !== "LineString") {
      return EMPTY_BBOX;
    }
    return lineBbox(feature.geometry.coordinates as number[][]);
  });
}

export function detectRoadClosuresFromBuildingRings(
  roads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadFeatureProperties>,
  buildingRings: ReadonlyArray<LngLat[]>,
  roadFeatureBBoxes?: ReadonlyArray<BBox>,
): Set<number> {
  const polygons = buildingRings
    .map((ring) => ensureClosedRing(ring))
    .filter((ring) => ring.length >= 4)
    .map((ring) => ({ ring, bbox: computeRingBbox(ring) }))
    .filter((polygon) => isValidBbox(polygon.bbox));

  if (polygons.length === 0) {
    return new Set<number>();
  }

  const roadBBoxes =
    roadFeatureBBoxes && roadFeatureBBoxes.length === roads.features.length
      ? roadFeatureBBoxes
      : computeLineFeatureBBoxes(roads);

  const closedFeatures = new Set<number>();

  for (let featureIndex = 0; featureIndex < roads.features.length; featureIndex += 1) {
    const feature = roads.features[featureIndex];
    if (!feature.geometry || feature.geometry.type !== "LineString") {
      continue;
    }
    const lineCoords = feature.geometry.coordinates as number[][];
    if (lineCoords.length < 2) {
      continue;
    }

    const roadBbox = roadBBoxes[featureIndex] ?? lineBbox(lineCoords);
    if (!isValidBbox(roadBbox)) {
      continue;
    }

    for (const polygon of polygons) {
      if (!bboxIntersects(roadBbox, polygon.bbox)) {
        continue;
      }
      if (lineIntersectsRing(lineCoords, polygon.ring)) {
        closedFeatures.add(featureIndex);
        break;
      }
    }
  }

  return closedFeatures;
}
