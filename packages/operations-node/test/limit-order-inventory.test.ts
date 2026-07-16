import { describe, expect, it } from "vitest";

import {
  CompleteMakerInventoryAdapter,
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  type InventoryServiceOrder,
  type MakerWideInventoryPage,
} from "../src/index.js";

const address = (nibble: string) => `0x${nibble.repeat(40)}`;
const bytes32 = (nibble: string) => `0x${nibble.repeat(64)}`;
const digest = (nibble: string) => `sha256:${nibble.repeat(64)}`;

function item(
  hashNibble: string,
  principal: string,
  indexedRemaining: string,
): InventoryServiceOrder {
  return {
    orderHash: bytes32(hashNibble),
    submissionDigest: digest("1"),
    acceptedServiceIdentity: "cork-order-service",
    signedOrderPayloadDigest: digest("2"),
    makerTraits: (1n << 255n).toString(),
    nonceOrEpoch: "0",
    invalidatorRegime: "bit-invalidator",
    indexedStatus: "open",
    makingAmount: "100",
    indexedRemainingMakingAmount: indexedRemaining,
    expiry: "2000",
    acceptedPrincipal: principal,
    acceptedCredential: `credential-${principal}`,
    clientRequestId: `request-${principal}`,
  };
}

function adapter(
  readPage: (cursor: string | null) => Promise<MakerWideInventoryPage>,
) {
  return new CompleteMakerInventoryAdapter({
    serviceIdentity: "cork-order-service",
    administrationIdentity: "product-infrastructure",
    origin: "https://orders.example",
    sourceCommit: "ab".repeat(20),
    sourceSchemaDigest: digest("f"),
    sourceProfile: "maker-wide-v1",
    pageReader: {
      readPage: ({ cursor }) => readPage(cursor),
    },
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

const REQUEST = {
  requestingPrincipal: "requesting-principal",
  maker: address("1"),
  makerToken: address("2"),
  spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
  maxPages: 3,
  maxItems: 10,
} as const;

describe("complete maker-wide inventory adapter", () => {
  it("exhausts cross-principal pages, deduplicates, and uses chain remaining amounts", async () => {
    const first = item("a", "principal-a", "99");
    const second = item("b", "principal-b", "88");
    const reader = adapter(async (cursor) =>
      cursor === null
        ? {
            scope: "maker-wide",
            items: [first],
            nextCursor: "page-2",
            sourcePayloadDigest: digest("3"),
          }
        : {
            scope: "maker-wide",
            items: [first, second],
            nextCursor: null,
            sourcePayloadDigest: digest("4"),
          },
    );
    const result = await reader.read(REQUEST);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.value).toMatchObject({
      requestingPrincipal: "requesting-principal",
      complete: true,
      pagesRead: "2",
      finalCursor: "",
    });
    expect(result.value.records.map((record) => record.orderHash)).toEqual([
      bytes32("a"),
      bytes32("b"),
    ]);
    expect(
      result.value.records.map((record) => record.remainingMakingAmount),
    ).toEqual(["70", "40"]);
    expect(
      result.value.records.map((record) => record.acceptedServiceIdentity),
    ).toEqual(["cork-order-service", "cork-order-service"]);
  });

  it("rejects cursor cycles without promoting partial inventory", async () => {
    const reader = adapter(async () => ({
      scope: "maker-wide",
      items: [item("a", "principal-a", "99")],
      nextCursor: "cycle",
      sourcePayloadDigest: digest("3"),
    }));
    const result = await reader.read(REQUEST);
    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") return;
    expect(result.failure.code).toBe("UPSTREAM_PROJECTION_FAILED");
    expect("partial" in result).toBe(false);
  });

  it("refuses filtered standard listings as completeness evidence", async () => {
    const reader = adapter(
      async () =>
        ({
          scope: "filtered-orderbook",
          items: [],
          nextCursor: null,
          sourcePayloadDigest: digest("3"),
        }) as unknown as MakerWideInventoryPage,
    );
    const result = await reader.read(REQUEST);
    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") return;
    expect(result.failure.message).toMatch(/filtered standard orderbook/u);
  });
});
