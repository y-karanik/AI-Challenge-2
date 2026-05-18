import { describe, expect, it } from 'vitest';

import { findCycles, topologicalSort } from '../src/scheduler/topology';

describe('findCycles', () => {
  it('returns empty when no cycles', () => {
    expect(findCycles({ A: [], B: ['A'], C: ['B'] })).toEqual([]);
  });

  it('detects flights inside a cycle', () => {
    const cyclic = findCycles({ A: ['B'], B: ['A'] });
    expect(new Set(cyclic)).toEqual(new Set(['A', 'B']));
  });

  it('treats unknown dependencies as no-op (they remain pending elsewhere)', () => {
    expect(findCycles({ A: ['MISSING'] })).toEqual([]);
  });
});

describe('topologicalSort', () => {
  it('orders dependencies before dependents', () => {
    const order = topologicalSort(['OUT', 'IN'], { OUT: ['IN'], IN: [] });
    expect(order.indexOf('IN')).toBeLessThan(order.indexOf('OUT'));
  });

  it('is stable when no edges (input order preserved)', () => {
    expect(topologicalSort(['C', 'A', 'B'], { C: [], A: [], B: [] })).toEqual(['C', 'A', 'B']);
  });
});
