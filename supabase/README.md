# Little Labels access hardening

## Entitlement definition
A currently existing permanent Supabase user (`is_anonymous = false`), not deleted or currently banned, with an entitlement whose `activated_by` is that user's ID and whose status is `activated`. There is no expiration column or paid-tier system. Expired/invalid JWTs are rejected by Supabase Auth/gateway. Anonymous users use the authenticated database role, so role checks alone are insufficient.

## Changes
- Update the existing access-status and activation RPC bodies, retaining their existing EXECUTE ACLs. No table grants are added.
- Activation rejects anonymous/temporary users, disabled codes, codes belonging to another user (even if re-enabled as available), and orphaned activated codes.
- Alter exactly six INSERT/UPDATE/DELETE RLS policies on `labels` and `print_queue` to require both current entitlement and row ownership. UPDATE applies both USING and WITH CHECK. Ownership-only SELECT remains unchanged so previous records remain readable.
- All five AI functions use the same guard: verify a real user through `/auth/v1/user`, reject anonymous users, then call the current entitlement RPC before parsing input or calling OpenAI/retailer URLs. Gateway `verify_jwt = true` adds another layer, not a replacement for user/entitlement checks.
- Every app AI caller sends the current user's JWT and the public API key. Responses are discarded after account/session changes; an expired request is never automatically retried under a new user.
- Existing label/queue/entitlement records are not modified or deleted by this migration. No credentials or paid plans are configured. Approved caps are enforced through a private usage table and self-only quota RPC: text/identification share 20 requests per minute and 200 per UTC day; generated pictures share 3 per minute and 40 per UTC day across both picture endpoints. Invalid or auth-denied requests do not reserve quota; upstream attempts count even if the upstream later fails. These are request caps, not a dollar budget.

## Ordered release
1. Start from reviewed frontend build 109.
2. Run `npm test` and `npm run test:browser` on the exact new commit. CI supplies the browser if the sandbox cannot launch it.
3. Publish build 110's JWT-compatible frontend and verify Pages and the actual loaded helper/callers first. Existing pre-110 open tabs must reload before AI use after the server cutover; allowing them to omit JWTs would retain the vulnerability.
4. Apply `migrations/20261002144429_harden_little_labels_access.sql` to the authorized existing project with the Supabase migration connector. Re-read policies and RPC ACLs.
5. Deploy each of the five `functions/<name>/index.ts` plus `functions/_shared/access.ts` with JWT verification enabled. No OpenAI key is read, changed or logged.
6. Verify deployed versions/source, unauthenticated/invalid-JWT rejection without AI requests, and the rollback-only synthetic SQL test. Rerun security advisors and distinguish unchanged out-of-scope findings.

## Tests and verification boundaries
- `tests/ai-client.cjs`: JWT/public key headers, account races, no foreign-origin credential leak, no retry on expired auth, and all call sites routed through the helper.
- `tests/edge-access.cjs`: every endpoint, valid and blocked identity/entitlement cases, preflight, unsupported methods and auth outages. All external calls are mocked; no real OpenAI cost or child records.
- `tests/database-access.cjs`: actual PostgreSQL via PGlite, schema-only fixture from the pre-change catalog, synthetic users/entitlements/labels, ownership, writes, preserved reads, anonymous/disabled/banned/deleted states, activation repeat/claim/orphan cases, and baseline SQL syntax restoration. It does not test the hosted gateway.
- Live SQL verification uses temporary transaction-only synthetic auth rows with no email, password, token, session or identity. It rolls back all fixtures; it does not grant persistent access or send mail.
- A successful real paid AI call is intentionally not part of verification. Valid handler behavior is established with mocks, and hosted entitlement/RLS behavior with synthetic SQL contexts.

## Rollback
Prefer fail-closed recovery: keep the hardened database policy and server checks, keep a JWT-capable frontend, and repair forward. Keep quota enforcement in guarded functions and retain the private counter table/RPC during recovery. The baseline SQL does not remove quota state or regrant table-wide privileges. A client rollback must not precede build 110 while hardened endpoints are deployed. If an individual function rollout fails, leave successful hardened versions in place and redeploy corrected guarded source; report reduced availability.

`rollback/access-hardening.sql` records the exact old database semantics solely for emergency baseline recovery. It reopens unauthenticated-purchase write paths for signed-in/anonymous accounts and requires a new explicit security decision before production use. Original function versions/checksums are recorded in the deployment report; restoring their unguarded implementations is likewise not a routine recovery step.

The separately approved TRUNCATE/TRIGGER/REFERENCES privileges are revoked only from anon/authenticated on labels and print_queue. Normal SELECT/INSERT/UPDATE/DELETE grants remain unchanged. The quota table is in a private schema, has RLS, and is inaccessible directly to client roles; its RPC accepts no user ID and exposes no label contents. Counters are retained as two bounded metadata rows per account; deleting an account removes its counters through the foreign key.
