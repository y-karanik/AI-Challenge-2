import type { AppConfig } from '../config';
import { FlightStatus, OperationType } from '../domain/enums';
import type { Flight } from '../domain/types';
import type { AirportState } from '../state/airportState';

export interface AirportStatus {
  flightCounts: {
    byStatus: Record<FlightStatus, number>;
    byOperation: Record<OperationType, number>;
  };
  runways: { total: number; inUse: number; utilizationPercent: number };
  gates: { total: number; inUse: number; utilizationPercent: number };
  groundCrew: { total: number; peakConcurrentUsage: number };
  resourceConstraints: string[];
  unscheduledFlights: Array<{ flightNumber: string; reason: string | undefined }>;
  scheduleCompletionTimeMinutes: number | null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildStatus(state: AirportState, config: AppConfig): AirportStatus {
  const flights = state.getAll();
  const byStatus: Record<FlightStatus, number> = {
    [FlightStatus.Pending]: 0,
    [FlightStatus.Scheduled]: 0,
    [FlightStatus.Cancelled]: 0,
    [FlightStatus.Unscheduled]: 0,
  };
  const byOperation: Record<OperationType, number> = {
    [OperationType.Arrival]: 0,
    [OperationType.Departure]: 0,
  };

  for (const flight of flights) {
    byStatus[flight.status]++;
    byOperation[flight.operation]++;
  }

  const scheduled = flights.filter(
    (f): f is Flight & { scheduled: NonNullable<Flight['scheduled']> } =>
      f.status === FlightStatus.Scheduled && f.scheduled !== undefined,
  );
  const usedRunwayIds = new Set(scheduled.map((f) => f.scheduled.runwayId));
  const usedGateIds = new Set(scheduled.map((f) => f.scheduled.gateId));

  const completion = scheduled.reduce((acc, f) => Math.max(acc, f.scheduled.endMinutes), 0);

  const events: Array<{ time: number; delta: number }> = [];
  for (const f of scheduled) {
    events.push({ time: f.scheduled.startMinutes, delta: 1 });
    events.push({ time: f.scheduled.endMinutes, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0;
  let peak = 0;
  for (const event of events) {
    active += event.delta;
    if (active > peak) {
      peak = active;
    }
  }

  const resourceConstraints: string[] = [];
  if (peak >= config.groundCrewCount) {
    resourceConstraints.push('ground crew capacity reached at peak');
  }
  if (usedRunwayIds.size >= config.runways.length && scheduled.length > 0) {
    resourceConstraints.push('all runways in use at some point');
  }
  if (usedGateIds.size >= config.gates.length && scheduled.length > 0) {
    resourceConstraints.push('all gates in use at some point');
  }

  return {
    flightCounts: { byStatus, byOperation },
    runways: {
      total: config.runways.length,
      inUse: usedRunwayIds.size,
      utilizationPercent: round((usedRunwayIds.size / config.runways.length) * 100),
    },
    gates: {
      total: config.gates.length,
      inUse: usedGateIds.size,
      utilizationPercent: round((usedGateIds.size / config.gates.length) * 100),
    },
    groundCrew: { total: config.groundCrewCount, peakConcurrentUsage: peak },
    resourceConstraints,
    unscheduledFlights: flights
      .filter((f) => f.status === FlightStatus.Unscheduled)
      .map((f) => ({ flightNumber: f.flightNumber, reason: f.unscheduledReason })),
    scheduleCompletionTimeMinutes: scheduled.length > 0 ? completion : null,
  };
}
