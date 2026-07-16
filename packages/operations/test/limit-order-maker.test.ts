import { describe, expect, it } from "vitest";

import {
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  createMakerOrderInventory,
  type LimitOrderDeploymentV1,
  type LimitOrderIdentityStateV1,
  type LimitOrderMakerIntentV1,
  type MakerOrderInventoryV1,
  type Sha256Digest,
} from "../src/index.js";
import {
  buildMakerTraitsV1,
  finalizeLimitOrderMaker,
  prepareLimitOrderMaker,
} from "../src/limit-orders.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (nibble: string) => `0x${nibble.repeat(40)}`;
const bytes32 = (nibble: string) => `0x${nibble.repeat(64)}`;

const DEPLOYMENT: LimitOrderDeploymentV1 = {
  schemaVersion: "cork.limit-order-deployment/v1",
  deploymentId: "phoenix-mainnet",
  chainId: "1",
  status: "active",
  protocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
  protocolVersion: "4.3.2",
  protocolSourceCommit: LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  sdkVersion: "4.3.0",
  sdkSourceCommit: "5e0c09c3d2df34923c07c3d3805afa657d8db28f",
  manifestDigest: digest("1"),
};

function intent(
  maker = address("3"),
  kind: "externally-owned-account" | "safe" = "externally-owned-account",
): LimitOrderMakerIntentV1 {
  return {
    schemaVersion: "cork.limit-order-maker-intent/v1",
    clientRequestId: `maker-${maker}`,
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
    makerAccount: { kind, address: maker },
    receiver: maker,
    makerAsset: address("1"),
    takerAsset: address("2"),
    makingAmount: "100",
    takingAmount: "50",
    expiry: "2000000000",
    partialFillPreference: "single-fill",
    extensionProfile: "none",
    side: "SELL",
    premiumMetadata: { source: "maker-test" },
  };
}

function inventory(
  maker: string,
  remaining = "30",
  complete = true,
): MakerOrderInventoryV1 {
  const traits = buildMakerTraitsV1({
    partialFillPreference: "partial-multiple-fill",
    nonceOrEpoch: "1",
    expiry: "1999999999",
  });
  return createMakerOrderInventory({
    requestingPrincipal: "principal-requesting-complete-view",
    sourceProfile: "cork-maker-wide-v1",
    maker,
    makerToken: address("1"),
    spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
    observedAt: "1000",
    complete,
    pagesRead: "2",
    finalCursor: "",
    records:
      remaining === "0"
        ? []
        : [
            {
              orderHash: bytes32("b"),
              submissionDigest: digest("3"),
              acceptedServiceIdentity: "cork-order-service",
              signedOrderPayloadDigest: digest("4"),
              makerTraits: traits.raw,
              nonceOrEpoch: traits.nonceOrEpoch,
              invalidatorRegime: traits.invalidatorRegime,
              indexedStatus: "open",
              makingAmount: "40",
              remainingMakingAmount: remaining,
              expiry: traits.expiration,
              invalidatorObservation: {
                regime: traits.invalidatorRegime,
                canonicalBlockNumber: "100",
                canonicalBlockHash: bytes32("c"),
                parentBlockHash: bytes32("d"),
                observedAt: "1000",
                invalidated: false,
                rawValue: remaining,
              },
            },
          ],
    warnings: [],
  });
}

const STATE: LimitOrderIdentityStateV1 = {
  bitInvalidatorWord: "0",
  rawRemainingInvalidator: "0",
  acceptedOrderHashes: [],
  finalOrderHashes: [],
  conflictingOrderHashes: [],
};

describe("complete inventory, shared allowance, and maker signing", () => {
  it("sums maker-wide remaining amounts and emits a zero-first classic approval", () => {
    const result = prepareLimitOrderMaker(
      {
        intent: intent(),
        deployment: DEPLOYMENT,
        inventory: inventory(address("3")),
        identityState: STATE,
        currentAllowance: "20",
        zeroFirst: true,
        authorityMode: "classic-erc20",
      },
      { verify: () => true },
    );
    expect(result).toMatchObject({
      outcome: "prerequisite",
      targetAllowance: "130",
      disclosure: {
        presentedBeforeAuthorization: true,
        code: "shared-limit-order-allowance",
        coverage: "cork-service-known-orders-only",
        persistence: "owner-revocation",
        outsideCorkSignatureRisk: true,
      },
    });
    if (result.outcome === "prerequisite") {
      expect(result.approvalTransactions).toHaveLength(2);
      expect(
        result.approvalTransactions[0]?.calldata.endsWith("0".repeat(64)),
      ).toBe(true);
      expect(
        result.approvalTransactions.every(
          (transaction) => transaction.to === address("1"),
        ),
      ).toBe(true);
    }
  });

  it("reconstructs maker preparation and validates EOA and EIP-1271 seams", () => {
    for (const [maker, kind, expectedAccountType] of [
      [address("3"), "externally-owned-account", "externally-owned-account"],
      [address("4"), "safe", "eip-1271"],
    ] as const) {
      const prepared = prepareLimitOrderMaker(
        {
          intent: intent(maker, kind),
          deployment: DEPLOYMENT,
          inventory: inventory(maker, "0"),
          identityState: STATE,
          currentAllowance: "100",
          zeroFirst: false,
          authorityMode: "classic-erc20",
        },
        { verify: () => true },
      );
      expect(prepared.outcome).toBe("prepared");
      if (prepared.outcome !== "prepared") continue;
      const seen: string[] = [];
      const finalized = finalizeLimitOrderMaker(
        { prepared, signature: "0x1234" },
        { verify: () => true },
        {
          verify: (input) => {
            seen.push(input.accountType);
            return true;
          },
        },
      );
      expect(seen).toEqual([expectedAccountType]);
      expect(finalized.venueBody).toMatchObject({
        extension: "",
        makerPermit2: "0x",
        makerAccountType: expectedAccountType,
        expiry: "2000000000",
        nonce: prepared.identity.nonceOrEpoch,
        orderHash: prepared.identity.orderHash,
      });
    }
  });

  it("fails closed on incomplete inventory, collision, and prepared tampering", () => {
    const incomplete = inventory(address("3"), "0", false);
    expect(
      prepareLimitOrderMaker(
        {
          intent: intent(),
          deployment: DEPLOYMENT,
          inventory: incomplete as MakerOrderInventoryV1,
          identityState: STATE,
          currentAllowance: "100",
          zeroFirst: false,
          authorityMode: "classic-erc20",
        },
        { verify: () => true },
      ),
    ).toMatchObject({
      outcome: "unavailable",
      code: "MAKER_ORDER_INVENTORY_INCOMPLETE",
    });

    const prepared = prepareLimitOrderMaker(
      {
        intent: intent(),
        deployment: DEPLOYMENT,
        inventory: inventory(address("3"), "0"),
        identityState: STATE,
        currentAllowance: "100",
        zeroFirst: false,
        authorityMode: "classic-erc20",
      },
      { verify: () => true },
    );
    expect(prepared.outcome).toBe("prepared");
    if (prepared.outcome !== "prepared") return;
    expect(
      prepareLimitOrderMaker(
        {
          intent: intent(),
          deployment: DEPLOYMENT,
          inventory: inventory(address("3"), "0"),
          identityState: {
            ...STATE,
            acceptedOrderHashes: [prepared.identity.orderHash],
          },
          currentAllowance: "100",
          zeroFirst: false,
          authorityMode: "classic-erc20",
        },
        { verify: () => true },
      ),
    ).toMatchObject({
      outcome: "unavailable",
      code: "LIMIT_ORDER_IDENTITY_ALREADY_USED",
    });

    expect(() =>
      finalizeLimitOrderMaker(
        {
          prepared: {
            ...prepared,
            identity: { ...prepared.identity, salt: "1" },
          },
          signature: "0x1234",
        },
        { verify: () => true },
        { verify: () => true },
      ),
    ).toThrow(/reconstruct/u);
  });
});
