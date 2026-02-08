import type { Edge, Graph } from "./types";

interface HeapItem {
  nodeId: string;
  distance: number;
}

class MinHeap {
  private readonly items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    if (this.items.length === 1) {
      return this.items.pop();
    }
    const minItem = this.items[0];
    const tail = this.items.pop();
    if (!tail) {
      return minItem;
    }
    this.items[0] = tail;
    this.bubbleDown(0);
    return minItem;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.items[parent].distance <= this.items[current].distance) {
        break;
      }
      [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (
        left < this.items.length &&
        this.items[left].distance < this.items[smallest].distance
      ) {
        smallest = left;
      }
      if (
        right < this.items.length &&
        this.items[right].distance < this.items[smallest].distance
      ) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }
      [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
      current = smallest;
    }
  }
}

export function dijkstraPath(
  graph: Graph,
  originNode: string,
  destNode: string,
  edgeTimes: Map<string, number>,
): string[] {
  if (originNode === destNode) {
    return [];
  }

  const distances = new Map<string, number>();
  const previousEdgeByNode = new Map<string, string>();
  const heap = new MinHeap();

  distances.set(originNode, 0);
  heap.push({ nodeId: originNode, distance: 0 });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) {
      break;
    }
    const bestDistance = distances.get(current.nodeId);
    if (bestDistance === undefined || current.distance > bestDistance) {
      continue;
    }
    if (current.nodeId === destNode) {
      break;
    }

    const neighbors = graph.adj.get(current.nodeId) ?? [];
    for (const edge of neighbors) {
      const edgeTime = edgeTimes.get(edge.id);
      if (edgeTime === undefined || !Number.isFinite(edgeTime)) {
        continue;
      }
      const nextDistance = current.distance + edgeTime;
      const existingDistance = distances.get(edge.to);
      if (existingDistance !== undefined && nextDistance >= existingDistance) {
        continue;
      }
      distances.set(edge.to, nextDistance);
      previousEdgeByNode.set(edge.to, edge.id);
      heap.push({ nodeId: edge.to, distance: nextDistance });
    }
  }

  if (!previousEdgeByNode.has(destNode)) {
    return [];
  }

  const path: string[] = [];
  let currentNode = destNode;
  while (currentNode !== originNode) {
    const previousEdgeId = previousEdgeByNode.get(currentNode);
    if (!previousEdgeId) {
      return [];
    }
    path.push(previousEdgeId);
    const edge = graph.edgesById.get(previousEdgeId);
    if (!edge) {
      return [];
    }
    currentNode = edge.from;
  }
  path.reverse();
  return path;
}

export interface DestinationTree {
  destinationNode: string;
  distances: Map<string, number>;
  nextEdgeByNode: Map<string, string>;
}

export function buildReverseAdjacency(graph: Graph): Map<string, Edge[]> {
  const reverseAdj = new Map<string, Edge[]>();
  for (const nodeId of graph.nodes.keys()) {
    reverseAdj.set(nodeId, []);
  }
  for (const edge of graph.edges) {
    const incoming = reverseAdj.get(edge.to);
    if (incoming) {
      incoming.push(edge);
    } else {
      reverseAdj.set(edge.to, [edge]);
    }
  }
  return reverseAdj;
}

export function dijkstraTreeToDestination(
  graph: Graph,
  destinationNode: string,
  edgeTimes: Map<string, number>,
  reverseAdjacency?: Map<string, Edge[]>,
): DestinationTree {
  const reverseAdj = reverseAdjacency ?? buildReverseAdjacency(graph);
  const distances = new Map<string, number>();
  const nextEdgeByNode = new Map<string, string>();
  const heap = new MinHeap();

  distances.set(destinationNode, 0);
  heap.push({ nodeId: destinationNode, distance: 0 });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) {
      break;
    }
    const bestDistance = distances.get(current.nodeId);
    if (bestDistance === undefined || current.distance > bestDistance) {
      continue;
    }

    const incomingEdges = reverseAdj.get(current.nodeId) ?? [];
    for (const edge of incomingEdges) {
      const edgeTime = edgeTimes.get(edge.id);
      if (edgeTime === undefined || !Number.isFinite(edgeTime)) {
        continue;
      }

      const candidateDistance = current.distance + edgeTime;
      const existingDistance = distances.get(edge.from);
      if (existingDistance !== undefined && candidateDistance >= existingDistance) {
        continue;
      }

      distances.set(edge.from, candidateDistance);
      nextEdgeByNode.set(edge.from, edge.id);
      heap.push({ nodeId: edge.from, distance: candidateDistance });
    }
  }

  return {
    destinationNode,
    distances,
    nextEdgeByNode,
  };
}

export function reconstructPathFromTree(
  graph: Graph,
  originNode: string,
  destinationNode: string,
  tree: DestinationTree,
): string[] {
  if (originNode === destinationNode) {
    return [];
  }
  if (tree.destinationNode !== destinationNode) {
    return [];
  }

  const path: string[] = [];
  let currentNode = originNode;
  const maxHops = graph.nodes.size + 1;

  for (let hop = 0; hop < maxHops; hop += 1) {
    if (currentNode === destinationNode) {
      return path;
    }

    const edgeId = tree.nextEdgeByNode.get(currentNode);
    if (!edgeId) {
      return [];
    }

    path.push(edgeId);
    const edge = graph.edgesById.get(edgeId);
    if (!edge) {
      return [];
    }
    currentNode = edge.to;
  }

  return [];
}
