import { z } from 'zod';

import { OperationType, Priority } from '../domain/enums';

export const submitFlightSchema = z.object({
  flightNumber: z.string().min(1).describe('Unique flight identifier, e.g. "AC123"'),
  operation: z.nativeEnum(OperationType).describe('Operation type: "arrival" or "departure"'),
  priority: z.nativeEnum(Priority).describe('Priority: "high", "medium", or "low"'),
  dependencies: z
    .array(z.string())
    .optional()
    .describe('Flight numbers this flight must wait for (optional)'),
  minRunwayLengthMeters: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Minimum runway length in metres required by this aircraft (optional)'),
});

export const cancelFlightSchema = z.object({
  flightNumber: z.string().min(1).describe('Flight number to cancel'),
});

export type SubmitFlightArgs = z.infer<typeof submitFlightSchema>;
export type CancelFlightArgs = z.infer<typeof cancelFlightSchema>;

export const submitFlightInputShape: z.ZodRawShape = submitFlightSchema.shape;
export const cancelFlightInputShape: z.ZodRawShape = cancelFlightSchema.shape;
