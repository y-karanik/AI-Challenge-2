import type { FlightStatus, OperationType, Priority, UnscheduledReason } from './enums';

export interface Runway {
  id: string;
  lengthMeters: number;
}

export interface Gate {
  id: string;
}

export interface ScheduledSlot {
  runwayId: string;
  gateId: string;
  startMinutes: number;
  endMinutes: number;
}

export interface Flight {
  flightNumber: string;
  operation: OperationType;
  priority: Priority;
  dependencies: string[];
  minRunwayLengthMeters?: number;
  status: FlightStatus;
  unscheduledReason?: UnscheduledReason;
  scheduled?: ScheduledSlot;
}

export interface SubmitFlightInput {
  flightNumber: string;
  operation: OperationType;
  priority: Priority;
  dependencies?: string[];
  minRunwayLengthMeters?: number;
}
