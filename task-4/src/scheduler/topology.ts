type Graph = Record<string, string[]>;

export function findCycles(graph: Graph): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const inCycle = new Set<string>();

  for (const node of Object.keys(graph)) {
    colour.set(node, WHITE);
  }

  const stack: string[] = [];

  function visit(node: string): void {
    colour.set(node, GRAY);
    stack.push(node);
    for (const next of graph[node] ?? []) {
      if (!(next in graph)) {
        continue;
      }
      const c = colour.get(next);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(next);
        for (let i = cycleStart; i < stack.length; i++) {
          inCycle.add(stack[i]);
        }
      } else if (c === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    colour.set(node, BLACK);
  }

  for (const node of Object.keys(graph)) {
    if (colour.get(node) === WHITE) {
      visit(node);
    }
  }
  return Array.from(inCycle);
}

export function topologicalSort(nodes: string[], graph: Graph): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(node: string): void {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    for (const dep of graph[node] ?? []) {
      if (graph[dep] !== undefined) {
        visit(dep);
      }
    }
    result.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }
  return result;
}
