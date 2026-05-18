#!/usr/bin/env node
import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { type AppConfig, loadConfig } from './config';
import { registerResources } from './mcp/resources';
import { registerTools } from './mcp/tools';
import { createAirportState } from './state/airportState';

async function main(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }

  const state = createAirportState();
  const server = new McpServer({
    name: 'atc-mcp-server',
    version: '0.1.0',
  });

  registerTools(server, state, config);
  registerResources(server, state, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
