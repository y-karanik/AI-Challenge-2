export enum Priority {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum OperationType {
  Arrival = 'arrival',
  Departure = 'departure',
}

export enum FlightStatus {
  Pending = 'pending',
  Scheduled = 'scheduled',
  Cancelled = 'cancelled',
  Unscheduled = 'unscheduled',
}

export enum UnscheduledReason {
  CircularDependency = 'circular dependency',
  NoRunwayMeetsLength = 'no runway meets length requirement',
  DependencyUnscheduled = 'dependency unscheduled',
  ExceedsHorizon = 'exceeds scheduling horizon',
  NoSlotWithinHorizon = 'no available slot within horizon',
}
