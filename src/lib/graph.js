'use strict';

// Thrown when a graph contains a cycle or references a non-existent node.
// statusCode lets route handlers surface a clean 400 instead of a 500/crash.
class GraphError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphError';
    this.code = 'GRAPH_INVALID';
    this.statusCode = 400;
  }
}

// Build adjacency + in-degree maps, rejecting edges whose endpoints are not
// real nodes (dangling edge previously crashed with a TypeError).
function buildGraph(nodes, edges) {
  const inDegree = {};
  const adj = {};
  const known = new Set();
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; known.add(n.id); }
  for (const e of (edges || [])) {
    if (!known.has(e.source) || !known.has(e.target)) {
      throw new GraphError(`Edge references unknown node: ${e.source} -> ${e.target}`);
    }
    adj[e.source].push(e.target);
    inDegree[e.target] += 1;
  }
  return { inDegree, adj };
}

// Topological sort. Throws GraphError on a cycle (Kahn's algorithm: if the
// emitted order is shorter than the node set, the remainder forms a cycle).
function topoSort(nodes, edges) {
  const { inDegree, adj } = buildGraph(nodes, edges);
  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj[id]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }
  if (order.length !== nodes.length) {
    throw new GraphError('Orchestration graph contains a cycle');
  }
  return order;
}

// Level-based grouping for parallel execution. Same cycle/dangling guards.
function topoLevels(nodes, edges) {
  const { inDegree, adj } = buildGraph(nodes, edges);
  const levels = [];
  let queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  let emitted = 0;
  while (queue.length) {
    levels.push([...queue]);
    emitted += queue.length;
    const nextQueue = [];
    for (const id of queue) {
      for (const next of adj[id]) {
        inDegree[next]--;
        if (inDegree[next] === 0) nextQueue.push(next);
      }
    }
    queue = nextQueue;
  }
  if (emitted !== nodes.length) {
    throw new GraphError('Orchestration graph contains a cycle');
  }
  return levels;
}

module.exports = { topoSort, topoLevels, GraphError };
