# Signed-order submission persistence contract

No executable production migration is selected in this package. Production construction remains unavailable until an approved, current `DatabaseDecisionV1` chooses the database engine and minimum version, durability and recovery posture, transaction isolation, atomic create-if-absent and compare-and-set patterns, database clock and lease authority, migration and rollback plan, and production-like evidence.

The durable key is the exact tuple `(principalId, upstreamProfileId, clientRequestId)`. Records are immutable closed values advanced only by atomic compare-and-set over `recordVersion`, expected state, dispatch phase, and exact lease purpose and owner. Every update advances the version by one and preserves `submissionRequestDigest`.

Record invariants:

- New records are `pending/claimed`, version 1, attempt count zero, with a complete dispatch lease.
- `attemptCount` increments only in the durable `claimed -> started` transition immediately before an upstream submission call, and never exceeds two.
- Pending records always have a dispatch lease and `claimed` or `started` phase.
- Idle ambiguous records have no lease. Reconciliation ownership uses a complete reconcile lease.
- Accepted and rejected records have no lease or dispatch phase and retain the exact decoded upstream result for byte-stable replay. Accepted means accepted-not-filled.
- Expired claimed dispatch may be re-leased without incrementing attempts. Expired started dispatch becomes idle ambiguous before reconciliation.
- Lease expiry never authorizes submission. Proved absence under the upstream consistency window and attempt count one may atomically replace reconcile ownership with one claimed retry.

Migration must preserve every key, digest, version, state, phase, attempt count, timestamp, lease field, upstream result byte, upstream order identifier, and ordered reconciliation evidence. Rollback must not reinterpret or drop a committed state. A deployment must validate all existing rows before enabling the new adapter; incompatible rows require forward repair or an explicit activation refusal.

The in-memory repository is only a named local test substitute. It is not a durability, isolation, clock, lease, migration, rollback, or production evidence claim and is rejected by production construction even when supplied with an otherwise approved decision artifact.
