# Store ingest security cutover (#885) — NOT DEPLOYED

## Ownership and boundary
Owner-approved lease transfer is recorded in #885 comment 6999806921.
This draft must not be merged/deployed without independent security acceptance and separate high-risk release approval.

## Explicit D1 provisioning
The route never provisions its own schema. On an approved **disposable** D1 database,
apply `schema/store-ingest.sql` using the project's reviewed Wrangler D1
migration procedure, then independently verify the table definition and perform
an authenticated upload/readback against that disposable database. Repeating
the SQL is idempotent. Do not apply it to production without separate approval.
A missing schema returns HTTP 503, with zero request-time DDL.

## Trusted SKU publication
`STORE_PUBLIC_APPROVED_HREFS` is a JSON array of exact relative
`/purchase/item/<sku>` identities (or independently verified legacy\n`/purchase/<sku>` identities), optionally including verified query strings.
It must be curated **outside the ingest snapshot**, from a reviewed official
Pokémon GO Web Store public catalogue with evidence of SKU identity and
public visibility. Record source URL, capture time, reviewer and approved
identities in a private operator-controlled release record. The ingestion
payload, public GET, unknown standalone offers, private regional prices and
the raw D1 row MUST NOT be used to self-approve identities.

Every observed SKU must be approved. Unknown or private-only offers cause
public GET to fail closed (503); they are **not** silently filtered because
that would falsify completeness/removal evidence. A reviewed standalone
public offer is eligible when its exact href is approved. Approval changes
must be independently reviewed before updating the Worker configuration.
Do not put secrets or private SKU identities in GitHub comments or public
catalogue files.

## Consumer compatibility
The existing Store-watch workflow uses unauthenticated GET
`/api/store-ingest` and expects the complete public watcher snapshot plus
`x-store-received`. After trusted approval configuration, the projection
retains producer completeness, public price and countdown fields and
heartbeat. Authenticated `x-ingest-key` GET is the raw-evidence readback
for the operator only; it is `private, no-store`. Never add the key to
the public Store-watch workflow.

## Acceptance before production
- Independent diff/security review of Worker auth, public projection, SQL,
  Store-watch and test fixtures.
- Exact-head Tests and CodeQL green, fake-D1 no-write and unauthorized
  disclosure tests, malformed inputs, replay and concurrency regression.
- Disposable D1: schema provision twice, authenticated upload, authenticated
  raw readback, approved public GET, missing-schema and unapproved-SKU 503,
  and no unauthenticated DDL/write evidence.
- HA Reader upload and Store-watch freshness check on a controlled staging
  endpoint, with legitimate standalone offers represented.
- Separate approval for high-risk production auth/public-private changes,
  migrations and secrets. Confirm rollback and production/iPhone journeys.

## Verified compatibility discovery (20 November 2026)

The current main `public/store-current-snapshot.json` contains 33 catalogue
items, and all 33 `href` values use `/purchase/item/<sku>`. This file is
a **compatibility observation, not independent approval provenance**: it is
generated application data and must not be promoted to the trusted approval
list automatically. The projection now accepts this official-shaped path as
well as previously supported `/purchase/<sku>`, but still rejects arbitrary
nested paths, encoded traversal and unapproved identities. The fake-D1 tests
include observed official-shaped examples and malformed URLs.

Before publication, a reviewer must compare every observed href with
independently captured official public AU Store listing evidence, including
standalone offers. Record the capture time and independent reviewer outside
the ingest payload. An unapproved new SKU keeps public GET at 503; it must
not be silently omitted or auto-approved from `public/store-current-snapshot.json`.

## Wrong-key abuse protection (release blocker)

Wrong-key GET/POST now return 401 without D1 reads/writes. The previous
database-backed wrong-key counter was deliberately removed from this route
to enforce the zero-unauthenticated-write requirement. **Do not interpret
that as equivalent rate limiting.** Before deployment, independently
configure and verify an edge-enforced rate-limit rule for
`/api/store-ingest`, scoped to invalid or excessive attempts without
penalizing the authenticated Melbourne Reader or public Store-watch GET.
Use a staging endpoint and fake credentials to demonstrate blocked repeated
invalid attempts, legitimate Reader POST, public GET, and no D1 writes.
Record the actual Cloudflare rule identifier, action, match criteria,
limits, observed response and rollback in the private release evidence.
The rule is not provisioned by this PR; production edge changes require
separate security/infrastructure approval.
