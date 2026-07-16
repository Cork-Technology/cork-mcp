# Capability release runbook

This runbook records an activation decision. It does not supply production keys, endpoints, credentials, provider names, package identities, or generations. Every bracketed item must be replaced by an accountable artifact before a production decision.

## 1. Freeze the candidate

Record:

- capability identifier: `[capability-id]`
- `@corkprotocol/operations` package path and release identity: `[immutable-candidate]`
- package artifact digest: `[digest]`
- source commit: `[commit]`
- common schema and core-build digests: `[digests]`
- capability schema, profile, and vector-set digests: `[digests]`

Reject workspace-source imports, local rebuilds, mutable tags, scaffold substitution, or any candidate identity that differs from conformance.

## 2. Verify conformance identity

Confirm that direct and stable hosted lanes consumed the exact candidate above under the complete identical-input tuple.

For the release-candidate Model Context Protocol lane, require exact package `2.0.0-beta.4`. If it remains unpublished, record the lane unavailable and stop the production release. Do not substitute stable.

Record:

- direct evidence: `[artifact]`
- stable hosted evidence: `[artifact]`
- release-candidate evidence: `[artifact]`
- cancellation, timeout, structured-error, redaction, and hosted-cost evidence: `[artifacts]`
- canonical-result and executable-byte parity result: `[result]`

## 3. Verify evidence prerequisites

Protocol Release Engineering supplies the deployment/capability generation. Verify:

- exact repository and immutable generation path;
- canonical payload and digest;
- two ordered root-specific signatures for activation;
- review then promotion record;
- publisher identity;
- repository commit and release identity;
- transparency record;
- successor continuity.

Security Engineering separately supplies a policy generation where the capability requires it. Perform the same checks under the separate policy root and confirm no key, publisher, review, or path is reused across roots.

Reject hand-built fixtures, missing transparency, wrong-root signatures, mutable paths, or a generation whose status is not active.

## 4. Capability-specific prerequisites

Check every applicable row:

- Safe: approved singleton and handler addresses/code hashes; exact owners, threshold, guard and modules.
- Providers: approved independent quorum membership and freshness bounds.
- Actions: token onboarding/profile values and caller-owned funding behavior.
- Limit orders: complete maker-service assumptions, shared allowance disclosure, approved production database decision, recovery evidence.
- Market deployment: immutable merged Request for Comments 007 release, seven schema digests, byte-identical producer artifacts, registry-read source pin, `(ca, ref)` ordering, two-provider same-block proof.
- Hosted service: credential issuance/revocation, weighted bounds, first-party reserve, redaction, isolation, cancellation, timeouts, recovery.

An unresolved row is a no-go, not a warning.

## 5. Owner checks

Collect written acceptance from:

- Protocol Engineering for the canonical package and vectors;
- Product Infrastructure for hosted composition and health;
- Protocol Release Engineering for deployment evidence;
- Security Engineering for signing policy;
- the capability owner for operational support;
- the final accountable activation decision makers.

Each acceptance cites the exact frozen artifacts. Do not infer acceptance from a meeting, code review, test pass, or this runbook.

## 6. Activation decision

Record a signed decision containing:

- capability identifier;
- exact candidate digest;
- exact conformance digest;
- exact deployment generation and digest;
- exact policy generation and digest when applicable;
- decision time and accountable signers.

Invoke the release controller with those exact inputs. Verify:

`implemented=true`, `activated=true`, `healthy=true`, `callable=true`

Confirm callable registration contains the intended capability and no unrelated or capped-input tool.

## 7. Health drill

Introduce an approved recoverable provider/runtime failure:

1. verify `healthy=false`;
2. verify `activated=true` while the same generation remains active;
3. verify `callable=false` and registration disappears;
4. restore the dependency;
5. verify health and callability recover against the unchanged generation.

Record timestamps, expected/observed identities, diagnostics, and registration snapshots.

## 8. Rollback and deactivation drill

Exercise the reviewed non-emergency path:

1. explicitly deactivate and verify activation clears;
2. verify health changes cannot restore it;
3. publish the reviewed retirement or higher-generation rollback successor as applicable;
4. verify the prior generation cannot become callable;
5. require a new explicit activation decision for any higher generation.

Do not reuse the previous operator intent.

## 9. Evidence recording

Store:

- frozen candidate and conformance identities;
- both evidence-root verification reports;
- owner acceptance records;
- activation decision;
- health and rollback drill evidence;
- callable-registration snapshots;
- unresolved blocker register;
- links to incident and emergency-disable procedures.

The record is complete only when a cold reader can reproduce the decision without producer narration.
