# ATC MCP Server — Implementation Report

## Scheduling approach

The scheduler is a deterministic greedy algorithm built around three passes:

1. **Cycle detection** on the dependency graph using a coloured DFS. Any flight that
   participates in a dependency cycle is marked Unscheduled with reason `circular
   dependency`. This guarantees the remaining graph is a DAG.

2. **Stable priority + topological sort** within the DAG. Flights are first sorted by
   priority (`high` → `medium` → `low`) then by flight number ascending, after which a
   topological sort guarantees dependencies are always placed before dependents.

3. **Earliest-slot placement** per flight. For each runway that satisfies the optional
   length requirement, the scheduler finds the earliest start time that:
   - respects runway separation buffers (takeoff / landing / mixed) against neighbouring
     operations on that runway,
   - finds a gate free for the operation window (including a gate-turnaround buffer
     around each gate booking),
   - keeps total concurrent operations within `GROUND_CREW_COUNT`,
   - starts no earlier than `max(dependency.endMinutes) + DEPENDENCY_BUFFER_MINUTES`,
   - ends within `MAX_SCHEDULING_HORIZON_HOURS`.
   The candidate with the smallest start time wins; ties break on runway id then gate
   id (lexicographic).

Flights that cannot be placed are marked Unscheduled with a specific reason:
`no runway meets length requirement`, `dependency unscheduled`,
`exceeds scheduling horizon`, `no available slot within horizon`, or
`circular dependency`. Missing-dependency cases never reach the scheduler — they
are rejected at `submit_flight` time (see the next section). The ground crew constraint is enforced inside slot search;
when it is the active blocker the flight falls under `no available slot within horizon`,
and the status payload's `resourceConstraints` array surfaces ground crew saturation
at the airport level.

### Why greedy

The task brief asked for a *lightweight* server. A greedy algorithm:
- meets every validation scenario in the spec (Morning Rush, Heavy Hauler, Connecting
  Flight);
- is deterministic by construction — no wall-clock reads (`T0 = 0`), stable sorts
  everywhere, deterministic tie-breaking;
- is easy to reason about and to explain — important because the spec demands "the
  reason should clearly indicate that no suitable runway is available", and a greedy
  algorithm's "why didn't this fit" answer is a simple inspection of the failure
  branch;
- has a complexity of roughly O(N · R · W) where N is flights, R is runways, and W is
  the number of existing windows per runway — fast enough for any realistic queue size.

A constraint solver could in principle produce a shorter makespan, but the spec does
not require optimality, only correctness, and the added complexity (plus the
non-trivial work needed to make a CSP deterministic) would not pay off.

## Bottleneck analysis

After a schedule is generated, the bottleneck analysis treats scheduled flights and
their dependencies as a DAG and computes the longest path via dynamic programming:

```
longest(v) = duration(v) + max_{u → v, u scheduled} (longest(u) + DEPENDENCY_BUFFER_MINUTES)
```

Parent pointers reconstruct the chain. Flights with no scheduled-flight dependencies
(i.e. isolated or root-only flights) are deliberately excluded from the chain output —
a "chain" of a single non-dependent flight is not a bottleneck.

## Submit-time validation

`submit_flight` validates dependencies eagerly:

- If a referenced flight does not exist in the queue, submit is rejected with
  `Dependency flight "X" not found. Submit it before flights that depend on it.`
- If a referenced flight exists but is `cancelled`, submit is rejected with
  `Dependency flight "X" is cancelled. Use a different dependency.`

This forces flights to be submitted in dependency order (e.g. the inbound IN1
before the outbound OUT1 that depends on it) and prevents broken submissions from
sitting in the queue. The downside is that "forward references" are not supported
— there is no way to file an outbound before its inbound — but the validation
scenarios in the task spec always submit dependencies first, so this is a
reasonable trade-off and produces clearer feedback for AI clients.

If a dependency is cancelled *after* the dependent has been submitted, the
dependent reverts to `pending` and `generate_schedule` will mark it
`unscheduled` with reason `dependency unscheduled`.

## Cancellation semantics

Cancelling a flight marks it `cancelled` and reverts its dependents to `pending` (the
dependents lose their existing schedule slots). The user must call `generate_schedule`
again to actually re-compute the affected flights' placement. This keeps `cancel_flight`
fast and predictable — cancelling N flights in a row triggers one re-schedule of the
user's choosing, not N hidden re-schedules. The task spec says "should cause dependent
operations to be re-evaluated"; the next `generate_schedule` call is the moment of
re-evaluation.

## Tools and techniques

- **TypeScript** (strict mode, ES modules, `moduleResolution: Bundler`).
- **`@modelcontextprotocol/sdk`** — official TS MCP SDK, stdio transport, the modern
  `registerTool` / `registerResource` API.
- **zod** — env validation (with a JSON-string sub-schema for `RUNWAYS_CONFIG`) and MCP
  tool input schemas via `z.nativeEnum`.
- **dotenv** — local `.env` loading for `npm start`.
- **Vitest** — unit tests for config, state, topology, slot finding, scheduling, and
  bottleneck analysis. The three task scenarios are covered explicitly, alongside a
  determinism test that re-runs the scheduler twice and compares results.

## What worked

- Splitting the scheduler into three small modules (`topology`, `slotFinder`,
  `generateSchedule`) made each piece independently testable and easy to reason about.
  `slotFinder` in particular had subtle logic around separation buffers; isolating it
  meant the bug I introduced in the first version (separation applied only when the
  candidate had already crossed a window) was caught immediately by a focused unit
  test rather than buried inside an end-to-end scenario.
- Using TypeScript string enums for `OperationType`, `Priority`, `FlightStatus`, and
  `UnscheduledReason` — together with `z.nativeEnum` — produced clean MCP tool schemas
  (the JSON Schema emitted by the SDK includes the actual `["arrival","departure"]`
  enums, which makes the tool self-describing for an AI client).
- Fixing `T0 = 0` and avoiding `Date.now()` made determinism a non-issue. The
  determinism test passed on the first try once the sort comparators were stable.

## What did not

- My first version of `earliestRunwayStart` only applied the separation buffer when the
  candidate had already moved past the window. A unit test for the mixed-separation
  case (departure after arrival) caught it immediately, but it was a reminder that
  "respects separation buffers" is the kind of thing where intuition deceives — every
  combination (TT, LL, TL, LT) needs to be considered.
- Initially the Morning Rush scheduler test asserted `high.start < medium.start`, but
  with two runways and two gates there is no contention and both flights start at the
  same minute. The assertion was wrong, not the scheduler. I split it into two tests:
  one for the original mixed-priority scenario (asserting `<=` and no overlaps) and a
  separate single-runway/single-gate contention test that strictly enforces the
  priority order.
- The `registerResource` metadata object does not accept a `name` field (the name is
  the first positional argument); the SDK's type error was misleading at first
  ("`name` does not exist in type `ResourceMetadata`"), and the fix was to use `title`
  in metadata and keep `name` as the positional argument.
- **MCP Inspector v0.21.x has UI state-caching bugs that are not in our server.**
  Switching between resources keeps the previously rendered content visible while the
  header label updates; the `Refresh` button does not always invalidate the cache. The
  same pattern affects tool switching (stale form values) and pagination. We verified
  our server returns correct distinct content for each URI on every call by driving it
  directly via JSON-RPC and through Claude Desktop. To work around the bug inside
  Inspector, click `Clear` then `List Resources` between reads, or restart the server.
  Related upstream issues:
  [#197](https://github.com/modelcontextprotocol/inspector/issues/197),
  [#527](https://github.com/modelcontextprotocol/inspector/issues/527),
  [#609](https://github.com/modelcontextprotocol/inspector/issues/609).
- The MCP TypeScript SDK's `registerTool` overload combines `zod/v3` and `zod/v4` type
  namespaces (the SDK supports both transitively). With TypeScript 5.5+, inferring the
  callback parameter type from a complex `ZodRawShape` (five fields with chained
  `.describe()` / `.optional()` / `.nativeEnum()`) trips the "Type instantiation is
  excessively deep" guard. The runtime is fine — only `tsc` blows up at the call site.
  Workaround: wrap `server.registerTool` in a local type alias with explicit `any`-
  typed callback input, then type each handler's input parameter explicitly using
  `z.infer` from the schema. The handlers stay fully typed; only the SDK boundary is
  loose. This is contained to one file (`src/mcp/tools.ts`) with an explanatory
  comment.
