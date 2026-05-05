I checked the current database state and code path. Your new host (`DevHub Warsaw`) and draft event look correctly owned by your real user, so the earlier synthetic-owner explanation does not apply here.

The likely issue is the `events` update policy used during publish. Publishing calls `setEventStatus`, which updates `events.status` from `draft` to `published`. The current update policy only has a `USING` condition and no explicit `WITH CHECK`, so Postgres applies the same check to the updated row. This can surface as a row-level security violation when the row transitions state.

Plan:

1. Update the `events` RLS update policy
   - Replace the existing `events_update_host_role` policy with a policy that explicitly allows host-role members to update events for their host.
   - Add both:
     - `USING (has_host_role(host_id, auth.uid(), 'host'))`
     - `WITH CHECK (has_host_role(host_id, auth.uid(), 'host'))`
   - This keeps checker users from editing/publishing while allowing actual host users to publish their own draft events.

2. Make the app error clearer
   - Update `setEventStatus` to return a friendlier message if publish/unpublish is blocked, such as: “You need host access to publish this event.”
   - This avoids showing raw database policy errors to users.

3. Verify with the existing new-host draft
   - Confirm `DevHub Warsaw` has your user as `host`.
   - Confirm the draft event (`Building Scalable React Apps in 2026`) remains attached to that host.
   - After the policy migration, test that publishing succeeds for host members and remains blocked for non-host/checker users.

Technical notes:

- I will implement this as a database migration, not by bypassing security in app code.
- I will not loosen event access publicly.
- I will preserve the previous seed-account cleanup decision: synthetic users stay, and extra users stay while their data can remain cleaned up as requested earlier.