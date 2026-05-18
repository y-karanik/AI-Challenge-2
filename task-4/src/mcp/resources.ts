import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppConfig } from '../config';
import { FlightStatus } from '../domain/enums';
import type { AirportState } from '../state/airportState';

export function registerResources(server: McpServer, state: AirportState, config: AppConfig): void {
  server.registerResource(
    'atc-flight-queue',
    'atc://queue',
    {
      title: 'Flight queue',
      description:
        'All submitted flights with current status, dependencies, runway requirement, scheduled slot (if any), and unscheduled reason (if any).',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'atc://queue',
          mimeType: 'application/json',
          text: JSON.stringify({ flights: state.getAll() }, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'atc-runway-usage',
    'atc://runways',
    {
      title: 'Runways',
      description: 'Runway definitions and scheduled occupancy windows.',
      mimeType: 'application/json',
    },
    async () => {
      const flights = state
        .getAll()
        .filter((f) => f.status === FlightStatus.Scheduled && f.scheduled);
      const runways = config.runways.map((runway) => ({
        id: runway.id,
        lengthMeters: runway.lengthMeters,
        occupiedWindows: flights
          .filter((f) => f.scheduled!.runwayId === runway.id)
          .map((f) => ({
            flightNumber: f.flightNumber,
            operation: f.operation,
            startMinutes: f.scheduled!.startMinutes,
            endMinutes: f.scheduled!.endMinutes,
          }))
          .sort((a, b) => a.startMinutes - b.startMinutes),
      }));
      return {
        contents: [
          {
            uri: 'atc://runways',
            mimeType: 'application/json',
            text: JSON.stringify({ runways }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'atc-operation-timeline',
    'atc://timeline',
    {
      title: 'Operation timeline',
      description: 'Chronologically sorted list of scheduled operations.',
      mimeType: 'application/json',
    },
    async () => {
      const timeline = state
        .getAll()
        .filter((f) => f.status === FlightStatus.Scheduled && f.scheduled)
        .map((f) => ({
          flightNumber: f.flightNumber,
          operation: f.operation,
          priority: f.priority,
          runwayId: f.scheduled!.runwayId,
          gateId: f.scheduled!.gateId,
          startMinutes: f.scheduled!.startMinutes,
          endMinutes: f.scheduled!.endMinutes,
        }))
        .sort(
          (a, b) => a.startMinutes - b.startMinutes || a.flightNumber.localeCompare(b.flightNumber),
        );
      return {
        contents: [
          {
            uri: 'atc://timeline',
            mimeType: 'application/json',
            text: JSON.stringify({ operations: timeline }, null, 2),
          },
        ],
      };
    },
  );
}
