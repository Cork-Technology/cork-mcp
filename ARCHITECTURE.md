# Architecture contracts

## Status and scope

This document fixes the repository-level contracts for RFC-010 and describes the implemented package seams plus the still-unresolved release flow. The browser-safe core, Node-only adapters, gateway controls, stable Model Context Protocol adapter, release controller, and Rust signing-gate source exist. The recorded Node.js baseline passes its aggregate gates, while local Rust verification was skipped.

Implementation and local tests do not establish a production release. No production hosted deployment, immutable capability-current package candidate, signed deployment or policy generation, or activation decision is claimed.

## One canonical core

There is exactly one canonical Cork operation implementation: the browser-safe `@corkprotocol/operations` package planned at `packages/operations/`.

It owns:

- closed wire schemas and generated projections;
- canonical scalar and digest rules;
- operation identity and immutable state transitions;
- reconstruction of caller-held artifacts;
- quorum comparison and deployment-bound deterministic verdicts;
- capability maturity derivation;
- byte-producing profile logic and reconciliation rules.

The hosted gateway and direct-library entry points are adapters over that same implementation. They must not contain a second encoder, weaker validation path, alternate digest rule, or transport-specific business decision.

## Package layout

| Package or path             | Contract                                                            | May depend on                                          |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/operations/`      | Browser-safe canonical core, schemas, and direct library            | Browser-safe dependencies only                         |
| `packages/operations-node/` | Closed provider/service observation ports                           | Public `operations` types and Node-only dependencies   |
| `packages/gateway/`         | Stable Model Context Protocol transport and hosted policy           | Public `operations` and `operations-node` surfaces     |
| `packages/conformance/`     | Exact-artifact, hosted/direct, boundary, and lifecycle verification | Public artifacts and adapters under test               |
| `crates/signing-gate/`      | Independent Rust policy and exact-byte decision boundary            | Rust dependencies; no TypeScript operation-core import |

Co-location in a workspace does not merge accountability. Protocol Engineering owns the canonical core and schemas; Product Infrastructure owns hosted transport and policy; Protocol Release Engineering owns deployment evidence; Security Engineering owns the independent signing gate and its separate policy root.

## Dependency direction

Dependencies flow in one direction:

`schemas -> operations -> operations-node -> gateway`

Conformance code may depend on the public artifacts and adapters it verifies. Tooling may consume explicit public formats. No production package may depend on conformance or release tooling.

The following reverse dependencies are forbidden:

- `operations` importing `operations-node` or `gateway`;
- schemas importing executable code;
- Node-only providers influencing pure-core comparison or verdict code;
- gateway transport types entering canonical result digests;
- package code importing workspace source to bypass an immutable candidate artifact;
- any package importing the independent Rust signing gate as TypeScript implementation logic.

Package-boundary tests must enforce these rules mechanically.

## Browser-safe and Node-only seam

The browser-safe package has no provider, credential, filesystem, process, socket, child-process, or Node-only runtime dependency. Its shared TypeScript baseline deliberately supplies no ambient Node or browser globals. A browser package must opt into the Document Object Model library explicitly; a Node package must opt into Node types explicitly.

Node-only integrations may read chains and services. Their output is a closed raw observation or typed failure bound to source/provider identity, request, immutable source pin, and—when independently observed—the agreed block number, block hash, and parent hash.

Node-only integrations do not:

- decide that providers agree;
- reconstruct evidence;
- promote an upstream payload into deployment truth;
- choose action bytes;
- sign, confirm, broadcast, or retry caller activity.

Those decisions remain in the pure canonical core and fail closed when observations are incomplete or inconsistent.

## Capability-local maturity

Every specified capability reports independent maturity fields:

- `specified`: the normative source defines it;
- `implemented`: the common kernel plus that capability's complete schema, code, fixtures, and vectors are released;
- `activated`: one exact signed active evidence generation is explicitly bound for the requested context;
- `healthy`: current runtime dependencies pass their checks;
- `unavailableReason`: a closed reason and remediation whenever a later field is false.

Callability is derived exactly as:

`implemented && activated && healthy`

Recoverable mismatch, outage, or drift changes health only while the exact bound evidence generation remains active. Retirement or emergency disable terminates that binding and clears activation immediately. Health recovery cannot reactivate it. A higher active generation requires a new explicit activation decision.

An incomplete unrelated profile must not block a complete capability. A complete capability must not make an incomplete profile appear implemented.

## Fail-closed invariants

The implementation must preserve these repository-wide invariants:

1. The gateway and core never hold keys, sign, confirm Safe transactions, broadcast, or own caller retry scheduling.
2. Public operations are statically named and typed. There is no arbitrary contract-call builder, arbitrary network proxy, caller-selected host, method, path, provider, or header.
3. Caller-held artifacts, declared digests, observations, templates, and derived fields are untrusted on every re-presentation.
4. Before returning new executable bytes, the core strictly parses, re-digests, reconstructs every byte-affecting field from authoritative inputs, and rejects missing, extra, or mismatched fields.
5. A mandatory independent current-state quorum precedes byte freeze.
6. Simulation is advisory and occurs after byte freeze; it cannot mutate, suppress, or relabel valid finalized bytes.
7. States and evidence are immutable. Retries and refreshes create new artifacts rather than mutating prior artifacts.
8. Source payloads and typed read projections are never deployment truth without a separate verified-market reconstruction.
9. Transport metadata, authentication, quotas, tracing, and redaction remain outside canonical core digests.
10. The seven capped-input variants remain visible but non-callable and emit no approval, signing request, template, or executable bytes until every activation gate passes.

## Immutable artifact lifecycle

The operation lifecycle is append-only and content-addressed:

1. Validated intent and authoritative dependencies produce a new immutable prepared or prerequisite result.
2. Finalization consumes the complete prepared artifact as untrusted input and reconstructs it.
3. Verified authorizations produce a new finalized artifact whose executable bytes never change.
4. Simulation and independent-gate decisions are separate artifacts that reference the unchanged finalized digest.
5. Caller-owned broadcast, submission, receipts, and Safe confirmations remain outside the core.
6. Reconciliation consumes caller-supplied evidence as untrusted input and emits a new terminal observation at a named chain or service state.

No service reloads and mutates an artifact by operation identifier. A successful hosted response is not proof of transaction execution, order fill, cancellation, deployment, or capability activation.

## Capability-local package and release flow

Release qualification is capability-local:

1. Release the common kernel and the capability's complete closed schema-and-vector profile.
2. Complete the capability implementation.
3. Reproducibly emit an immutable `DirectPackageCandidateV1` containing the exact package path and release identity, artifact digest, source commit, schema/profile digests, core-build digest, and capability set.
4. Install that exact artifact in direct, stable hosted, and release-candidate hosted conformance. Do not rebuild it, import workspace source, or substitute another artifact.
5. Record conformance against the same package and core-build identity.
6. Bind the conformance-proven identity to the applicable immutable deployment generation and, where required, the separate signing-gate policy generation.
7. Make an explicit activation decision.
8. Derive callability from implementation, generation-bound activation, and runtime health.

T-08 establishes the browser-safe boundary, export and build scaffold, and reproducible candidate format. Its scaffold artifact is not capability-current. Each later capability lane emits a new candidate only after that capability's code exists.

## Evidence and ownership separation

Deployment/capability evidence and signing-gate policy are separate trust roots:

- Protocol Release Engineering publishes deployment generations under its immutable repository path, keyring, promotion record, release identity, and transparency record.
- Security Engineering publishes signing-gate policy generations under a different repository path, keyring, promotion record, release identity, and transparency record.

The roots, keys, approvals, and publication paths never merge. Hand-built fixtures, mutable paths, cross-root signatures, missing release identity, or missing promotion evidence fail closed.

## Hosted gateway boundary

The gateway owns only Model Context Protocol transport, authentication, authorization scopes, quotas, bounded work, tool filtering, redaction, isolation, cancellation, timeout, narrow durable submission state, and transport metadata.

It calls the canonical core through public package interfaces. Both supported protocol eras must use the same exact core build and schemas. Hosted/direct parity applies only to the complete identical-input tuple and only to canonical results and executable bytes; incidental transport metadata is excluded.

The stable adapter is implemented against `@modelcontextprotocol/sdk` `1.29.0`. The release-candidate adapter is fail-closed because exact `2.0.0-beta.4` is unpublished. A stable substitution is forbidden.

## Container and deployment boundary

The root container definition is a reproducible multi-stage build/runtime foundation. It uses a digest-pinned Node.js 22 image, separates development and production dependencies, and runs as a non-root user.

It deliberately has no service entry point, embedded credential, deployment target, production health contract, or activation statement. A capability becomes deployable only after its package, conformance, runtime controls, evidence generations, and explicit activation are complete.

## Production blockers

Before production:

- emit and conformance-test exact immutable capability-current package candidates;
- restore the release-candidate protocol lane only when exact `2.0.0-beta.4` is published;
- approve Safe singleton/handler code identities, provider quorum membership, token profiles, maker-service assumptions, and a production database;
- publish and verify the Protocol Release Engineering deployment root and separate Security Engineering policy root with real review, publisher, key, and transparency records;
- release the immutable merged RFC 007 producer authority and exact deployment generations;
- provide reviewed production runtime configuration, hosted endpoint deployment, health behavior, and operational ownership;
- run and retain activation, health-loss/recovery, rollback, deactivation, and emergency-disable drills;
- complete named owner acceptance.

Until those steps land, this repository is a tested implementation workspace, not a production service or release.
