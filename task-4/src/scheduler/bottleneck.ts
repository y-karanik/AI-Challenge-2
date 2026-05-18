import type { AppConfig } from '../config';
import { OPERATION_DURATION_MINUTES } from '../domain/consts';
import { FlightStatus } from '../domain/enums';
import type { AirportState } from '../state/airportState';

export interface BottleneckResult {
  chain: string[];
  totalDurationMinutes: number;
}

export function analyzeBottleneck(state: AirportState, config: AppConfig): BottleneckResult {
  const scheduled = state.getAll().filter((f) => f.status === FlightStatus.Scheduled);
  const scheduledNumbers = new Set(scheduled.map((f) => f.flightNumber));

  const longest = new Map<string, number>();
  const parent = new Map<string, string | null>();

  const ordered = [...scheduled].sort(
    (a, b) =>
      a.scheduled!.startMinutes - b.scheduled!.startMinutes ||
      a.flightNumber.localeCompare(b.flightNumber),
  );

  for (const flight of ordered) {
    const duration = OPERATION_DURATION_MINUTES[flight.operation];
    let bestParent: string | null = null;
    let bestLength = duration;

    for (const depNumber of flight.dependencies) {
      if (!scheduledNumbers.has(depNumber)) {
        continue;
      }
      const candidate = (longest.get(depNumber) ?? 0) + config.dependencyBufferMinutes + duration;
      if (candidate > bestLength || (candidate === bestLength && bestParent === null)) {
        bestLength = candidate;
        bestParent = depNumber;
      }
    }

    longest.set(flight.flightNumber, bestLength);
    parent.set(flight.flightNumber, bestParent);
  }

  let tail: string | null = null;
  let max = 0;
  for (const [flightNumber, length] of longest.entries()) {
    if (length > max && parent.get(flightNumber) !== null) {
      max = length;
      tail = flightNumber;
    }
  }

  if (tail === null) {
    return { chain: [], totalDurationMinutes: 0 };
  }

  const chain: string[] = [];
  let cursor: string | null = tail;
  while (cursor !== null) {
    chain.unshift(cursor);
    cursor = parent.get(cursor) ?? null;
  }

  return { chain, totalDurationMinutes: max };
}
