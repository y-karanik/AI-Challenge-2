import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/config';
import { OperationType } from '../src/domain/enums';
import { findEarliestSlot } from '../src/scheduler/slotFinder';

const baseConfig: AppConfig = {
  runways: [
    { id: 'R1', lengthMeters: 3000 },
    { id: 'R2', lengthMeters: 2000 },
  ],
  gates: [{ id: 'G1' }, { id: 'G2' }],
  groundCrewCount: 5,
  runwaySeparation: { takeoffMinutes: 2, landingMinutes: 3, mixedMinutes: 4 },
  gateTurnaroundMinutes: 30,
  dependencyBufferMinutes: 15,
  maxSchedulingHorizonMinutes: 24 * 60,
};

describe('findEarliestSlot', () => {
  it('finds the earliest empty slot starting at minMinutes', () => {
    const result = findEarliestSlot({
      operation: OperationType.Arrival,
      durationMinutes: 10,
      minRunwayLengthMeters: undefined,
      minMinutes: 0,
      runwayOccupancy: { R1: [], R2: [] },
      gateOccupancy: { G1: [], G2: [] },
      activeOperations: [],
      config: baseConfig,
    });
    expect(result).toEqual({
      runwayId: 'R1',
      gateId: 'G1',
      startMinutes: 0,
      endMinutes: 10,
    });
  });

  it('rejects runways with insufficient length', () => {
    const result = findEarliestSlot({
      operation: OperationType.Departure,
      durationMinutes: 15,
      minRunwayLengthMeters: 2500,
      minMinutes: 0,
      runwayOccupancy: { R1: [], R2: [] },
      gateOccupancy: { G1: [], G2: [] },
      activeOperations: [],
      config: baseConfig,
    });
    expect(result?.runwayId).toBe('R1');
  });

  it('returns null when no runway meets length requirement', () => {
    const result = findEarliestSlot({
      operation: OperationType.Departure,
      durationMinutes: 15,
      minRunwayLengthMeters: 9999,
      minMinutes: 0,
      runwayOccupancy: { R1: [], R2: [] },
      gateOccupancy: { G1: [], G2: [] },
      activeOperations: [],
      config: baseConfig,
    });
    expect(result).toBeNull();
  });

  it('respects mixed separation buffer when previous op on runway is different type', () => {
    const result = findEarliestSlot({
      operation: OperationType.Departure,
      durationMinutes: 15,
      minRunwayLengthMeters: undefined,
      minMinutes: 0,
      runwayOccupancy: {
        R1: [{ start: 0, end: 10, operation: OperationType.Arrival }],
        R2: [{ start: 0, end: 10, operation: OperationType.Arrival }],
      },
      gateOccupancy: { G1: [], G2: [] },
      activeOperations: [],
      config: baseConfig,
    });
    expect(result?.startMinutes).toBe(14);
  });

  it('returns null when ground crew capacity is exceeded at every slot before horizon', () => {
    const cap1Config: AppConfig = { ...baseConfig, groundCrewCount: 1 };
    const result = findEarliestSlot({
      operation: OperationType.Arrival,
      durationMinutes: 10,
      minRunwayLengthMeters: undefined,
      minMinutes: 0,
      runwayOccupancy: { R1: [], R2: [] },
      gateOccupancy: { G1: [], G2: [] },
      activeOperations: [{ start: 0, end: cap1Config.maxSchedulingHorizonMinutes }],
      config: cap1Config,
    });
    expect(result).toBeNull();
  });
});
