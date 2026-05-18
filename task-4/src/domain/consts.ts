import { OperationType, Priority } from './enums';

export const T0_MINUTES = 0;

export const OPERATION_DURATION_MINUTES: Record<OperationType, number> = {
  [OperationType.Arrival]: 10,
  [OperationType.Departure]: 15,
};

export const PRIORITY_RANK: Record<Priority, number> = {
  [Priority.High]: 0,
  [Priority.Medium]: 1,
  [Priority.Low]: 2,
};
