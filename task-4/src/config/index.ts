import { z } from 'zod';

import type { Gate, Runway } from '../domain/types';

const runwaySchema = z.object({
  id: z.string().min(1),
  lengthMeters: z.number().int().positive(),
});

const intEnv = (min: number) =>
  z.string().transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `must be an integer >= ${min}` });
      return z.NEVER;
    }
    return n;
  });

const envSchema = z.object({
  RUNWAY_COUNT: intEnv(1),
  RUNWAYS_CONFIG: z.string().transform((raw, ctx) => {
    try {
      const parsed = JSON.parse(raw);
      const result = z.array(runwaySchema).min(1).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `RUNWAYS_CONFIG: ${result.error.message}`,
        });
        return z.NEVER;
      }
      return result.data;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RUNWAYS_CONFIG: invalid JSON' });
      return z.NEVER;
    }
  }),
  GATE_COUNT: intEnv(1),
  GROUND_CREW_COUNT: intEnv(1),
  RUNWAY_SEPARATION_TAKEOFF_MINUTES: intEnv(0),
  RUNWAY_SEPARATION_LANDING_MINUTES: intEnv(0),
  RUNWAY_SEPARATION_MIXED_MINUTES: intEnv(0),
  GATE_TURNAROUND_MINUTES: intEnv(0),
  DEPENDENCY_BUFFER_MINUTES: intEnv(0),
  MAX_SCHEDULING_HORIZON_HOURS: intEnv(1),
});

export interface AppConfig {
  runways: Runway[];
  gates: Gate[];
  groundCrewCount: number;
  runwaySeparation: {
    takeoffMinutes: number;
    landingMinutes: number;
    mixedMinutes: number;
  };
  gateTurnaroundMinutes: number;
  dependencyBufferMinutes: number;
  maxSchedulingHorizonMinutes: number;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${messages.join('\n')}`);
  }
  const data = parsed.data;

  if (data.RUNWAY_COUNT !== data.RUNWAYS_CONFIG.length) {
    throw new Error(
      `Invalid configuration: RUNWAY_COUNT (${data.RUNWAY_COUNT}) does not match RUNWAYS_CONFIG entries (${data.RUNWAYS_CONFIG.length}).`,
    );
  }

  const gates: Gate[] = Array.from({ length: data.GATE_COUNT }, (_, i) => ({ id: `G${i + 1}` }));

  return {
    runways: data.RUNWAYS_CONFIG,
    gates,
    groundCrewCount: data.GROUND_CREW_COUNT,
    runwaySeparation: {
      takeoffMinutes: data.RUNWAY_SEPARATION_TAKEOFF_MINUTES,
      landingMinutes: data.RUNWAY_SEPARATION_LANDING_MINUTES,
      mixedMinutes: data.RUNWAY_SEPARATION_MIXED_MINUTES,
    },
    gateTurnaroundMinutes: data.GATE_TURNAROUND_MINUTES,
    dependencyBufferMinutes: data.DEPENDENCY_BUFFER_MINUTES,
    maxSchedulingHorizonMinutes: data.MAX_SCHEDULING_HORIZON_HOURS * 60,
  };
}
