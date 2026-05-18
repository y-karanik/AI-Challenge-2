import type { AppConfig } from '../config';
import { OPERATION_DURATION_MINUTES, PRIORITY_RANK, T0_MINUTES } from '../domain/consts';
import { FlightStatus, UnscheduledReason } from '../domain/enums';
import type { Flight } from '../domain/types';
import type { AirportState } from '../state/airportState';
import { type ActiveWindow, findEarliestSlot, type RunwayWindow } from './slotFinder';
import { findCycles, topologicalSort } from './topology';

export function generateSchedule(state: AirportState, config: AppConfig): void {
  const allFlights = state.getAll();

  for (const flight of allFlights) {
    if (flight.status !== FlightStatus.Cancelled) {
      flight.status = FlightStatus.Pending;
      flight.scheduled = undefined;
      flight.unscheduledReason = undefined;
    }
  }

  const eligible = allFlights.filter((f) => f.status !== FlightStatus.Cancelled);

  // Missing dependencies are rejected at submit time, so by this point every
  // dependency either points to a known flight or has been cancelled (handled
  // later by the DependencyUnscheduled branch in placeFlight).
  const graph: Record<string, string[]> = {};
  for (const flight of eligible) {
    graph[flight.flightNumber] = flight.dependencies.filter((dep) =>
      eligible.some((f) => f.flightNumber === dep),
    );
  }

  const cyclic = new Set(findCycles(graph));
  for (const flightNumber of cyclic) {
    const flight = state.find(flightNumber)!;
    flight.status = FlightStatus.Unscheduled;
    flight.unscheduledReason = UnscheduledReason.CircularDependency;
  }

  const schedulable = eligible.filter((f) => !cyclic.has(f.flightNumber));

  const orderedNumbers = topologicalSort(
    schedulable
      .slice()
      .sort((a, b) => {
        const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return a.flightNumber.localeCompare(b.flightNumber);
      })
      .map((f) => f.flightNumber),
    graph,
  );

  const runwayOccupancy: Record<string, RunwayWindow[]> = {};
  const gateOccupancy: Record<string, ActiveWindow[]> = {};
  const activeOperations: ActiveWindow[] = [];
  for (const runway of config.runways) {
    runwayOccupancy[runway.id] = [];
  }
  for (const gate of config.gates) {
    gateOccupancy[gate.id] = [];
  }

  for (const flightNumber of orderedNumbers) {
    const flight = state.find(flightNumber)!;
    placeFlight(flight, state, config, runwayOccupancy, gateOccupancy, activeOperations);
  }
}

function placeFlight(
  flight: Flight,
  state: AirportState,
  config: AppConfig,
  runwayOccupancy: Record<string, RunwayWindow[]>,
  gateOccupancy: Record<string, ActiveWindow[]>,
  activeOperations: ActiveWindow[],
): void {
  const dependencies = flight.dependencies
    .map((dep) => state.find(dep))
    .filter((dep): dep is Flight => dep !== undefined);

  for (const dep of dependencies) {
    if (dep.status === FlightStatus.Unscheduled || dep.status === FlightStatus.Cancelled) {
      flight.status = FlightStatus.Unscheduled;
      flight.unscheduledReason = UnscheduledReason.DependencyUnscheduled;
      return;
    }
  }

  const earliestDependencyEnd = dependencies.reduce(
    (acc, dep) => Math.max(acc, dep.scheduled!.endMinutes),
    T0_MINUTES,
  );
  const minMinutes =
    dependencies.length === 0 ? T0_MINUTES : earliestDependencyEnd + config.dependencyBufferMinutes;

  const duration = OPERATION_DURATION_MINUTES[flight.operation];

  const slot = findEarliestSlot({
    operation: flight.operation,
    durationMinutes: duration,
    minRunwayLengthMeters: flight.minRunwayLengthMeters,
    minMinutes,
    runwayOccupancy,
    gateOccupancy,
    activeOperations,
    config,
  });

  if (slot === null) {
    const eligibleRunways = config.runways.filter((runway) =>
      flight.minRunwayLengthMeters === undefined
        ? true
        : runway.lengthMeters >= flight.minRunwayLengthMeters,
    );
    flight.status = FlightStatus.Unscheduled;
    if (eligibleRunways.length === 0) {
      flight.unscheduledReason = UnscheduledReason.NoRunwayMeetsLength;
    } else if (minMinutes + duration > config.maxSchedulingHorizonMinutes) {
      flight.unscheduledReason = UnscheduledReason.ExceedsHorizon;
    } else {
      flight.unscheduledReason = UnscheduledReason.NoSlotWithinHorizon;
    }
    return;
  }

  flight.status = FlightStatus.Scheduled;
  flight.scheduled = slot;

  runwayOccupancy[slot.runwayId].push({
    start: slot.startMinutes,
    end: slot.endMinutes,
    operation: flight.operation,
  });
  gateOccupancy[slot.gateId].push({ start: slot.startMinutes, end: slot.endMinutes });
  activeOperations.push({ start: slot.startMinutes, end: slot.endMinutes });
}
