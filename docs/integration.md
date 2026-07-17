# Integration guide

This repository exposes three public packages over one canonical operation core:

- [`@corkprotocol/operations`](../packages/operations/src/index.ts) is the browser-safe deterministic core.
- [`@corkprotocol/operations-node`](../packages/operations-node/src/index.ts) contains Node-only provider and upstream readers that return typed raw observations.
- [`@corkprotocol/gateway`](../packages/gateway/src/index.ts) contains the hosted router, stable Model Context Protocol adapter, controls, durable signed-order submission service, and release controller.

These packages are locally implemented and tested. No production endpoint, credential, deployment, or immutable capability-current package candidate is supplied here. A production integrator must consume an exact reviewed release artifact rather than importing workspace source.

## Direct integration

Import canonical construction, validation, and reconciliation from the public package root:

```
import {
  prepareMintCollateralIn,
  prepareLimitOrderMaker,
  reconcileLimitOrder,
} from "@corkprotocol/operations";
```

Inject Node-only observations separately:

```
import {
  CompleteMakerInventoryAdapter,
  MarketDeploymentRawReader,
  PinnedProviderReader,
} from "@corkprotocol/operations-node";
```

The Node package returns source- and request-bound observations. It does not decide quorum, market truth, deployment truth, or action bytes. Pass those observations to the browser-safe core, which reconstructs them and fails closed on missing, inconsistent, or hostile values.

Do not import `packages/*/src` from an integrating application. Release qualification must bind an immutable `DirectPackageCandidateV1` package path, release identity, artifact digest, source commit, schema/profile digests, core-build digest, and capability set. Those production candidates have not been published by this repository.

## Stable hosted integration

The stable adapter uses Model Context Protocol era `2025-11-25` and `@modelcontextprotocol/sdk` `1.29.0`. [`ToolRouter`](../packages/gateway/src/router.ts) exposes only static named tools, capability filtering, closed inputs, cancellation, deadlines, and weighted work admission. [`startStdioServer`](../packages/gateway/src/stable.ts) adapts that router to the official stable software development kit.

An integrating deployment must inject:

- a validated capability inventory;
- canonical-core handlers;
- credential claims and hosted scopes;
- bounded-work controls;
- a clock and cancellation signal;
- any Node-only readers required by those handlers.

No hosted network endpoint or credential shape is declared here. The stable adapter can be composed by an accountable deployer, but the repository does not claim that such a production composition exists.

For protocol exploration without production dependencies, [`docs/local-development.md`](./local-development.md) documents the fixture-only standard-input/output server. That server uses in-memory handlers, labels every response as fixture data, and performs no external or custodial action.

### Canonical result and transport metadata

A successful gateway call returns:

```
{
  ok: true,
  toolName,
  coreResult,
  transportMetadata
}
```

`coreResult` is the canonical operation-core result. Under the complete identical-input tuple, direct and hosted lanes must preserve this result and any executable bytes exactly.

`transportMetadata` contains hosted principal, environment, and scope information. It is not part of the canonical result, operation identity, or executable-byte digest. Authentication, quotas, timing, tracing, and redaction metadata must never change a core verdict.

## Release-candidate hosted integration

The release-candidate era is `2026-07-28-RC` and requires exact package version `2.0.0-beta.4`. That package is unpublished. [`RELEASE_CANDIDATE_ADAPTER_STATUS`](../packages/gateway/src/release-candidate.ts) therefore reports `RELEASE_CANDIDATE_SDK_UNPUBLISHED`, and server startup throws.

This is an intentional fail-closed boundary. Do not substitute the stable software development kit, another beta, workspace source, or a locally rebuilt package.

## Non-custodial client pattern

[`examples/client.ts`](../examples/client.ts) compiles through the three public package roots. It injects:

- hosted transport and raw-observation readers;
- signing;
- Safe transaction confirmation;
- broadcast;
- receipt persistence;
- retry scheduling.

The example invokes only read/transport calls. It never holds keys, signs, confirms a Safe transaction, broadcasts, persists a receipt, or schedules a retry. Instead it returns a caller handoff containing the immutable artifact and the caller-owned ports that may act on it.

Signing and execution artifacts remain untrusted when presented again. Before the core returns any new executable bytes, the caller must pass the complete artifact back through the applicable reconstruction and validation function.

## Safe authorization has three stages

Safe support is a three-stage lifecycle, not a single multisignature operation:

1. Inspect authority and configuration. Validate the exact three-owner, threshold-two configuration, zero guard, no modules, approved singleton, approved compatibility fallback handler, code hashes, current nonce, token balances, allowances, and Permit2 nonce state.
2. Validate two distinct Safe Ethereum Improvement Proposal 1271 message signatures. One validates the collateral principal token Permit2 digest and one validates the collateral swap token Permit2 digest. The digests and signature blobs must remain distinct.
3. After the core derives the wrapper and `safeTxHash`, the caller separately collects the later Safe transaction confirmations. The gateway does not collect, propose, confirm, or submit them.

[`authorizeSafePermitMessages`](../packages/operations/src/safe.ts) implements stage two. [`createSafeExecutionWrapper`](../packages/operations/src/safe.ts) creates the stage-three handoff without collecting confirmations.

If only the Safe nonce changes and the authority digest is unchanged, [`rebuildSafeWrapperForNonce`](../packages/operations/src/safe.ts) rebuilds the wrapper and preserves the two already validated message signatures. If an owner, threshold, singleton, handler, guard, module set, or code identity changes, the authority digest changes and the integration must restart all authorization stages.

Production remains blocked on approved Safe singleton/handler addresses and code hashes. No values are invented in this guide.

## Exact-spend action profiles

The core implements five independently named exact-spend constructors:

| Profile                           | Public constructor                     | Caller-owned funding                    |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| Mint collateral-in                | `prepareMintCollateralIn`              | Exact collateral amount                 |
| Mint paired-shares-out            | `prepareMintPairedSharesOut`           | Exact preview-derived collateral amount |
| Repurchase collateral-in-for-swap | `prepareRepurchaseCollateralInForSwap` | Exact collateral amount                 |
| Unwind collateral-out             | `prepareUnwindCollateralOut`           | Exact paired-share amounts              |
| Redeem principal-token-in         | `prepareRedeemPrincipalTokenIn`        | Exact principal token amount            |

Funding proofs are caller-owned token allowance, Permit2 allowance, or Permit2 signature artifacts. The core validates that each amount equals the profile-derived requirement; it does not sweep a wallet balance. Adapter residual balances and action-created allowances are expected to return to their defined terminal state.

Token profile/onboarding values are unresolved production blockers. Standing Permit2 onboarding is restricted to manifest-verified Cork share tokens, and a prerequisite terminates the current attempt so the caller can authorize and re-inspect.

### Seven capped-input variants

The seven capability identifiers in [`CAPPED_INPUT_CAPABILITY_IDS`](../packages/operations/src/capabilities.ts) are specified and visible but intentionally unavailable. [`createCappedInputUnavailableActions`](../packages/operations/src/actions.ts) returns stable `CAPPED_INPUT_PROTOCOL_UNAVAILABLE` records.

An unavailable response contains no approval, signature request, transaction template, calldata, or executable bytes. These variants must not appear in callable hosted discovery and must not fall back to a generic action builder.

## Limit order lifecycle

Limit order protocol version 1 is one complete lifecycle:

1. Read the authenticated maker-wide Cork-known inventory across every page and principal. Reconstruct each remaining making amount from chain invalidators at one canonical block.
2. Calculate the checked classic allowance to the pinned 1inch spender. If inventory is incomplete, emit neither approval nor signing request.
3. Disclose that this is a shared persistent allowance. Orders or signatures outside Cork may consume it; owner revocation is the terminal control.
4. Reconstruct MakerTraits, deterministic nonce and salt, order identity, allowance, typed data, and venue body.
5. Let the caller sign. Re-present the result for externally owned account or Ethereum Improvement Proposal 1271 verification and exact venue serialization.
6. Submit through the durable service with an exact idempotency key and request digest. A durable `started` transition precedes the network request.
7. Reconcile an ambiguous mutation before retry. Lease expiry alone does not authorize resend; only proved absence permits the one bounded retry.
8. Treat service acceptance as `accepted-not-filled`. It is not proof of open status, partial fill, fill, or settlement.
9. For taker fill, reconstruct the complete signed order, fillability, proportional amounts, classic allowance, and exact fill entrypoint. The caller broadcasts.
10. Prepare per-order or one-bit cancellation without inventing a hosted cancellation endpoint.
11. Revoke the manifest-derived maker token/spender allowance with `approve(spender,0)` when the owner chooses.
12. Reconcile against canonical events, invalidators, remaining amounts, expiry, balance, and allowance. The service payload is preserved, but chain state is authoritative for all eleven outcomes.

The relevant implementation is split across [`limit-orders.ts`](../packages/operations/src/limit-orders.ts), [`limit-order-inventory.ts`](../packages/operations-node/src/limit-order-inventory.ts), and [`submission.ts`](../packages/gateway/src/submission.ts).

Production remains blocked on complete maker-service assumptions and the approved production database decision.

## Market deployment handoff

Market deployment has two independent authorities:

1. One immutable merged Request for Comments 007 producer release defines exact schema digests for the underwriting handoff, resolved artifact, verdict, Build, staging evidence, unsigned Safe proposal, and attestation. The integration validates and preserves each producer artifact byte-for-byte.
2. The pinned market-registry read source supplies only asset and order-sensitive oracle observations. Raw `meta.reads`, raw `deployed`, symbols, decimals, feeds, wrapper, deployability, and reason remain untrusted source observations.

The pair order is always collateral asset then reference asset: `(ca, ref)`. Reversing it is a different lookup.

Before choosing an existing wrapper or freezing deployment bytes, two independently administered providers must agree at the same block number, block hash, and parent hash on `lookupWrapper(ca,ref)`, factory relationships, runtime identities, assets, denominations, conversion feeds, and every byte-affecting fact. Only the pure core owns the verdict.

The prepared result may contain two exact caller-owned transactions: registry deployment and pool creation. It does not hold keys, sign, submit or confirm a Safe transaction, broadcast, or claim deployment. A simulated `deploy(ca,ref)`, predicted address, raw `deployed:true`, receipt status alone, or source metadata is never deployment proof.

Production remains blocked on the immutable merged RFC 007 release and seven schema digests plus exact production deployment generations.
