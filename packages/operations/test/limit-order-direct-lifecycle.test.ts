import { describe, expect, it } from "vitest";

import {
  DirectLimitOrderLifecycleV1,
  type LimitOrderSubmissionLifecycleResultV1,
  type LimitOrderSubmissionRequestV1,
} from "../src/limit-order-lifecycle.js";
import {
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  createMakerOrderInventory,
  type LimitOrderDeploymentV1,
  type LimitOrderMakerIntentV1,
  type Sha256Digest,
} from "../src/index.js";
import {
  finalizeLimitOrderMaker,
  prepareLimitOrderMaker,
} from "../src/limit-orders.js";
import {
  createFixtureGenerationRoots,
  fixtureEvidenceVerifier,
} from "./generation-roots-fixture.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (nibble: string) => `0x${nibble.repeat(40)}`;
const bytes32 = (nibble: string) => `0x${nibble.repeat(64)}`;

const DEPLOYMENT_EVIDENCE = {
  evidenceRoots: createFixtureGenerationRoots({
    deploymentId: "phoenix-mainnet",
    chainId: "1",
    poolId: bytes32("a"),
    collateralAsset: address("1"),
    referenceAsset: address("2"),
    cptAddress: address("8"),
    cstAddress: address("9"),
    limitOrderProtocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
  }),
  poolId: bytes32("a"),
} as const;

function intent(): LimitOrderMakerIntentV1 {
  return {
    schemaVersion: "cork.limit-order-maker-intent/v1",
    clientRequestId: "direct-maker",
    chainId: "1",
    deploymentId: "phoenix-mainnet",
    verifiedMarket: {
      schemaVersion: "cork.limit-order-market/v1",
      verifiedMarketDigest: digest("2"),
      chainId: "1",
      deploymentId: "phoenix-mainnet",
      poolId: bytes32("a"),
      makerAsset: address("1"),
      takerAsset: address("2"),
    },
    makerAccount: {
      kind: "externally-owned-account",
      address: address("3"),
    },
    receiver: address("3"),
    makerAsset: address("1"),
    takerAsset: address("2"),
    makingAmount: "100",
    takingAmount: "50",
    expiry: "2000000000",
    partialFillPreference: "single-fill",
    extensionProfile: "none",
    side: "SELL",
    premiumMetadata: { source: "direct-lifecycle" },
  };
}

function inventory() {
  return createMakerOrderInventory({
    requestingPrincipal: "principal",
    sourceProfile: "maker-wide-v1",
    maker: address("3"),
    makerToken: address("1"),
    spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
    observedAt: "1000",
    complete: true,
    pagesRead: "1",
    finalCursor: "",
    records: [],
    warnings: [],
  });
}

describe("evidence-bound direct limit-order lifecycle", () => {
  it("composes maker, durable submission, taker, cancellation, revocation, and reconciliation", async () => {
    const requests: LimitOrderSubmissionRequestV1[] = [];
    const accepted = {
      status: "accepted",
      acceptanceStatus: "accepted-not-filled",
      replayed: false,
      upstreamResult: { statusCode: "201" },
      upstreamOrderIdentifier: "venue-order-1",
    } as const satisfies LimitOrderSubmissionLifecycleResultV1;
    const lifecycle = new DirectLimitOrderLifecycleV1({
      deploymentEvidence: DEPLOYMENT_EVIDENCE,
      evidenceVerifier: fixtureEvidenceVerifier,
      agreementVerifier: { verify: () => true },
      signatureVerifier: { verify: () => true },
      submission: {
        submit: async (request) => {
          requests.push(request);
          return accepted;
        },
        reconcile: async (request) => {
          requests.push(request);
          return accepted;
        },
      },
    });

    const prepared = lifecycle.makerPrepare({
      intent: intent(),
      inventory: inventory(),
      identityState: {
        bitInvalidatorWord: "0",
        rawRemainingInvalidator: "0",
        acceptedOrderHashes: [],
        finalOrderHashes: [],
        conflictingOrderHashes: [],
      },
      currentAllowance: "100",
      zeroFirst: false,
      authorityMode: "classic-erc20",
    });
    expect(prepared.outcome).toBe("prepared");
    if (prepared.outcome !== "prepared") return;
    expect(prepared.deployment.manifestDigest).toBe(
      DEPLOYMENT_EVIDENCE.evidenceRoots.deployment.payload.manifest
        ?.manifestDigest,
    );

    const signedOrder = lifecycle.makerFinalize({
      prepared,
      signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    });
    const submitted = await lifecycle.submit({
      principalId: "principal",
      upstreamProfileId: "phoenix-limit-orders-v1",
      clientRequestId: "direct-submission",
      finalizedOrder: signedOrder,
    });
    expect(submitted).toEqual(accepted);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      schemaVersion: "cork.limit-order-submission/v1",
      chainId: "1",
      signedOrder,
    });

    const requestA = lifecycle.createSubmissionRequest({
      principalId: "principal-a",
      upstreamProfileId: "phoenix-limit-orders-v1",
      clientRequestId: "request-a",
      finalizedOrder: signedOrder,
    });
    const requestB = lifecycle.createSubmissionRequest({
      principalId: "principal-b",
      upstreamProfileId: "phoenix-limit-orders-v1",
      clientRequestId: "request-b",
      finalizedOrder: signedOrder,
    });
    expect(requestA.submissionRequestDigest).toBe(
      requestB.submissionRequestDigest,
    );

    const taker = lifecycle.takerPrepare({
      schemaVersion: "cork.limit-order-taker-intent/v1",
      signedOrder,
      fill: { kind: "full" },
      takerAccount: {
        kind: "externally-owned-account",
        address: address("5"),
      },
      receiver: address("5"),
      maximumTakingAmount: "50",
      deadline: "1900000000",
      currentTime: "1800000000",
      currentAllowance: "50",
      zeroFirst: false,
      makerBalance: "100",
      makerAllowance: "100",
      remainingMakingAmount: "100",
    });
    expect(taker).toMatchObject({
      outcome: "prepared",
      fillFunction: "fillOrder",
      constructionIsFill: false,
    });

    const cancellation = lifecycle.cancellationPrepare({
      signedOrder,
      mode: "order-cancel",
      currentInvalidatorRaw: "0",
    });
    expect(cancellation.transaction).toMatchObject({
      from: address("3"),
      to: LIMIT_ORDER_PROTOCOL_ADDRESS,
      functionName: "cancelOrder",
    });

    const revocation = lifecycle.allowanceRevocationPrepare({
      market: signedOrder.intent.verifiedMarket,
      role: "maker",
      owner: signedOrder.intent.makerAccount,
    });
    expect(revocation.transaction).toMatchObject({
      to: address("1"),
      functionName: "approve",
    });

    const reconciled = lifecycle.reconcile({
      signedOrder,
      submitted: true,
      service: {
        claim: "source-payload",
        bodyDigest: digest("3"),
        status: "accepted",
      },
      chain: {
        canonicalBlockNumber: "0",
        canonicalBlockHash: bytes32("b"),
        parentBlockHash: bytes32("c"),
        finalized: true,
        reorged: false,
        event: {
          kind: "none",
          orderHash: signedOrder.identity.orderHash,
          canonical: true,
        },
        invalidated: false,
        remainingMakingAmount: "100",
        expiry: "2000000000",
        currentTime: "1000",
        makerBalance: "100",
        makerAllowance: "100",
      },
    });
    expect(reconciled).toMatchObject({
      status: "accepted",
      provenance: {
        chainAuthoritative: true,
        servicePayloadPreserved: true,
      },
    });
  });

  it("rejects forged token approvals and forged-deployment fills before producing bytes", () => {
    const lifecycle = new DirectLimitOrderLifecycleV1({
      deploymentEvidence: DEPLOYMENT_EVIDENCE,
      evidenceVerifier: fixtureEvidenceVerifier,
      agreementVerifier: { verify: () => true },
      signatureVerifier: { verify: () => true },
      submission: {
        submit: async () => ({
          status: "ambiguous",
          code: "SUBMISSION_OUTCOME_UNKNOWN",
          retryable: false,
          attemptCount: 1,
        }),
        reconcile: async () => ({
          status: "ambiguous",
          code: "SUBMISSION_OUTCOME_UNKNOWN",
          retryable: false,
          attemptCount: 1,
        }),
      },
    });
    const forged = {
      ...intent(),
      verifiedMarket: {
        ...intent().verifiedMarket,
        makerAsset: address("7"),
      },
      makerAsset: address("7"),
    };
    expect(() =>
      lifecycle.makerPrepare({
        intent: forged,
        inventory: createMakerOrderInventory({
          requestingPrincipal: "principal",
          sourceProfile: "maker-wide-v1",
          maker: address("3"),
          makerToken: address("7"),
          spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
          observedAt: "1000",
          complete: true,
          pagesRead: "1",
          finalCursor: "",
          records: [],
          warnings: [],
        }),
        identityState: {
          bitInvalidatorWord: "0",
          rawRemainingInvalidator: "0",
          acceptedOrderHashes: [],
          finalOrderHashes: [],
          conflictingOrderHashes: [],
        },
        currentAllowance: "0",
        zeroFirst: false,
        authorityMode: "classic-erc20",
      }),
    ).toThrow(/manifest pool/u);
    expect(() =>
      lifecycle.allowanceRevocationPrepare({
        market: forged.verifiedMarket,
        role: "maker",
        owner: forged.makerAccount,
      }),
    ).toThrow(/manifest pool/u);

    const forgedDeployment: LimitOrderDeploymentV1 = {
      schemaVersion: "cork.limit-order-deployment/v1",
      deploymentId: "attacker-deployment",
      chainId: "1",
      status: "active",
      protocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
      protocolVersion: "4.3.2",
      protocolSourceCommit: LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
      sdkVersion: "4.3.0",
      sdkSourceCommit: "5e0c09c3d2df34923c07c3d3805afa657d8db28f",
      manifestDigest: digest("f"),
    };
    const forgedFillIntent: LimitOrderMakerIntentV1 = {
      ...intent(),
      deploymentId: forgedDeployment.deploymentId,
      verifiedMarket: {
        ...intent().verifiedMarket,
        deploymentId: forgedDeployment.deploymentId,
        makerAsset: address("7"),
        takerAsset: address("6"),
      },
      makerAsset: address("7"),
      takerAsset: address("6"),
    };
    const forgedPrepared = prepareLimitOrderMaker(
      {
        intent: forgedFillIntent,
        deployment: forgedDeployment,
        inventory: createMakerOrderInventory({
          requestingPrincipal: "attacker",
          sourceProfile: "attacker-inventory",
          maker: address("3"),
          makerToken: address("7"),
          spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
          observedAt: "1000",
          complete: true,
          pagesRead: "1",
          finalCursor: "",
          records: [],
          warnings: [],
        }),
        identityState: {
          bitInvalidatorWord: "0",
          rawRemainingInvalidator: "0",
          acceptedOrderHashes: [],
          finalOrderHashes: [],
          conflictingOrderHashes: [],
        },
        currentAllowance: "100",
        zeroFirst: false,
        authorityMode: "classic-erc20",
      },
      { verify: () => true },
    );
    expect(forgedPrepared.outcome).toBe("prepared");
    if (forgedPrepared.outcome !== "prepared") return;
    const forgedSignedOrder = finalizeLimitOrderMaker(
      {
        prepared: forgedPrepared,
        signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
      },
      { verify: () => true },
      { verify: () => true },
    );
    expect(() =>
      lifecycle.takerPrepare({
        schemaVersion: "cork.limit-order-taker-intent/v1",
        signedOrder: forgedSignedOrder,
        fill: { kind: "full" },
        takerAccount: {
          kind: "externally-owned-account",
          address: address("5"),
        },
        receiver: address("5"),
        maximumTakingAmount: "50",
        deadline: "1900000000",
        currentTime: "1800000000",
        currentAllowance: "50",
        zeroFirst: false,
        makerBalance: "100",
        makerAllowance: "100",
        remainingMakingAmount: "100",
      }),
    ).toThrow(/verified authority/u);
  });
});
