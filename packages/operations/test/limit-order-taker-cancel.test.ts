import { describe, expect, it } from "vitest";

import {
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  LIMIT_ORDER_SDK_ABI_CANONICAL_SHA256,
  LIMIT_ORDER_SDK_ABI_RAW_SHA256,
  createMakerOrderInventory,
  type FinalizedSignedOrderV1,
  type LimitOrderDeploymentV1,
  type LimitOrderMakerIntentV1,
  type Sha256Digest,
} from "../src/index.js";
import {
  finalizeLimitOrderMaker,
  prepareLimitOrderAllowanceRevocation,
  prepareLimitOrderCancellation,
  prepareLimitOrderMaker,
  prepareLimitOrderTaker,
} from "../src/limit-orders.js";
import {
  createFixtureGenerationRoots,
  fixtureEvidenceVerifier,
} from "./generation-roots-fixture.js";

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

function signedOrder(
  kind: "externally-owned-account" | "safe" = "externally-owned-account",
  preference: "single-fill" | "partial-multiple-fill" = "single-fill",
): FinalizedSignedOrderV1 {
  const maker = kind === "safe" ? address("4") : address("3");
  const intent: LimitOrderMakerIntentV1 = {
    schemaVersion: "cork.limit-order-maker-intent/v1",
    clientRequestId: `${kind}-${preference}`,
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
    partialFillPreference: preference,
    extensionProfile: "none",
    side: "SELL",
    premiumMetadata: {},
  };
  const inventory = createMakerOrderInventory({
    requestingPrincipal: "principal",
    sourceProfile: "maker-wide",
    maker,
    makerToken: address("1"),
    spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
    observedAt: "1000",
    complete: true,
    pagesRead: "1",
    finalCursor: "",
    records: [],
    warnings: [],
  });
  const prepared = prepareLimitOrderMaker(
    {
      intent,
      deployment: DEPLOYMENT,
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
    },
    { verify: () => true },
  );
  if (prepared.outcome !== "prepared") throw new Error("fixture failed");
  return finalizeLimitOrderMaker(
    {
      prepared,
      signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    },
    { verify: () => true },
    { verify: () => true },
  );
}

describe("taker fill, cancellation, and classic allowance revocation", () => {
  it("rounds proportional fills upward and emits exact classic allowance", () => {
    const signed = signedOrder();
    const base = {
      schemaVersion: "cork.limit-order-taker-intent/v1" as const,
      signedOrder: signed,
      fill: { kind: "making-amount" as const, amount: "25" },
      takerAccount: {
        kind: "externally-owned-account" as const,
        address: address("5"),
      },
      receiver: address("5"),
      maximumTakingAmount: "13",
      deadline: "1900000000",
      currentTime: "1800000000",
      zeroFirst: false,
      makerBalance: "100",
      makerAllowance: "100",
      remainingMakingAmount: "100",
    };
    const prerequisite = prepareLimitOrderTaker(
      { ...base, currentAllowance: "0" },
      { verify: () => true },
      { verify: () => true },
    );
    expect(prerequisite).toMatchObject({
      outcome: "prerequisite",
      requiredMakingAmount: "25",
      requiredTakingAmount: "13",
    });
    if (prerequisite.outcome === "prerequisite") {
      expect(prerequisite.approvalTransactions[0]).toMatchObject({
        from: address("5"),
        to: address("2"),
        value: "0",
        functionName: "approve",
      });
    }

    const prepared = prepareLimitOrderTaker(
      { ...base, currentAllowance: "13" },
      { verify: () => true },
      { verify: () => true },
    );
    expect(prepared).toMatchObject({
      outcome: "prepared",
      fillFunction: "fillOrder",
      constructionIsFill: false,
      transaction: {
        to: LIMIT_ORDER_PROTOCOL_ADDRESS,
        value: "0",
      },
    });
    if (prepared.outcome === "prepared") {
      expect(LIMIT_ORDER_SDK_ABI_RAW_SHA256).toBe(
        "sha256:4129e89c971093caa4a87bcfadff5ba37f43d0a362358f40eb698ecd511ed195",
      );
      expect(LIMIT_ORDER_SDK_ABI_CANONICAL_SHA256).toBe(
        "sha256:b8a1043bb178aedc35f31475b19b4048d9569632a1b1e6e2a826ece83d0b6327",
      );
      expect(prepared.transaction.calldata).toBe(
        "0x9fda64bd8435bcfbfbbc76ccce174f9819a10dc545cb730068950225155f3add661fa9a4000000000000000000000000333333333333333333333333333333333333333300000000000000000000000033333333333333333333333333333333333333330000000000000000000000001111111111111111111111111111111111111111000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000032800000000000000000000000b97ee52e71007735940000000000000000000000111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222220000000000000000000000000000000000000000000000000000000000000019800000000000000000000000000000000000000000000000000000000000000d",
      );
    }
  });

  it("matches every selected args and contract-maker fill vector", () => {
    const eoaArgs = prepareLimitOrderTaker(
      {
        schemaVersion: "cork.limit-order-taker-intent/v1",
        signedOrder: signedOrder(),
        fill: { kind: "full" },
        takerAccount: {
          kind: "externally-owned-account",
          address: address("5"),
        },
        receiver: address("6"),
        maximumTakingAmount: "50",
        deadline: "1900000000",
        currentTime: "1800000000",
        currentAllowance: "50",
        zeroFirst: false,
        makerBalance: "100",
        makerAllowance: "100",
        remainingMakingAmount: "100",
      },
      { verify: () => true },
      { verify: () => true },
    );
    expect(eoaArgs).toMatchObject({
      outcome: "prepared",
      fillFunction: "fillOrderArgs",
    });
    if (eoaArgs.outcome === "prepared") {
      expect(eoaArgs.transaction.calldata).toBe(
        "0xf497df758435bcfbfbbc76ccce174f9819a10dc545cb730068950225155f3add661fa9a4000000000000000000000000333333333333333333333333333333333333333300000000000000000000000033333333333333333333333333333333333333330000000000000000000000001111111111111111111111111111111111111111000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000032800000000000000000000000b97ee52e71007735940000000000000000000000111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222220000000000000000000000000000000000000000000000000000000000000064880000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000000146666666666666666666666666666666666666666000000000000000000000000",
      );
    }

    const signed = signedOrder("safe");
    const base = {
      schemaVersion: "cork.limit-order-taker-intent/v1" as const,
      signedOrder: signed,
      fill: { kind: "full" as const },
      takerAccount: {
        kind: "externally-owned-account" as const,
        address: address("5"),
      },
      maximumTakingAmount: "50",
      deadline: "1900000000",
      currentTime: "1800000000",
      currentAllowance: "50",
      zeroFirst: false,
      makerBalance: "100",
      makerAllowance: "100",
      remainingMakingAmount: "100",
    };
    const contract = prepareLimitOrderTaker(
      { ...base, receiver: address("5") },
      { verify: () => true },
      { verify: () => true },
    );
    expect(contract).toMatchObject({
      outcome: "prepared",
      fillFunction: "fillContractOrder",
    });
    if (contract.outcome === "prepared") {
      expect(contract.transaction.calldata).toBe(
        "0xcc713a04f3c3fefde14186d8895732c28d182c1d4f284363f4e5fbd316220bb0f4848af1000000000000000000000000444444444444444444444444444444444444444400000000000000000000000044444444444444444444444444444444444444440000000000000000000000001111111111111111111111111111111111111111000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000032800000000000000000000000647fff3ee50077359400000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000006480000000000000000000000000000000000000000000000000000000000000320000000000000000000000000000000000000000000000000000000000000041111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b00000000000000000000000000000000000000000000000000000000000000",
      );
    }
    const contractArgs = prepareLimitOrderTaker(
      { ...base, receiver: address("6") },
      { verify: () => true },
      { verify: () => true },
    );
    expect(contractArgs).toMatchObject({
      outcome: "prepared",
      fillFunction: "fillContractOrderArgs",
    });
    if (contractArgs.outcome === "prepared") {
      expect(contractArgs.transaction.calldata).toBe(
        "0x56a75868f3c3fefde14186d8895732c28d182c1d4f284363f4e5fbd316220bb0f4848af1000000000000000000000000444444444444444444444444444444444444444400000000000000000000000044444444444444444444444444444444444444440000000000000000000000001111111111111111111111111111111111111111000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000032800000000000000000000000647fff3ee500773594000000000000000000000000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000064880000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000041111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000146666666666666666666666666666666666666666000000000000000000000000",
      );
    }
  });

  it("rejects unfillable state and out-of-range TakerTraits thresholds", () => {
    const signed = signedOrder("safe");
    const unavailable = prepareLimitOrderTaker(
      {
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
        makerBalance: "99",
        makerAllowance: "100",
        remainingMakingAmount: "100",
      },
      { verify: () => true },
      { verify: () => true },
    );
    expect(unavailable).toMatchObject({
      outcome: "unavailable",
      code: "ORDER_NOT_FILLABLE",
    });
    expect(() =>
      prepareLimitOrderTaker(
        {
          schemaVersion: "cork.limit-order-taker-intent/v1",
          signedOrder: signed,
          fill: { kind: "full" },
          takerAccount: {
            kind: "externally-owned-account",
            address: address("5"),
          },
          receiver: address("5"),
          maximumTakingAmount: (1n << 185n).toString(),
          deadline: "1900000000",
          currentTime: "1800000000",
          currentAllowance: (1n << 185n).toString(),
          zeroFirst: false,
          makerBalance: "100",
          makerAllowance: "100",
          remainingMakingAmount: "100",
        },
        { verify: () => true },
        { verify: () => true },
      ),
    ).toThrow(/TakerTraits threshold/u);
  });

  it("derives cancellation identity and keeps terminal revocation available", () => {
    const single = signedOrder();
    const cancellationVectors = {
      "order-cancel":
        "0xb68fb020800000000000000000000000b97ee52e71007735940000000000000000000000aa929584166e07175acb533edbbd45eb03b9fb800f802f2575da995119dcbef9",
      "bit-invalidate":
        "0x05b1ea03800000000000000000000000b97ee52e710077359400000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    } as const;
    for (const mode of ["order-cancel", "bit-invalidate"] as const) {
      const cancellation = prepareLimitOrderCancellation(
        {
          signedOrder: single,
          mode,
          currentInvalidatorRaw: "0",
        },
        { verify: () => true },
        { verify: () => true },
      );
      expect(cancellation).toMatchObject({
        mode,
        orderHash: single.identity.orderHash,
        nonceOrEpoch: single.identity.nonceOrEpoch,
        transaction: {
          from: address("3"),
          to: LIMIT_ORDER_PROTOCOL_ADDRESS,
          value: "0",
        },
      });
      expect(cancellation.transaction.calldata).toBe(cancellationVectors[mode]);
    }
    expect(() =>
      prepareLimitOrderCancellation(
        {
          signedOrder: single,
          mode: "bit-invalidate",
          currentInvalidatorRaw: single.identity.invalidator.mask!,
        },
        { verify: () => true },
        { verify: () => true },
      ),
    ).toThrow(/already bit-invalidated/u);
    expect(() =>
      prepareLimitOrderCancellation(
        {
          signedOrder: signedOrder(
            "externally-owned-account",
            "partial-multiple-fill",
          ),
          mode: "bit-invalidate",
          currentInvalidatorRaw: "0",
        },
        { verify: () => true },
        { verify: () => true },
      ),
    ).toThrow(/single-fill/u);

    const revocation = prepareLimitOrderAllowanceRevocation(
      {
        deploymentEvidence: {
          evidenceRoots: createFixtureGenerationRoots({
            deploymentId: "phoenix-mainnet",
            chainId: "1",
            poolId: bytes32("a"),
            collateralAsset: address("1"),
            referenceAsset: address("2"),
            cptAddress: address("8"),
            cstAddress: address("9"),
            limitOrderProtocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
            status: "retired",
          }),
          poolId: bytes32("a"),
        },
        market: single.intent.verifiedMarket,
        role: "maker",
        owner: {
          kind: "externally-owned-account",
          address: address("3"),
        },
      },
      fixtureEvidenceVerifier,
    );
    expect(revocation.transaction).toMatchObject({
      to: address("1"),
      functionName: "approve",
      value: "0",
    });
    expect(revocation.transaction.calldata.endsWith("0".repeat(64))).toBe(true);
  });
});
