import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/config';
import { FlightStatus, OperationType, Priority, UnscheduledReason } from '../src/domain/enums';
import { generateSchedule } from '../src/scheduler/generateSchedule';
import { createAirportState } from '../src/state/airportState';

const config: AppConfig = {
  runways: [
    { id: 'R1', lengthMeters: 3500 },
    { id: 'R2', lengthMeters: 2200 },
  ],
  gates: [{ id: 'G1' }, { id: 'G2' }],
  groundCrewCount: 4,
  runwaySeparation: { takeoffMinutes: 2, landingMinutes: 3, mixedMinutes: 4 },
  gateTurnaroundMinutes: 30,
  dependencyBufferMinutes: 15,
  maxSchedulingHorizonMinutes: 24 * 60,
};

describe('Morning Rush', () => {
  it('schedules all mixed flights without overlap, higher priority no later than lower', () => {
    const state = createAirportState();
    state.submit({
      flightNumber: 'LO1',
      operation: OperationType.Departure,
      priority: Priority.Low,
    });
    state.submit({
      flightNumber: 'HI1',
      operation: OperationType.Arrival,
      priority: Priority.High,
    });
    state.submit({ flightNumber: 'LO2', operation: OperationType.Arrival, priority: Priority.Low });
    state.submit({
      flightNumber: 'ME1',
      operation: OperationType.Departure,
      priority: Priority.Medium,
    });

    generateSchedule(state, config);

    const flights = state.getAll();
    expect(flights.every((f) => f.status === FlightStatus.Scheduled)).toBe(true);

    const hi = state.find('HI1')!.scheduled!;
    const me = state.find('ME1')!.scheduled!;
    const lo1 = state.find('LO1')!.scheduled!;
    const lo2 = state.find('LO2')!.scheduled!;
    expect(hi.startMinutes).toBeLessThanOrEqual(me.startMinutes);
    expect(hi.startMinutes).toBeLessThanOrEqual(lo1.startMinutes);
    expect(hi.startMinutes).toBeLessThanOrEqual(lo2.startMinutes);

    const byRunway = new Map<string, Array<{ start: number; end: number }>>();
    for (const f of flights) {
      const slot = f.scheduled!;
      const list = byRunway.get(slot.runwayId) ?? [];
      list.push({ start: slot.startMinutes, end: slot.endMinutes });
      byRunway.set(slot.runwayId, list);
    }
    for (const list of byRunway.values()) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) {
        expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].end);
      }
    }
  });

  it('schedules higher priority earlier under contention (single runway, single gate)', () => {
    const tightConfig: AppConfig = {
      ...config,
      runways: [{ id: 'R1', lengthMeters: 3500 }],
      gates: [{ id: 'G1' }],
    };
    const state = createAirportState();
    state.submit({ flightNumber: 'LO1', operation: OperationType.Arrival, priority: Priority.Low });
    state.submit({
      flightNumber: 'ME1',
      operation: OperationType.Arrival,
      priority: Priority.Medium,
    });
    state.submit({
      flightNumber: 'HI1',
      operation: OperationType.Arrival,
      priority: Priority.High,
    });

    generateSchedule(state, tightConfig);

    const hi = state.find('HI1')!.scheduled!;
    const me = state.find('ME1')!.scheduled!;
    const lo = state.find('LO1')!.scheduled!;
    expect(hi.startMinutes).toBeLessThan(me.startMinutes);
    expect(me.startMinutes).toBeLessThan(lo.startMinutes);
  });
});

describe('Heavy Hauler', () => {
  it('marks oversize flight as unscheduled with a clear reason', () => {
    const state = createAirportState();
    state.submit({
      flightNumber: 'BIG',
      operation: OperationType.Departure,
      priority: Priority.High,
      minRunwayLengthMeters: 9999,
    });
    state.submit({
      flightNumber: 'SM',
      operation: OperationType.Arrival,
      priority: Priority.Medium,
    });

    generateSchedule(state, config);

    expect(state.find('BIG')!.status).toBe(FlightStatus.Unscheduled);
    expect(state.find('BIG')!.unscheduledReason).toBe(UnscheduledReason.NoRunwayMeetsLength);
    expect(state.find('SM')!.status).toBe(FlightStatus.Scheduled);
  });
});

describe('Connecting Flight', () => {
  it('schedules outbound after inbound with dependency buffer', () => {
    const state = createAirportState();
    state.submit({
      flightNumber: 'IN1',
      operation: OperationType.Arrival,
      priority: Priority.Medium,
    });
    state.submit({
      flightNumber: 'OUT1',
      operation: OperationType.Departure,
      priority: Priority.Medium,
      dependencies: ['IN1'],
    });

    generateSchedule(state, config);

    const inbound = state.find('IN1')!.scheduled!;
    const outbound = state.find('OUT1')!.scheduled!;
    expect(outbound.startMinutes).toBeGreaterThanOrEqual(
      inbound.endMinutes + config.dependencyBufferMinutes,
    );
  });

  it('marks dependent as unscheduled if dependency cannot be scheduled', () => {
    const state = createAirportState();
    state.submit({
      flightNumber: 'BIG',
      operation: OperationType.Arrival,
      priority: Priority.Medium,
      minRunwayLengthMeters: 9999,
    });
    state.submit({
      flightNumber: 'NEXT',
      operation: OperationType.Departure,
      priority: Priority.Medium,
      dependencies: ['BIG'],
    });

    generateSchedule(state, config);

    expect(state.find('BIG')!.status).toBe(FlightStatus.Unscheduled);
    expect(state.find('NEXT')!.status).toBe(FlightStatus.Unscheduled);
    expect(state.find('NEXT')!.unscheduledReason).toBe(UnscheduledReason.DependencyUnscheduled);
  });
});

describe('Determinism', () => {
  it('produces identical output for identical input', () => {
    function build() {
      const state = createAirportState();
      state.submit({
        flightNumber: 'A1',
        operation: OperationType.Arrival,
        priority: Priority.High,
      });
      state.submit({
        flightNumber: 'B2',
        operation: OperationType.Departure,
        priority: Priority.Medium,
      });
      state.submit({
        flightNumber: 'C3',
        operation: OperationType.Arrival,
        priority: Priority.Low,
        dependencies: ['A1'],
      });
      return state;
    }

    const first = build();
    generateSchedule(first, config);
    const second = build();
    generateSchedule(second, config);

    expect(first.getAll().map((f) => ({ n: f.flightNumber, s: f.scheduled }))).toEqual(
      second.getAll().map((f) => ({ n: f.flightNumber, s: f.scheduled })),
    );
  });
});

// Note: there is no integration test that constructs a dependency cycle through
// the API, because `submit_flight` rejects any reference to a flight that does
// not yet exist — cycles are structurally impossible to create through
// `submit_flight`. The cycle-detection branch in `generateSchedule` is kept as
// defensive code and exercised directly via `findCycles` unit tests in
// `tests/topology.spec.ts`.
