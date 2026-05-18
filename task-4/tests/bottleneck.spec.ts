import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/config';
import { OperationType, Priority } from '../src/domain/enums';
import { analyzeBottleneck } from '../src/scheduler/bottleneck';
import { generateSchedule } from '../src/scheduler/generateSchedule';
import { createAirportState } from '../src/state/airportState';

const config: AppConfig = {
  runways: [{ id: 'R1', lengthMeters: 3500 }],
  gates: [{ id: 'G1' }, { id: 'G2' }],
  groundCrewCount: 4,
  runwaySeparation: { takeoffMinutes: 2, landingMinutes: 3, mixedMinutes: 4 },
  gateTurnaroundMinutes: 30,
  dependencyBufferMinutes: 15,
  maxSchedulingHorizonMinutes: 24 * 60,
};

describe('analyzeBottleneck', () => {
  it('returns empty chain when no scheduled flights have dependencies', () => {
    const state = createAirportState();
    state.submit({ flightNumber: 'A', operation: OperationType.Arrival, priority: Priority.High });
    generateSchedule(state, config);
    const result = analyzeBottleneck(state, config);
    expect(result.chain).toEqual([]);
    expect(result.totalDurationMinutes).toBe(0);
  });

  it('finds the longest dependency chain', () => {
    const state = createAirportState();
    state.submit({ flightNumber: 'A', operation: OperationType.Arrival, priority: Priority.High });
    state.submit({
      flightNumber: 'B',
      operation: OperationType.Departure,
      priority: Priority.High,
      dependencies: ['A'],
    });
    state.submit({
      flightNumber: 'C',
      operation: OperationType.Arrival,
      priority: Priority.High,
      dependencies: ['B'],
    });
    state.submit({
      flightNumber: 'D',
      operation: OperationType.Departure,
      priority: Priority.High,
    });
    generateSchedule(state, config);

    const result = analyzeBottleneck(state, config);
    expect(result.chain).toEqual(['A', 'B', 'C']);
    expect(result.totalDurationMinutes).toBeGreaterThan(0);
  });
});
