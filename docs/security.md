# Security model

The central security property is non-custody. The operation core and gateway never hold signing keys, sign orders or transactions, collect Safe confirmations, submit Safe transactions, broadcast, or schedule caller retries. They construct, validate, reconstruct, compare, and reconcile immutable artifacts.

## Trust boundaries

| Boundary                          | Trusted responsibility                                                                                                                 | Explicitly untrusted                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Browser-safe core                 | Canonical parsing, hashing, operation identity, reconstruction, quorum comparison, deterministic verdicts, byte freeze, reconciliation | Caller-held artifacts, reader verdicts, source payload claims |
| Node observation package          | Bounded reads and typed source/request/provider observations                                                                           | Quorum and deployment verdicts                                |
| Hosted gateway                    | Authentication scopes, static tool routing, bounded work, cancellation, redaction, narrow durable submission state                     | Canonical encoders, signing, chain truth                      |
| Protocol Release Engineering root | Deployment/capability generation publication                                                                                           | Security Engineering policy approval                          |
| Security Engineering root         | Signing-policy generation publication and independent gate                                                                             | Deployment/capability publication                             |
| Caller                            | Keys, signatures, Safe confirmations, broadcast, receipts, retry policy, economic decisions                                            | Any claim that a hosted response proves execution             |

Dependencies flow from [`operations`](../packages/operations/src/index.ts) to [`operations-node`](../packages/operations-node/src/index.ts) to [`gateway`](../packages/gateway/src/index.ts). Reverse imports into the browser-safe core are forbidden and covered by [`browser-boundary.test.ts`](../packages/operations/test/browser-boundary.test.ts).

## Fail-closed reconstruction

Every caller-held artifact is untrusted when re-presented. The core:

1. strictly parses a closed shape;
2. rejects missing and unknown fields;
3. reconstructs byte-affecting fields from authoritative inputs;
4. recomputes identities and digests;
5. establishes current-state quorum before byte freeze;
6. returns new immutable output rather than mutating an earlier artifact.

Simulation occurs after byte freeze and is advisory. It can produce evidence about unchanged bytes but cannot mutate, suppress, or relabel a finalized operation.

## Safe authorization separation

Safe authorization contains three distinct security decisions:

1. Configuration and authority inspection binds owners, threshold, singleton, compatibility fallback handler, code hashes, guard, modules, nonce, balances, allowances, and Permit2 state.
2. Two different Permit2 digests receive two different Safe Ethereum Improvement Proposal 1271 message validations.
3. The resulting `safeTxHash` receives later caller-owned Safe transaction confirmations.

The first two stages do not authorize the third. The gateway never converts message signatures into Safe transaction confirmations.

A nonce-only change can rebuild the wrapper while preserving message signatures only when [`safeAuthorityDigest`](../packages/operations/src/safe.ts) is unchanged. Any authority change requires a full restart. Production use is blocked until approved Safe singleton/handler addresses and code hashes are published through accountable evidence.

## Token and allowance authority

Standing Permit2 approval is allowed only for a manifest-verified Cork pool share token relationship. The disclosure is presented before authorization, the prerequisite ends the current attempt, and historical manifest relationships remain available for revocation after retirement.

Exact-spend action funding is caller-owned and exact. The core rejects a maximum-balance sweep or a funding amount that differs from the profile-derived amount.

Limit orders use classic allowance, not Permit2. Maker allowance is shared and persistent:

- it covers the checked sum of complete Cork-known remaining making amounts plus the new order;
- inventory must be maker-wide, authenticated, complete across pages, and chain-reconstructed;
- orders or signatures outside Cork may consume the same allowance;
- owner revocation through the manifest-derived token/spender pair is the terminal control.

Production use remains blocked on token onboarding/profile values and complete maker-service assumptions.

## Durable submission

Signed-order submission is the only narrow server-side durable state. [`SubmissionService`](../packages/gateway/src/submission.ts) requires versioned compare-and-set ownership, bounded leases, a durable pre-network `started` transition, ambiguity reconciliation, and no more than two upstream attempts.

Lease expiry is not proof of absence and cannot by itself authorize resend. A successful service response means `accepted-not-filled`; chain events and invalidators determine fill and cancellation truth.

The in-memory repository is a test substitute. Production construction refuses it and requires an approved production database decision covering the engine and minimum version, durability, isolation/transaction pattern, database clock or lease authority, migrations, rollback, and production-like tests.

## Market deployment dual authority

Market deployment preserves the Request for Comments 007 producer artifacts byte-for-byte under one immutable merged release. The registry read source cannot regenerate or override the handoff, resolved artifact, verdict, Build, staging evidence, unsigned Safe proposal, or attestation.

Registry assets, oracle results, raw `meta.reads`, and raw `deployed` are untrusted observations. Before any existing-wrapper verdict or byte freeze, two independent providers must agree at one block number, hash, and parent hash on the order-sensitive `(ca, ref)` lookup and every byte-affecting relationship.

The core prepares or reconciles artifacts. It never claims that simulation, a predicted wrapper, a raw source flag, a submitted Safe proposal, or a transaction receipt alone proves deployment.

## Evidence roots

Protocol Release Engineering owns deployment evidence:

`Cork-Technology/cork-deployments/generations/{deploymentId}/{generation}/`

Security Engineering owns signing policy:

`Cork-Technology/cork-signing-gate/policy-generations/{policyId}/{generation}/`

Each root needs its own repository path, canonical payload, digest, ordered signatures, review/promotion record, publisher identity, repository commit/release identity, transparency record, and successor or tombstone. Keys, publishers, review paths, and promotion authority must remain separate.

The local TypeScript consumers validate these structures, and Rust signing-gate source and vectors are present. The recorded environment did not execute Rust formatting, linting, native tests, or WebAssembly verification. Production remains blocked on publication keys, publishers, and transparency mirrors plus exact deployment and policy generations.

## Hosted protocol and operational controls

The stable Model Context Protocol lane is pinned to software development kit `1.29.0`. The release-candidate lane requires exact `2.0.0-beta.4`, which is unpublished, so it fails closed. Substituting the stable package would invalidate protocol-era conformance.

Hosted controls implement:

- credential validation and bounded revocation caching;
- a static nine-family public registry, statically mapped internal operations, and closed discriminated inputs;
- per-principal and global weighted work limits;
- first-party reserved capacity;
- cancellation and deadlines;
- recursive telemetry redaction.

These controls are local implementation evidence. They do not establish a deployed credential issuer, endpoint, quota profile, observability sink, or production isolation result.

## Activation and health

Callability is exactly:

`implemented && activated && healthy`

Recoverable provider outage, runtime mismatch, or drift changes health only while the same exact generation remains active. Health may recover.

Explicit deactivation clears operator intent. Retirement or emergency tombstone clears activation and cannot be reversed by health recovery. A higher generation also remains inactive until an explicit new activation decision binds its exact package, conformance, deployment evidence, and policy evidence.
