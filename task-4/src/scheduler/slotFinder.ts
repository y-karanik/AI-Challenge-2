import type { AppConfig } from '../config';
import { OperationType } from '../domain/enums';

export interface RunwayWindow {
  start: number;
  end: number;
  operation: OperationType;
}

export interface ActiveWindow {
  start: number;
  end: number;
}

export interface FindSlotArgs {
  operation: OperationType;
  durationMinutes: number;
  minRunwayLengthMeters: number | undefined;
  minMinutes: number;
  runwayOccupancy: Record<string, RunwayWindow[]>;
  gateOccupancy: Record<string, ActiveWindow[]>;
  activeOperations: ActiveWindow[];
  config: AppConfig;
}

export interface FoundSlot {
  runwayId: string;
  gateId: string;
  startMinutes: number;
  endMinutes: number;
}

function separationBetween(prev: OperationType, next: OperationType, cfg: AppConfig): number {
  if (prev === next) {
    return next === OperationType.Departure
      ? cfg.runwaySeparation.takeoffMinutes
      : cfg.runwaySeparation.landingMinutes;
  }
  return cfg.runwaySeparation.mixedMinutes;
}

function earliestRunwayStart(
  windows: RunwayWindow[],
  operation: OperationType,
  duration: number,
  minStart: number,
  horizon: number,
  cfg: AppConfig,
): number | null {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  let candidate = minStart;
  for (const window of sorted) {
    const sepAfter = separationBetween(operation, window.operation, cfg);
    if (candidate + duration + sepAfter <= window.start) {
      if (candidate + duration <= horizon) {
        return candidate;
      }
      return null;
    }
    const sepFromWindow = separationBetween(window.operation, operation, cfg);
    candidate = Math.max(candidate, window.end + sepFromWindow);
  }
  if (candidate + duration <= horizon) {
    return candidate;
  }
  return null;
}

function gateAvailable(
  windows: ActiveWindow[],
  start: number,
  end: number,
  turnaround: number,
): boolean {
  for (const window of windows) {
    const blockedStart = window.start - turnaround;
    const blockedEnd = window.end + turnaround;
    if (start < blockedEnd && end > blockedStart) {
      return false;
    }
  }
  return true;
}

function groundCrewAvailable(
  activeOperations: ActiveWindow[],
  start: number,
  end: number,
  capacity: number,
): boolean {
  const events: Array<{ time: number; delta: number }> = [];
  for (const op of activeOperations) {
    if (op.end <= start || op.start >= end) {
      continue;
    }
    events.push({ time: Math.max(op.start, start), delta: 1 });
    events.push({ time: Math.min(op.end, end), delta: -1 });
  }
  events.push({ time: start, delta: 1 });
  events.push({ time: end, delta: -1 });
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0;
  for (const event of events) {
    active += event.delta;
    if (active > capacity) {
      return false;
    }
  }
  return true;
}

export function findEarliestSlot(args: FindSlotArgs): FoundSlot | null {
  const { operation, durationMinutes, minRunwayLengthMeters, minMinutes, config } = args;
  const horizon = config.maxSchedulingHorizonMinutes;

  const eligibleRunways = [...config.runways]
    .filter((runway) =>
      minRunwayLengthMeters === undefined ? true : runway.lengthMeters >= minRunwayLengthMeters,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  if (eligibleRunways.length === 0) {
    return null;
  }

  const sortedGates = [...config.gates].sort((a, b) => a.id.localeCompare(b.id));

  let best: FoundSlot | null = null;

  for (const runway of eligibleRunways) {
    let candidateStart = earliestRunwayStart(
      args.runwayOccupancy[runway.id] ?? [],
      operation,
      durationMinutes,
      minMinutes,
      horizon,
      config,
    );

    while (candidateStart !== null) {
      const end = candidateStart + durationMinutes;
      if (
        !groundCrewAvailable(args.activeOperations, candidateStart, end, config.groundCrewCount)
      ) {
        const nextStart = candidateStart + 1;
        if (nextStart + durationMinutes > horizon) {
          candidateStart = null;
          break;
        }
        candidateStart = earliestRunwayStart(
          args.runwayOccupancy[runway.id] ?? [],
          operation,
          durationMinutes,
          nextStart,
          horizon,
          config,
        );
        continue;
      }

      const gate = sortedGates.find((gate) =>
        gateAvailable(
          args.gateOccupancy[gate.id] ?? [],
          candidateStart!,
          end,
          config.gateTurnaroundMinutes,
        ),
      );

      if (gate) {
        if (best === null || candidateStart < best.startMinutes) {
          best = {
            runwayId: runway.id,
            gateId: gate.id,
            startMinutes: candidateStart,
            endMinutes: end,
          };
        }
        break;
      }

      candidateStart = earliestRunwayStart(
        args.runwayOccupancy[runway.id] ?? [],
        operation,
        durationMinutes,
        candidateStart + 1,
        horizon,
        config,
      );
    }
  }

  return best;
}
