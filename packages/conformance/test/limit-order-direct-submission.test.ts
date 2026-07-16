import { describe, expect, it } from "vitest";

import {
  DirectLimitOrderLifecycleV1,
  type LimitOrderSubmissionRequestV1,
} from "@corkprotocol/operations/limit-order-lifecycle";
import {
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  createMakerOrderInventory,
  type LimitOrderMakerIntentV1,
  type Sha256Digest,
} from "@corkprotocol/operations";
import { sha256Text } from "@corkprotocol/operations-node";
import {
  InMemorySubmissionRepository,
  SubmissionService,
  computeSubmissionRequestDigest,
  type SignedOrderSubmissionRequestV1,
} from "@corkprotocol/gateway";
import {
  createFixtureGenerationRoots,
  fixtureEvidenceVerifier,
} from "./generation-roots-fixture.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (nibble: string) => `0x${nibble.repeat(40)}`;
const bytes32 = (nibble: string) => `0x${nibble.repeat(64)}`;

function gatewayRequest(
  request: LimitOrderSubmissionRequestV1,
): SignedOrderSubmissionRequestV1 {
  return request as unknown as SignedOrderSubmissionRequestV1;
}

describe("direct limit-order durable submission composition", () => {
  it("uses the gateway digest contract and replays accepted-not-filled without redispatch", async () => {
    let dispatches = 0;
    const service = SubmissionService.createLocalTestSubstitute({
      repository: new InMemorySubmissionRepository(),
      adapter: {
        submit: async () => {
          dispatches += 1;
          const body = '{"accepted":true}';
          return {
            kind: "accepted",
            upstreamResult: {
              schemaVersion: "cork.submission-upstream-result/v1",
              statusCode: "201",
              mediaType: "application/json",
              decodedPayloadBase64: Buffer.from(body).toString("base64"),
              decodedPayloadLength: String(Buffer.byteLength(body)),
              decodedPayloadDigest: sha256Text(body) as Sha256Digest,
            },
            upstreamOrderIdentifier: "venue-order",
          };
        },
        reconcile: async () => ({
          kind: "absence-unproved",
          evidenceIdentity: { source: "fixture" },
        }),
      },
      clock: { nowMs: () => 100 },
      ownerId: "direct-composition",
      dispatchLeaseDurationMs: 50,
      reconcileLeaseDurationMs: 50,
    });
    const deploymentEvidence = {
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
    };
    const lifecycle = new DirectLimitOrderLifecycleV1({
      deploymentEvidence,
      evidenceVerifier: fixtureEvidenceVerifier,
      agreementVerifier: { verify: () => true },
      signatureVerifier: { verify: () => true },
      submission: {
        submit: async (request) => service.submit(gatewayRequest(request)),
        reconcile: async (request) =>
          service.reconcile(gatewayRequest(request)),
      },
    });
    const intent: LimitOrderMakerIntentV1 = {
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
      premiumMetadata: {},
    };
    const prepared = lifecycle.makerPrepare({
      intent,
      inventory: createMakerOrderInventory({
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
    });
    expect(prepared.outcome).toBe("prepared");
    if (prepared.outcome !== "prepared") return;
    const finalizedOrder = lifecycle.makerFinalize({
      prepared,
      signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    });
    const input = {
      principalId: "principal",
      upstreamProfileId: "phoenix-limit-orders-v1",
      clientRequestId: "direct-submit",
      finalizedOrder,
    };
    const request = lifecycle.createSubmissionRequest(input);
    expect(request.submissionRequestDigest).toBe(
      computeSubmissionRequestDigest({
        schemaVersion: request.schemaVersion,
        principalId: request.principalId,
        upstreamProfileId: request.upstreamProfileId,
        clientRequestId: request.clientRequestId,
        chainId: request.chainId,
        signedOrder: request.signedOrder as unknown as Readonly<
          Record<string, unknown>
        >,
      }),
    );

    const first = await lifecycle.submit(input);
    const replay = await lifecycle.submit(input);
    expect(first).toMatchObject({
      status: "accepted",
      acceptanceStatus: "accepted-not-filled",
      replayed: false,
    });
    expect(replay).toMatchObject({
      status: "accepted",
      acceptanceStatus: "accepted-not-filled",
      replayed: true,
    });
    expect(dispatches).toBe(1);
  });
});
