import { beforeEach, describe, expect, it } from 'vitest';

import { FlightStatus, OperationType, Priority } from '../src/domain/enums';
import { type AirportState, createAirportState } from '../src/state/airportState';

describe('AirportState', () => {
  let state: AirportState;

  beforeEach(() => {
    state = createAirportState();
  });

  it('submits a new flight with Pending status', () => {
    const flight = state.submit({
      flightNumber: 'AB123',
      operation: OperationType.Arrival,
      priority: Priority.High,
    });
    expect(flight.status).toBe(FlightStatus.Pending);
    expect(flight.dependencies).toEqual([]);
    expect(state.getAll()).toHaveLength(1);
  });

  it('rejects a duplicate flight number with status in the message', () => {
    state.submit({
      flightNumber: 'AB123',
      operation: OperationType.Arrival,
      priority: Priority.Low,
    });
    expect(() =>
      state.submit({
        flightNumber: 'AB123',
        operation: OperationType.Departure,
        priority: Priority.Low,
      }),
    ).toThrow(/already submitted.*pending/i);
  });

  it('rejects re-submit of a cancelled flight number with a clear message', () => {
    state.submit({
      flightNumber: 'CN1',
      operation: OperationType.Arrival,
      priority: Priority.Low,
    });
    state.cancel('CN1');
    expect(() =>
      state.submit({
        flightNumber: 'CN1',
        operation: OperationType.Departure,
        priority: Priority.Low,
      }),
    ).toThrow(/cancelled.*use a different flightNumber/i);
  });

  it('rejects submit when a dependency does not exist', () => {
    expect(() =>
      state.submit({
        flightNumber: 'OUT404',
        operation: OperationType.Departure,
        priority: Priority.High,
        dependencies: ['UNKNOWN_FLIGHT'],
      }),
    ).toThrow(/Dependency flight "UNKNOWN_FLIGHT" not found/i);
  });

  it('rejects submit when a dependency is cancelled', () => {
    state.submit({
      flightNumber: 'IN1',
      operation: OperationType.Arrival,
      priority: Priority.Medium,
    });
    state.cancel('IN1');
    expect(() =>
      state.submit({
        flightNumber: 'OUT1',
        operation: OperationType.Departure,
        priority: Priority.Medium,
        dependencies: ['IN1'],
      }),
    ).toThrow(/Dependency flight "IN1" is cancelled/i);
  });

  it('cancels a flight and returns dependents', () => {
    state.submit({
      flightNumber: 'IN1',
      operation: OperationType.Arrival,
      priority: Priority.High,
    });
    state.submit({
      flightNumber: 'OUT1',
      operation: OperationType.Departure,
      priority: Priority.High,
      dependencies: ['IN1'],
    });

    const result = state.cancel('IN1');

    expect(result.affectedDependents).toEqual(['OUT1']);
    expect(state.find('IN1')!.status).toBe(FlightStatus.Cancelled);
    expect(state.find('OUT1')!.status).toBe(FlightStatus.Pending);
  });

  it('throws when cancelling an unknown flight', () => {
    expect(() => state.cancel('ZZ999')).toThrow(/not found/i);
  });
});
