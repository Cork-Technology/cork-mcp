# Operator guide

This guide describes the release decisions implemented by the repository. It does not provide production keys, endpoints, credentials, provider identities, generations, or deployment values.

## Ownership

| Artifact                             | Accountable organization     | Required separation                                                                                                |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Capability and deployment generation | Protocol Release Engineering | Own repository root, paths, keys, review/promotion, publisher, transparency, rollback and disable successors       |
| Signing-policy generation            | Security Engineering         | Different repository root, paths, keys, review/promotion, publisher, transparency, rollback and disable successors |
| Canonical operation package          | Protocol Engineering         | Exact immutable package candidate and capability-local vectors                                                     |
| Hosted composition and controls      | Product Infrastructure       | Stable adapter, credentials, limits, isolation, health and transport metadata                                      |
| Production activation decision       | Named accountable owners     | Exact package, conformance, evidence generations and health drill                                                  |

No owner acceptance is inferred from code, tests, or this document.

## State model

[`ReleaseController`](../packages/gateway/src/release-controller.ts) separates implementation, activation, and runtime health.

| Event                                    | Implemented | Activated | Healthy | Callable | Recovery rule                                         |
| ---------------------------------------- | ----------- | --------- | ------- | -------- | ----------------------------------------------------- |
| Locally implemented, no operator binding | true        | false     | either  | false    | Requires explicit activation                          |
| Exact generation activated and healthy   | true        | true      | true    | true     | Remains bound to that exact generation                |
| Recoverable provider/runtime drift       | true        | true      | false   | false    | May recover health under the same active generation   |
| Health recovery                          | true        | true      | true    | true     | Allowed only while the same generation remains active |
| Explicit deactivation                    | true        | false     | either  | false    | Health cannot restore operator intent                 |
| Retirement                               | true        | false     | either  | false    | Terminal for the bound generation                     |
| Emergency tombstone                      | true        | false     | either  | false    | Terminal for the bound generation                     |
| Higher active generation appears         | true        | false     | either  | false    | Requires a new explicit activation decision           |

Registration must project only `callable=true` capabilities. A healthy but unactivated capability is not callable. An activated but unhealthy capability is not callable.

## Release inputs

Before considering activation, collect accountable artifacts for:

- the exact immutable direct package candidate;
- capability-local schema, profile, vector, and core-build digests;
- candidate-format checks and router pass-through checks;
- release-candidate parity when the exact required package exists;
- Protocol Release Engineering deployment evidence;
- Security Engineering policy evidence where applicable;
- production providers and quorum membership;
- Safe code identities and token onboarding values where applicable;
- complete maker-service assumptions and an approved production database for limit orders;
- the immutable merged Request for Comments 007 release and seven producer schema digests for market deployment;
- capability-specific hosted cost, cancellation, timeout, recovery, redaction, and isolation evidence;
- named owner acceptance.

Use [the release runbook](../operations/runbooks/release.md) to record the decision.

## Health operations

Health watchers may evaluate:

- exact deployment and policy generation status;
- runtime code identity and proxy relationships;
- provider agreement and freshness;
- upstream source pin and schema drift;
- capability-specific service availability;
- queue, simulation, response-size, and first-party reserve bounds.

When a recoverable check fails:

1. set `healthy=false`;
2. remove callable registration;
3. preserve activation only if the exact evidence generation is still active;
4. retain diagnostics showing expected and observed identity;
5. restore health only after the same generation passes again.

Do not publish retirement or a tombstone merely to represent a transient provider outage. Conversely, do not represent a retired or emergency-disabled generation as a health failure.

## Deactivation, retirement, and emergency disable

Explicit deactivation is a local operator decision that clears the generation-bound intent. Retirement is a signed terminal successor under the owning evidence root. Emergency disable is a terminal tombstone/disable successor under the applicable root.

All three remove callability. Retirement and emergency disable also make the bound generation ineligible for health recovery. Use [the emergency-disable runbook](../operations/runbooks/emergency-disable.md) for the terminal path.

## Limit-order operations

Service acceptance is `accepted-not-filled`. Operators must retain:

- the exact idempotency key and request digest;
- durable version and lease transitions;
- every upstream attempt and response identity;
- ambiguity reconciliation evidence;
- any proved-absence evidence authorizing the single retry;
- chain-authoritative fill, cancel, invalidator, expiry, balance, and allowance observations.

Do not manually resend because a lease expired or a request timed out. Do not advertise a submit-only capability. Maker, submission, taker, cancellation, revocation, and reconciliation release together.

## Market-deployment operations

Preserve all producer artifacts byte-for-byte. Keep raw registry observations in a separate evidence section and label `meta.reads` and `deployed` untrusted.

Before an existing-wrapper decision or byte freeze, verify the `(ca, ref)` order and obtain two-provider same-block agreement on lookup, factories, runtime code, assets, denominations, conversion feeds, and all byte-affecting facts.

The operator hands unsigned Safe and transaction artifacts to the caller. The service does not sign, confirm, broadcast, or claim deployment. Partial registry completion is reconciled without modifying the original staging or unsigned Safe proposal artifacts.

## Current readiness

The repository contains deterministic local implementation and Node.js test evidence. It does not contain the production release inputs listed above. The release-candidate protocol package is unavailable, local Rust verification was skipped, and no production activation or accountable owner acceptance is recorded.

See [traceability and readiness](./traceability-and-readiness.md) for the complete blocker register.
