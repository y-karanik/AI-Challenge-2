import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppConfig } from '../config';
import { FlightStatus } from '../domain/enums';
import { analyzeBottleneck } from '../scheduler/bottleneck';
import { generateSchedule } from '../scheduler/generateSchedule';
import { buildStatus } from '../scheduler/status';
import type { AirportState } from '../state/airportState';
import {
  type CancelFlightArgs,
  cancelFlightInputShape,
  type SubmitFlightArgs,
  submitFlightInputShape,
} from './schemas';

// Loose-typed alias for `registerTool`. The MCP SDK's generic signature combines
// zod/v3 and zod/v4 inference, which trips TypeScript's "Type instantiation is
// excessively deep" guard at the call site even when the runtime contract is fine.
// We type each handler's input explicitly below to keep the call sites safe.
type RegisterTool = (
  name: string,
  config: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (input: any) => unknown,
) => unknown;

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function registerTools(server: McpServer, state: AirportState, config: AppConfig): void {
  const registerTool = server.registerTool.bind(server) as unknown as RegisterTool;

  registerTool(
    'submit_flight',
    {
      description:
        'Submit a new flight (arrival or departure) into the airport queue. Returns the stored flight record.',
      inputSchema: submitFlightInputShape,
    },
    async (input: SubmitFlightArgs) => {
      const flight = state.submit({
        flightNumber: input.flightNumber,
        operation: input.operation,
        priority: input.priority,
        dependencies: input.dependencies,
        minRunwayLengthMeters: input.minRunwayLengthMeters,
      });
      return textResult({ flight });
    },
  );

  registerTool(
    'generate_schedule',
    {
      description:
        'Replace the current schedule with a freshly computed one based on the current flight queue and airport configuration. Returns counts for every flight status (scheduled / unscheduled / cancelled / pending) plus, for each flight that could not be scheduled, its flightNumber and the explicit reason.',
    },
    async () => {
      generateSchedule(state, config);
      const flights = state.getAll();
      const scheduledCount = flights.filter((f) => f.status === FlightStatus.Scheduled).length;
      const unscheduled = flights.filter((f) => f.status === FlightStatus.Unscheduled);
      const cancelledCount = flights.filter((f) => f.status === FlightStatus.Cancelled).length;
      const pendingCount = flights.filter((f) => f.status === FlightStatus.Pending).length;
      const completion = flights
        .filter((f) => f.status === FlightStatus.Scheduled && f.scheduled)
        .reduce((acc, f) => Math.max(acc, f.scheduled!.endMinutes), 0);
      return textResult({
        scheduledCount,
        unscheduledCount: unscheduled.length,
        cancelledCount,
        pendingCount,
        completionTimeMinutes: scheduledCount > 0 ? completion : null,
        unscheduledFlights: unscheduled.map((f) => ({
          flightNumber: f.flightNumber,
          reason: f.unscheduledReason,
        })),
      });
    },
  );

  registerTool(
    'get_airport_status',
    {
      description:
        'Return current airport status: flight counts, runway and gate usage, resource constraints, unscheduled flights, and schedule completion time.',
    },
    async () => textResult(buildStatus(state, config)),
  );

  registerTool(
    'cancel_flight',
    {
      description:
        'Cancel a flight. Any dependent flights are reverted to Pending so the next schedule generation can re-evaluate them.',
      inputSchema: cancelFlightInputShape,
    },
    async (input: CancelFlightArgs) => {
      const result = state.cancel(input.flightNumber);
      return textResult({
        cancelled: true,
        flightNumber: result.cancelled.flightNumber,
        affectedDependents: result.affectedDependents,
      });
    },
  );

  registerTool(
    'analyze_bottleneck',
    {
      description:
        'Identify the longest scheduled dependency chain. Returns the ordered flights and their total elapsed duration in minutes.',
    },
    async () => textResult(analyzeBottleneck(state, config)),
  );
}
