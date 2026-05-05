# Engineering retrospective

## Stack

- **TanStack Start (v1) + Vite 7** — file-based routing, isomorphic loaders, server functions via `createServerFn`. Picked over Next/Remix because the project runs on a Cloudflare Workers SSR runtime where TanStack Start's bundler-aware server fn split is friendlier than RSC.
- **Lovable Cloud (Supabase)** — managed Postgres + auth + storage. Service role key stays server-side; user-scoped queries go through a `requireSupabaseAuth` middleware that injects an authed client.
- **shadcn/ui + Tailwind v4** — semantic tokens in `src/styles.css` (oklch), no raw color classes.
- **PL/pgSQL for hot paths** — RSVP creation, waitlist promotion, check-in by code, feedback upsert. Keeping these as `SECURITY DEFINER` functions makes the contract explicit and serializable.

## What worked

- **`createServerFn` + middleware** keeps secrets and admin clients out of the client bundle without ceremony. The `.functions.ts` / `.server.ts` split caught two import-protection regressions during build.
- **Atomic waitlist via `SELECT … FOR UPDATE`.** Single Postgres function locks the event row, counts going RSVPs, and either inserts a confirmed RSVP or appends to the waitlist. Cancellation triggers re-check the going count under the same lock and promote the next waitlister.
- **Idempotent seed.** `IF NOT EXISTS`-style guards mean we can re-run the seed against any environment without dupes.

## What was hard

- **RLS edge cases.** `auth.uid()` is unreliable inside server-fn contexts when we mix admin and user clients; we standardized: read with admin where the server already verified the actor, write with the user client wherever RLS encodes the rule. Reports needed admin insert with explicit `reporter_id` because the underlying request had no Postgres session JWT.
- **Ambiguous column references.** Two RPCs (`check_in_by_code`, host listings) referenced `display_name` / `checked_in_at` without table aliases — Postgres is happy at definition time, then complains at runtime when a column with the same name appears in two joined tables. Fixed by aliasing every column in the function body.
- **Timezones.** Events store `starts_at` as `timestamptz` with a sibling `timezone` text. Rendering uses `Intl.DateTimeFormat` with the event's IANA zone, never the viewer's. ICS export emits a `TZID` block per event.
- **OG metadata server-side.** TanStack's `head()` runs at SSR; per-route `og:image` overrides the root entry only when set on the leaf — the dynamic event route resolves cover URL from the loader and threads it into `head({ loaderData })`.
- **CSV encoding.** Excel on macOS misreads UTF-8 without a BOM. The export edge function emits `\uFEFF` first, RFC 4180 escapes (`""` for embedded quotes), `\r\n` line endings.
- **Server-only import leaks.** `src/integrations/supabase/client.server.ts` is gated by Vite's import-protection plugin. Helper functions that touched it had to live in `*.server.ts` and only be re-exported through a `.functions.ts` wrapper to keep them out of the client bundle.

## Notable decisions

- **Manual code entry over camera scanning.** A 12-character base32 code (excluding visually-confusable chars) typed by the door volunteer is faster than asking permission for camera access on a borrowed laptop, and works offline. Codes are uppercase-normalized at lookup.
- **Server-rendered OG metadata.** Sharing into Slack/iMessage/Twitter relies on bots fetching the page synchronously; client-injected meta tags would lose every preview. The `head()` hook on `/e/:slug` runs in SSR so the cover URL ships in the initial HTML.
- **Atomic waitlist promotion as a PG function.** Doing this in app code would race under concurrent cancellations. The function lives next to the data, locks correctly, and is unit-testable in SQL.
- **Reports use admin insert, app-level identity.** Avoids subtle RLS interactions between the bearer token and the `reporter_id` check; the server function has already verified the user before writing.

## Known limitations and what doesn't work yet / v2

- No payments. Events are free; the `is_paid` column is reserved for a future Stripe path.
- Rate limiting is per-process (in-memory). Fine for one Worker isolate; would need Durable Objects or a Redis-backed bucket at scale.
- No real-time check-in updates between volunteers (would use Supabase Realtime channel per event).
- Gallery uploads are signed reads; would benefit from CDN/edge caching.
- No bulk actions in moderation/reports.
- No native mobile app — responsive web only.
- QR code scanning is not implemented yet. Check-in is done via manual code entry instead.
