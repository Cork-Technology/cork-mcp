# Emergency disable runbook

Use this runbook when an active capability must become terminally unavailable. Do not use it for an ordinary recoverable provider outage; that is a health transition.

This runbook contains no production keys, endpoints, provider names, or generation values.

## 1. Trigger

Record:

- affected capability and exact bound package/conformance identity;
- exact deployment and policy generations;
- trigger time;
- observed exploit, code-identity drift, compromised publication authority, unsafe dependency, or other terminal reason;
- incident commander and evidence owners.

Preserve current diagnostics and callable-registration state before changing anything.

## 2. Publish the terminal successor

The owning evidence organization publishes the appropriate immutable terminal artifact:

- Protocol Release Engineering publishes a deployment/capability emergency tombstone or disable successor under the deployment root.
- Security Engineering publishes a policy emergency tombstone or disable successor under the policy root when that root is affected.

The tombstone must bind the same target generation and unchanged prior content digest, state the reason, carry the allowed emergency signature threshold, identify the publisher, and record transparency. It may disable only; it cannot activate, rewrite content, or introduce a replacement.

Never place policy material under the deployment root or deployment material under the policy root.

## 3. Verify activation clears

After consumers observe the terminal successor:

1. evaluate the exact prior release-controller input;
2. verify `activated=false`;
3. verify `callable=false`;
4. verify generation-bound operator intent is cleared;
5. verify diagnostics report terminal generation status rather than recoverable health.

## 4. Verify registration disappears

Query the hosted capability inventory and static tool projection:

- the affected capability is not callable;
- its mutation tools are absent from callable registration;
- unrelated capabilities retain only their independently valid state;
- all seven capped-input variants remain non-callable.

Retain the before/after inventory and registration artifacts.

## 5. Prove health cannot restore it

Set or observe healthy runtime dependencies after the terminal successor:

- `healthy` may be diagnostically true or false;
- `activated` must remain false;
- `callable` must remain false;
- no health watcher may recreate operator intent.

Any automatic re-registration is a release-controller incident.

## 6. Communications and evidence preservation

Prepare accountable internal and external communications containing:

- affected capability and scope;
- terminal status and effective time;
- what callers must stop doing;
- treatment of caller-held prepared/finalized artifacts;
- limit-order reconciliation or allowance-revocation guidance where applicable;
- market-deployment partial-execution reconciliation guidance where applicable;
- next update owner and cadence.

Preserve publication artifacts, signatures, transparency records, controller diagnostics, registration snapshots, logs, request identities, receipts, and reconciliation evidence. Redact credentials, signatures, private endpoints, calldata, and caller-sensitive material from telemetry and communications.

## 7. Later generation

A remediation release uses a higher immutable generation and a new package/conformance identity when code or policy changed.

Before it can become callable:

1. rerun capability-local conformance;
2. publish reviewed deployment and policy generations;
3. repeat owner checks and operational drills;
4. make an explicit new activation decision;
5. verify the old terminal generation remains terminal.

Never remove or overwrite the tombstone, and never treat a later healthy generation as implicit reactivation.
