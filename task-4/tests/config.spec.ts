import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

const validEnv = {
  RUNWAY_COUNT: '2',
  RUNWAYS_CONFIG: '[{"id":"R1","lengthMeters":3000},{"id":"R2","lengthMeters":2500}]',
  GATE_COUNT: '3',
  GROUND_CREW_COUNT: '2',
  RUNWAY_SEPARATION_TAKEOFF_MINUTES: '2',
  RUNWAY_SEPARATION_LANDING_MINUTES: '3',
  RUNWAY_SEPARATION_MIXED_MINUTES: '4',
  GATE_TURNAROUND_MINUTES: '30',
  DEPENDENCY_BUFFER_MINUTES: '15',
  MAX_SCHEDULING_HORIZON_HOURS: '24',
};

describe('loadConfig', () => {
  it('parses a valid env block', () => {
    const config = loadConfig(validEnv);
    expect(config.runways).toHaveLength(2);
    expect(config.runways[0]).toEqual({ id: 'R1', lengthMeters: 3000 });
    expect(config.gates).toHaveLength(3);
    expect(config.gates[0]).toEqual({ id: 'G1' });
    expect(config.groundCrewCount).toBe(2);
  });

  it('fails when RUNWAY_COUNT mismatches RUNWAYS_CONFIG length', () => {
    expect(() => loadConfig({ ...validEnv, RUNWAY_COUNT: '5' })).toThrow(
      /RUNWAY_COUNT.*does not match/i,
    );
  });

  it('fails when a numeric field is negative', () => {
    expect(() => loadConfig({ ...validEnv, GATE_TURNAROUND_MINUTES: '-1' })).toThrow();
  });

  it('fails when RUNWAYS_CONFIG is malformed JSON', () => {
    expect(() => loadConfig({ ...validEnv, RUNWAYS_CONFIG: 'not-json' })).toThrow(/RUNWAYS_CONFIG/);
  });

  it('fails when a runway has a non-positive length', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        RUNWAYS_CONFIG: '[{"id":"R1","lengthMeters":0},{"id":"R2","lengthMeters":2500}]',
      }),
    ).toThrow();
  });
});
