'use strict';

// Topological sort helper
function topoSort(nodes, edges) {
  const inDegree = {};
  const adj = {};
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) {
    adj[e.source].push(e.target);
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  }
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
  return order;
}

// Level-based grouping for parallel execution
function topoLevels(nodes, edges) {
  const inDegree = {};
  const adj = {};
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) {
    adj[e.source] = adj[e.source] || [];
    adj[e.source].push(e.target);
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  }
  const levels = [];
  let queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  while (queue.length) {
    levels.push([...queue]);
    const nextQueue = [];
    for (const id of queue) {
      for (const next of (adj[id] || [])) {
        inDegree[next]--;
        if (inDegree[next] === 0) nextQueue.push(next);
      }
    }
    queue = nextQueue;
  }
  return levels;
}

module.exports = { topoSort, topoLevels };
