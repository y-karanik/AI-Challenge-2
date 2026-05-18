import { FlightStatus } from '../domain/enums';
import type { Flight, SubmitFlightInput } from '../domain/types';

export interface AirportState {
  submit: (input: SubmitFlightInput) => Flight;
  cancel: (flightNumber: string) => { cancelled: Flight; affectedDependents: string[] };
  find: (flightNumber: string) => Flight | undefined;
  getAll: () => Flight[];
}

export function createAirportState(): AirportState {
  const flights = new Map<string, Flight>();

  const submit = (input: SubmitFlightInput): Flight => {
    const existing = flights.get(input.flightNumber);
    if (existing) {
      if (existing.status === FlightStatus.Cancelled) {
        throw new Error(
          `Flight ${input.flightNumber} exists with status "cancelled". Cancelled flights occupy the namespace; use a different flightNumber.`,
        );
      }
      throw new Error(
        `Flight ${input.flightNumber} already submitted (status: "${existing.status}").`,
      );
    }

    for (const dep of input.dependencies ?? []) {
      const depFlight = flights.get(dep);
      if (!depFlight) {
        throw new Error(
          `Dependency flight "${dep}" not found. Submit it before flights that depend on it.`,
        );
      }
      if (depFlight.status === FlightStatus.Cancelled) {
        throw new Error(`Dependency flight "${dep}" is cancelled. Use a different dependency.`);
      }
    }
    const flight: Flight = {
      flightNumber: input.flightNumber,
      operation: input.operation,
      priority: input.priority,
      dependencies: input.dependencies ?? [],
      minRunwayLengthMeters: input.minRunwayLengthMeters,
      status: FlightStatus.Pending,
    };
    flights.set(flight.flightNumber, flight);
    return flight;
  };

  const cancel = (flightNumber: string): { cancelled: Flight; affectedDependents: string[] } => {
    const flight = flights.get(flightNumber);
    if (!flight) {
      throw new Error(`Flight ${flightNumber} not found.`);
    }
    flight.status = FlightStatus.Cancelled;
    flight.unscheduledReason = undefined;
    flight.scheduled = undefined;

    const affected: string[] = [];
    for (const other of flights.values()) {
      if (other.flightNumber === flightNumber) {
        continue;
      }
      if (other.dependencies.includes(flightNumber)) {
        affected.push(other.flightNumber);
        other.status = FlightStatus.Pending;
        other.unscheduledReason = undefined;
        other.scheduled = undefined;
      }
    }
    affected.sort();
    return { cancelled: flight, affectedDependents: affected };
  };

  const find = (flightNumber: string): Flight | undefined => flights.get(flightNumber);

  const getAll = (): Flight[] => Array.from(flights.values());

  return { submit, cancel, find, getAll };
}
