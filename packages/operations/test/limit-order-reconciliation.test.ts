import { describe, expect, it } from "vitest";

import {
  LIMIT_ORDER_RECONCILIATION_STATES,
  type FinalizedSignedOrderV1,
  type LimitOrderChainReconciliationV1,
  type LimitOrderServiceClaimV1,
  type Sha256Digest,
} from "../src/index.js";
import { reconcileLimitOrder } from "../src/limit-orders.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const bytes32 = (nibble: string) => `0x${nibble.repeat(64)}`;
const ORDER_HASH = bytes32("a");

const SIGNED = {
  identity: {
    orderHash: ORDER_HASH,
    order: { makingAmount: "100" },
  },
} as unknown as FinalizedSignedOrderV1;

function service(
  status: LimitOrderServiceClaimV1["status"],
): LimitOrderServiceClaimV1 {
  return { claim: "source-payload", bodyDigest: digest("1"), status };
}

function chain(
  overrides: Partial<LimitOrderChainReconciliationV1> = {},
): LimitOrderChainReconciliationV1 {
  return {
    canonicalBlockNumber: "100",
    canonicalBlockHash: bytes32("b"),
    parentBlockHash: bytes32("c"),
    finalized: true,
    reorged: false,
    event: { kind: "none", orderHash: ORDER_HASH, canonical: true },
    invalidated: false,
    remainingMakingAmount: "100",
    expiry: "2000",
    currentTime: "1000",
    makerBalance: "100",
    makerAllowance: "100",
    ...overrides,
  };
}

describe("chain-authoritative eleven-state limit-order reconciliation", () => {
  it("produces all eleven closed states", () => {
    const cases: readonly [
      expected: (typeof LIMIT_ORDER_RECONCILIATION_STATES)[number],
      submitted: boolean,
      source: LimitOrderServiceClaimV1,
      chain: LimitOrderChainReconciliationV1,
    ][] = [
      ["not-submitted", false, service("none"), chain()],
      [
        "accepted",
        true,
        service("accepted"),
        chain({ canonicalBlockNumber: "0" }),
      ],
      ["open", true, service("open"), chain()],
      [
        "partially-filled",
        true,
        service("partially-filled"),
        chain({
          remainingMakingAmount: "50",
          event: {
            kind: "OrderFilled",
            orderHash: ORDER_HASH,
            canonical: true,
          },
        }),
      ],
      [
        "filled",
        true,
        service("filled"),
        chain({
          remainingMakingAmount: "0",
          event: {
            kind: "OrderFilled",
            orderHash: ORDER_HASH,
            canonical: true,
          },
        }),
      ],
      [
        "cancelled",
        true,
        service("cancelled"),
        chain({
          invalidated: true,
          event: {
            kind: "OrderCancelled",
            orderHash: ORDER_HASH,
            canonical: true,
          },
        }),
      ],
      ["expired", true, service("expired"), chain({ currentTime: "2000" })],
      ["rejected", true, service("rejected"), chain()],
      ["unfillable", true, service("open"), chain({ makerBalance: "50" })],
      ["unknown", true, service("unknown"), chain()],
      ["conflict", true, service("filled"), chain()],
    ];
    expect(cases.map(([state]) => state)).toEqual(
      LIMIT_ORDER_RECONCILIATION_STATES,
    );
    for (const [expected, submitted, source, chainEvidence] of cases) {
      const result = reconcileLimitOrder({
        signedOrder: SIGNED,
        submitted,
        service: source,
        chain: chainEvidence,
      });
      expect(result.status, expected).toBe(expected);
      expect(result.provenance).toEqual({
        chainAuthoritative: true,
        servicePayloadPreserved: true,
      });
    }
  });

  it("rejects hostile events and turns reorg disagreement into conflict", () => {
    const hostile = reconcileLimitOrder({
      signedOrder: SIGNED,
      submitted: true,
      service: service("open"),
      chain: chain({
        event: {
          kind: "OrderCancelled",
          orderHash: bytes32("d"),
          canonical: true,
        },
      }),
    });
    expect(hostile.status).toBe("conflict");

    const reorg = reconcileLimitOrder({
      signedOrder: SIGNED,
      submitted: true,
      service: service("filled"),
      chain: chain({ reorged: true, finalized: false }),
    });
    expect(reorg.status).toBe("conflict");
  });

  it("uses canonical fill events ahead of the invalidator bit", () => {
    const filled = reconcileLimitOrder({
      signedOrder: SIGNED,
      submitted: true,
      service: service("accepted"),
      chain: chain({
        invalidated: true,
        remainingMakingAmount: "0",
        event: {
          kind: "OrderFilled",
          orderHash: ORDER_HASH,
          canonical: true,
        },
      }),
    });
    expect(filled.status).toBe("filled");

    const unsupportedCancellation = reconcileLimitOrder({
      signedOrder: SIGNED,
      submitted: true,
      service: service("open"),
      chain: chain({
        invalidated: false,
        event: {
          kind: "OrderCancelled",
          orderHash: ORDER_HASH,
          canonical: true,
        },
      }),
    });
    expect(unsupportedCancellation.status).toBe("conflict");
  });
});
