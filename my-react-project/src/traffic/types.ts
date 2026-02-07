export type LngLat = [number, number];

export interface GraphNode {
  id: string;
  coord: LngLat;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  coords: LngLat[];
  lengthM: number;
  highway: string;
  speedMps: number;
  t0: number;
  capacity: number;
  featureIndex: number;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, Edge[]>;
  edgesById: Map<string, Edge>;
  edges: Edge[];
  featureToEdgeIds: Map<number, string[]>;
  bbox: [number, number, number, number];
}

export interface ODPair {
  originNode: string;
  destNode: string;
}

export interface EdgeMetric {
  volume: number;
  time: number;
  delayFactor: number;
  closed: boolean;
}

export interface FeatureMetric {
  volume: number;
  delayFactor: number;
  closed: boolean;
}

export interface AssignmentResult {
  edgeMetrics: Map<string, EdgeMetric>;
  featureMetrics: Map<number, FeatureMetric>;
  unreachableTrips: number;
}

export interface RoadFeatureProperties {
  highway?: string | string[];
  name?: string;
  featureIndex?: number;
  volume?: number;
  delayFactor?: number;
  closed?: boolean;
}
