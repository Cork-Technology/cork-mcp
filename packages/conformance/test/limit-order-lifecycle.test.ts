import { describe, expect, it } from "vitest";

import {
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  createMakerOrderInventory,
  type LimitOrderMakerIntentV1,
  type Sha256Digest,
} from "@corkprotocol/operations";
import { DirectLimitOrderLifecycleV1 } from "@corkprotocol/operations/limit-order-lifecycle";
import {
  CompleteMakerInventoryAdapter,
  sha256Text,
  type InventoryServiceOrder,
  type MakerWideInventoryPage,
} from "@corkprotocol/operations-node";
import {
  InMemorySubmissionRepository,
  SubmissionService,
  computeSubmissionRequestDigest,
  type ExactUpstreamResultV1,
  type SignedOrderSubmissionRequestV1,
} from "@corkprotocol/gateway";
import {
  createFixtureGenerationRoots,
  fixtureEvidenceVerifier,
} from "./generation-roots-fixture.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (byte: string) => `0x${byte.repeat(40)}`;
const bytes32 = (byte: string) => `0x${byte.repeat(64)}`;

function serviceOrder(hash: string, principal: string): InventoryServiceOrder {
  return {
    orderHash: bytes32(hash),
    submissionDigest: digest("2"),
    acceptedServiceIdentity: "fixture-order-service",
    signedOrderPayloadDigest: digest("3"),
    makerTraits: (1n << 255n).toString(),
    nonceOrEpoch: "0",
    invalidatorRegime: "bit-invalidator",
    indexedStatus: "open",
    makingAmount: "100",
    indexedRemainingMakingAmount: "99",
    expiry: "2000000000",
    acceptedPrincipal: principal,
    acceptedCredential: `fixture-credential-${principal}`,
    clientRequestId: `fixture-request-${principal}`,
  };
}

function inventoryAdapter(
  readPage: (cursor: string | null) => Promise<MakerWideInventoryPage>,
) {
  return new CompleteMakerInventoryAdapter({
    serviceIdentity: "fixture-order-service",
    administrationIdentity: "fixture-service-admin",
    origin: "https://fixture.invalid",
    sourceCommit: "ab".repeat(20),
    sourceSchemaDigest: digest("f"),
    sourceProfile: "fixture-maker-wide-v1",
    pageReader: { readPage: ({ cursor }) => readPage(cursor) },
    chainReader: {
      observe: async ({ orderHash }) => ({
        canonicalBlockNumber: "100",
        canonicalBlockHash: bytes32("c"),
        parentBlockHash: bytes32("d"),
        observedAt: "1000",
        invalidated: false,
        rawInvalidatorValue: "0",
        expired: false,
        remainingMakingAmount: orderHash === bytes32("a") ? "70" : "40",
      }),
    },
    now: () => "1000",
  });
}

function upstream(body: string): ExactUpstreamResultV1 {
  return {
    schemaVersion: "cork.submission-upstream-result/v1",
    statusCode: "201",
    mediaType: "application/json",
    decodedPayloadBase64: Buffer.from(body).toString("base64"),
    decodedPayloadLength: String(Buffer.byteLength(body)),
    decodedPayloadDigest: sha256Text(body) as `sha256:${string}`,
  };
}

describe("public limit-order lifecycle", () => {
  it("requires complete maker-wide inventory and preserves classic authority boundaries", async () => {
    const first = serviceOrder("a", "fixture-principal-a");
    const second = serviceOrder("b", "fixture-principal-b");
    const complete = await inventoryAdapter(async (cursor) =>
      cursor === null
        ? {
            scope: "maker-wide",
            items: [first],
            nextCursor: "fixture-page-2",
            sourcePayloadDigest: digest("4"),
          }
        : {
            scope: "maker-wide",
            items: [first, second],
            nextCursor: null,
            sourcePayloadDigest: digest("5"),
          },
    ).read({
      requestingPrincipal: "fixture-requester",
      maker: address("3"),
      makerToken: address("1"),
      spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
      maxPages: 3,
      maxItems: 10,
    });
    expect(complete.kind).toBe("success");
    if (complete.kind !== "success") return;
    expect(complete.value.complete).toBe(true);
    expect(
      complete.value.records.map((record) => record.remainingMakingAmount),
    ).toEqual(["70", "40"]);

    const incomplete = await inventoryAdapter(async () => ({
      scope: "maker-wide",
      items: [first],
      nextCursor: "cycle",
      sourcePayloadDigest: digest("6"),
    })).read({
      requestingPrincipal: "fixture-requester",
      maker: address("3"),
      makerToken: address("1"),
      spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
      maxPages: 2,
      maxItems: 10,
    });
    expect(incomplete.kind).toBe("failure");
    expect("partial" in incomplete).toBe(false);

    const intent: LimitOrderMakerIntentV1 = {
      schemaVersion: "cork.limit-order-maker-intent/v1",
      clientRequestId: "fixture-maker-order",
      chainId: "31337",
      deploymentId: "fixture-deployment",
      verifiedMarket: {
        schemaVersion: "cork.limit-order-market/v1",
        verifiedMarketDigest: digest("7"),
        chainId: "31337",
        deploymentId: "fixture-deployment",
        poolId: bytes32("e"),
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
      premiumMetadata: { fixture: true },
    };
    const inventory = createMakerOrderInventory({
      requestingPrincipal: "fixture-requester",
      sourceProfile: "fixture-maker-wide-v1",
      maker: address("3"),
      makerToken: address("1"),
      spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
      observedAt: "1000",
      complete: true,
      pagesRead: "2",
      finalCursor: "",
      records: [],
      warnings: [
        "fixture assumes a complete maker-wide production service is not yet selected",
      ],
    });
    const deploymentEvidence = {
      evidenceRoots: createFixtureGenerationRoots({
        deploymentId: "fixture-deployment",
        chainId: "31337",
        poolId: bytes32("e"),
        collateralAsset: address("1"),
        referenceAsset: address("2"),
        cptAddress: address("8"),
        cstAddress: address("9"),
        limitOrderProtocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
      }),
      poolId: bytes32("e"),
    } as const;
    const lifecycle = new DirectLimitOrderLifecycleV1({
      deploymentEvidence,
      evidenceVerifier: fixtureEvidenceVerifier,
      agreementVerifier: { verify: () => true },
      signatureVerifier: { verify: () => true },
      submission: {
        submit: async () => ({
          status: "ambiguous" as const,
          code: "SUBMISSION_OUTCOME_UNKNOWN" as const,
          retryable: false as const,
          attemptCount: 1,
        }),
        reconcile: async () => ({
          status: "ambiguous" as const,
          code: "SUBMISSION_OUTCOME_UNKNOWN" as const,
          retryable: false as const,
          attemptCount: 1,
        }),
      },
    });
    const prerequisite = lifecycle.makerPrepare({
      intent,
      inventory,
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
    });
    expect(prerequisite).toMatchObject({
      outcome: "prerequisite",
      disclosure: {
        presentedBeforeAuthorization: true,
        outsideCorkSignatureRisk: true,
      },
    });
    const maker = lifecycle.makerPrepare({
      intent,
      inventory,
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
    expect(maker.outcome).toBe("prepared");
    if (maker.outcome !== "prepared") return;
    const signed = lifecycle.makerFinalize({
      prepared: maker,
      signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    });
    expect(signed.venueBody).toMatchObject({
      extension: "",
      makerPermit2: "0x",
      orderHash: maker.identity.orderHash,
    });

    const taker = lifecycle.takerPrepare({
      schemaVersion: "cork.limit-order-taker-intent/v1",
      signedOrder: signed,
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
      constructionIsFill: false,
    });
    const cancellation = lifecycle.cancellationPrepare({
      signedOrder: signed,
      mode: "order-cancel",
      currentInvalidatorRaw: "0",
    });
    expect(cancellation.transaction.to).toBe(LIMIT_ORDER_PROTOCOL_ADDRESS);
    const revocation = lifecycle.allowanceRevocationPrepare({
      market: intent.verifiedMarket,
      role: "maker",
      owner: {
        kind: "externally-owned-account",
        address: address("3"),
      },
    });
    expect(revocation.transaction.functionName).toBe("approve");
  });

  it("keeps accepted submission distinct from fill and ambiguity reconciliation-owned", async () => {
    const withoutDigest = {
      schemaVersion: "cork.limit-order-submission/v1" as const,
      principalId: "fixture-principal",
      upstreamProfileId: "fixture-order-service",
      clientRequestId: "fixture-submission",
      chainId: "31337",
      signedOrder: {
        orderHash: bytes32("a"),
        makingAmount: "100",
        signature: "0x1234",
      },
    };
    const request: SignedOrderSubmissionRequestV1 = {
      ...withoutDigest,
      submissionRequestDigest: computeSubmissionRequestDigest(withoutDigest),
    };
    let uncertain = false;
    const submission = SubmissionService.createLocalTestSubstitute({
      repository: new InMemorySubmissionRepository(),
      adapter: {
        submit: async () =>
          uncertain
            ? { kind: "uncertain", evidenceIdentity: { fixture: "timeout" } }
            : {
                kind: "accepted",
                upstreamResult: upstream('{"fixtureAccepted":true}'),
                upstreamOrderIdentifier: "fixture-order",
              },
        reconcile: async () => ({
          kind: "absence-unproved",
          evidenceIdentity: { fixture: "incomplete-search" },
        }),
      },
      clock: { nowMs: () => 100 },
      ownerId: "fixture-owner",
      dispatchLeaseDurationMs: 50,
      reconcileLeaseDurationMs: 50,
    });
    const accepted = await submission.submit(request);
    expect(accepted).toMatchObject({
      status: "accepted",
      acceptanceStatus: "accepted-not-filled",
    });

    uncertain = true;
    const ambiguousRequest = {
      ...request,
      clientRequestId: "fixture-ambiguous",
    };
    const ambiguous: SignedOrderSubmissionRequestV1 = {
      ...ambiguousRequest,
      submissionRequestDigest: computeSubmissionRequestDigest({
        schemaVersion: ambiguousRequest.schemaVersion,
        principalId: ambiguousRequest.principalId,
        upstreamProfileId: ambiguousRequest.upstreamProfileId,
        clientRequestId: ambiguousRequest.clientRequestId,
        chainId: ambiguousRequest.chainId,
        signedOrder: ambiguousRequest.signedOrder,
      }),
    };
    expect(await submission.submit(ambiguous)).toMatchObject({
      status: "ambiguous",
    });
    expect(await submission.reconcile(ambiguous)).toMatchObject({
      status: "ambiguous",
    });
  });
});
