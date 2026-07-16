import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PhoenixClient,
  UpstreamRedirectResponseUnavailableError,
} from "../src/index.js";

const ADDRESS_A = `0x${"11".repeat(20)}`;
const ADDRESS_B = `0x${"22".repeat(20)}`;
const ADDRESS_C = `0x${"33".repeat(20)}`;
const ADDRESS_D = `0x${"44".repeat(20)}`;
const ADDRESS_E = `0x${"55".repeat(20)}`;
const ADDRESS_F = `0x${"66".repeat(20)}`;
const ADDRESS_G = `0x${"77".repeat(20)}`;
const ADDRESS_H = `0x${"88".repeat(20)}`;
const POOL_ID = `0x${"ab".repeat(32)}`;
const ORDER_HASH = `0x${"cd".repeat(32)}`;
const BOUNDS = { maxPages: 2, maxItems: 20 } as const;

function page(
  items: readonly unknown[] = [],
  nextCursor: string | null = null,
  hasMore = false,
): Response {
  return new Response(JSON.stringify({ items, nextCursor, hasMore }), {
    status: 200,
    headers: { "content-type": " application/json; charset=utf-8 " },
  });
}

function clientWith(
  fetch: (
    input: string,
    init: { readonly method: "GET"; readonly redirect: "manual" },
  ) => Promise<Response>,
): PhoenixClient {
  return new PhoenixClient({
    transport: {
      origin: "https://phoenix.example",
      administrationIdentity: "phoenix-operator-a",
      sourceCommit: "ab".repeat(20),
      fetch,
    },
    now: () => "1000",
  });
}

describe("PhoenixClient", () => {
  it("exposes only the six fixed GET operations", () => {
    expect(
      Object.getOwnPropertyNames(PhoenixClient.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "listFlows",
        "listLimitOrderFills",
        "listLimitOrderMarkets",
        "listLimitOrderOrderbook",
        "listPoolWhitelistedAddresses",
        "listPools",
      ].sort(),
    );
  });

  it("serializes every route's typed parameters and always uses manual GET", async () => {
    const calls: {
      input: string;
      init: { readonly method: "GET"; readonly redirect: "manual" };
    }[] = [];
    const client = clientWith(async (input, init) => {
      calls.push({ input, init });
      return page();
    });

    await client.listPools(
      {
        chainName: "mainnet",
        chainId: 1,
        poolManagerAddress: ADDRESS_A,
        collateralAddress: ADDRESS_B,
        referenceAddress: ADDRESS_C,
        principalAddress: ADDRESS_D,
        swapAddress: ADDRESS_E,
        rateOracleAddress: ADDRESS_F,
        poolId: POOL_ID,
        poolWhitelistStatus: "enabled",
        expiryBefore: "2027-01-01T00:00:00Z",
        expiryAfter: "2026-01-01T00:00:00Z",
        fromBlock: "1",
        toBlock: "2",
        fromTimestamp: "2026-01-01T00:00:00Z",
        toTimestamp: "2026-02-01T00:00:00Z",
        limit: 7,
        nextCursor: "pool cursor",
      },
      BOUNDS,
    );
    await client.listPoolWhitelistedAddresses(
      {
        chainName: "sepolia",
        chainId: 11_155_111,
        poolManagerAddress: ADDRESS_A,
        whitelistManagerAddress: ADDRESS_B,
        poolId: POOL_ID,
        walletAddress: ADDRESS_C,
        collateralAddress: ADDRESS_D,
        referenceAddress: ADDRESS_E,
        poolWhitelistStatus: "disabled",
        expiryBefore: "before",
        expiryAfter: "after",
        fromBlock: "3",
        toBlock: "4",
        fromTimestamp: "from",
        toTimestamp: "to",
        limit: 8,
        nextCursor: "whitelist cursor",
      },
      BOUNDS,
    );
    await client.listFlows(
      {
        chainName: "virtual",
        chainId: 9,
        walletAddress: ADDRESS_A,
        poolId: POOL_ID,
        fromBlock: "5",
        toBlock: "6",
        fromTimestamp: "flow-from",
        toTimestamp: "flow-to",
        actionType: "repurchase",
        limit: 9,
        nextCursor: "flow cursor",
      },
      BOUNDS,
    );
    await client.listLimitOrderMarkets(
      {
        chainId: 1,
        poolId: POOL_ID,
        makerAsset: ADDRESS_A,
        takerAsset: ADDRESS_B,
        onlyActive: true,
        limit: 10,
        offset: 11,
        nextCursor: "market cursor",
      },
      BOUNDS,
    );
    await client.listLimitOrderOrderbook(
      {
        chainId: 1,
        poolId: POOL_ID,
        maker: ADDRESS_A,
        makerAsset: ADDRESS_B,
        takerAsset: ADDRESS_C,
        side: "SELL",
        status: ["OPEN", "PARTIALLY_FILLED"],
        limit: 12,
        offset: 13,
        nextCursor: "order cursor",
      },
      BOUNDS,
    );
    await client.listLimitOrderFills(
      {
        chainId: 1,
        poolId: POOL_ID,
        orderHash: ORDER_HASH,
        maker: ADDRESS_A,
        taker: ADDRESS_B,
        fromBlock: "7",
        toBlock: "8",
        fromTimestamp: "fills-from",
        toTimestamp: "fills-to",
        limit: 14,
        offset: 15,
        nextCursor: "fill cursor",
      },
      BOUNDS,
    );

    expect(calls).toHaveLength(6);
    expect(
      calls.every(
        ({ init }) => init.method === "GET" && init.redirect === "manual",
      ),
    ).toBe(true);
    expect(calls[0]?.input).toContain("/v1/pools/?chainName=mainnet&chainId=1");
    expect(calls[0]?.input).toContain("nextCursor=pool+cursor");
    expect(calls[1]?.input).toContain("/v1/pools/whitelisted-addresses?");
    expect(calls[1]?.input).toContain(`whitelistManagerAddress=${ADDRESS_B}`);
    expect(calls[2]?.input).toContain("/v1/flows/?chainName=virtual");
    expect(calls[2]?.input).toContain("actionType=repurchase");
    expect(calls[3]?.input).toContain("/v1/limit-orders/markets?");
    expect(calls[3]?.input).toContain("onlyActive=true");
    expect(calls[4]?.input).toContain("status=OPEN&status=PARTIALLY_FILLED");
    expect(calls[5]?.input).toContain(
      `/v1/limit-orders/fills?chainId=1&poolId=${POOL_ID}`,
    );
    expect(calls[5]?.input).toContain(`orderHash=${ORDER_HASH}`);
  });

  it("enforces the flows wallet-or-pool requirement before transport", async () => {
    let called = false;
    const result = await clientWith(async () => {
      called = true;
      return page();
    }).listFlows({ actionType: "mint" }, BOUNDS);
    expect(called).toBe(false);
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.failure.code).toBe("INVALID_REQUEST");
    }
  });

  it("preserves exact decoded bytes before malformed projection parsing", async () => {
    const bytes = new TextEncoder().encode(
      '{"items":[1,],"nextCursor":null,"hasMore":false}',
    );
    const result = await clientWith(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { "content-type": " application/json " },
        }),
    ).listPools({}, BOUNDS);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const payload = result.value.pages[0];
      expect(payload?.bodyBase64).toBe(Buffer.from(bytes).toString("base64"));
      expect(payload?.bodyLength).toBe(String(bytes.byteLength));
      expect(payload?.bodyDigest).toBe(
        `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      );
      expect(payload?.mediaType).toBe("application/json");
      expect(payload?.projection.ok).toBe(false);
      expect(result.value.pagination.stopReason).toBe("projection-failure");
    }
  });

  it("preserves an accessible 3xx response without following it", async () => {
    const body = new TextEncoder().encode('{"redirect":"elsewhere"}');
    let redirectMode: string | undefined;
    const result = await clientWith(async (_input, init) => {
      redirectMode = init.redirect;
      return new Response(body, {
        status: 302,
        headers: { "content-type": "application/json" },
      });
    }).listPools({}, BOUNDS);

    expect(redirectMode).toBe("manual");
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.pages[0]?.statusCode).toBe(302);
      expect(result.value.pages[0]?.bodyBase64).toBe(
        Buffer.from(body).toString("base64"),
      );
      expect(result.value.pagination.complete).toBe(false);
      expect(result.value.pagination.stopReason).toBe("source-response");
    }
  });

  it("returns decoding and unavailable-redirect failures without a source payload claim", async () => {
    const decoding = await clientWith(
      async () =>
        ({
          redirected: false,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => {
            throw new Error("decode failed");
          },
        }) as Response,
    ).listPools({}, BOUNDS);
    expect(decoding.kind).toBe("failure");
    if (decoding.kind === "failure") {
      expect(decoding.failure.code).toBe("UPSTREAM_CONTENT_DECODING_FAILED");
      expect("claim" in decoding).toBe(false);
      expect("partial" in decoding).toBe(false);
    }

    const redirect = await clientWith(async () => {
      throw new UpstreamRedirectResponseUnavailableError();
    }).listPools({}, BOUNDS);
    expect(redirect.kind).toBe("failure");
    if (redirect.kind === "failure") {
      expect(redirect.failure.code).toBe(
        "UPSTREAM_REDIRECT_RESPONSE_UNAVAILABLE",
      );
      expect("claim" in redirect).toBe(false);
      expect("partial" in redirect).toBe(false);
    }
  });

  it("deduplicates in first-seen order and reports bounded pagination as partial", async () => {
    const responses = [
      page([{ id: "a" }, { id: "b" }], "next-1", true),
      page([{ id: "b" }, { id: "c" }], "next-2", true),
    ];
    const client = clientWith(async () => responses.shift() ?? page());
    const result = await client.listPools({}, { maxPages: 2, maxItems: 10 });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.items).toEqual([
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ]);
      expect(result.value.pagination).toMatchObject({
        complete: false,
        pagesRead: 2,
        itemsRead: 3,
        finalCursor: "next-2",
        stopReason: "page-bound",
      });
    }

    const itemBound = await clientWith(async () =>
      page([{ id: "a" }, { id: "b" }, { id: "c" }], "next", true),
    ).listPools({}, { maxPages: 5, maxItems: 2 });
    expect(itemBound.kind).toBe("success");
    if (itemBound.kind === "success") {
      expect(itemBound.value.items).toEqual([{ id: "a" }, { id: "b" }]);
      expect(itemBound.value.pagination.stopReason).toBe("item-bound");
      expect(itemBound.value.pagination.complete).toBe(false);
    }
  });

  it("accepts every exact five-value flow action", async () => {
    const actions = [
      "exercise",
      "repurchase",
      "redeem",
      "mint",
      "unwind",
    ] as const;
    const seen: string[] = [];
    const client = clientWith(async (input) => {
      seen.push(new URL(input).searchParams.get("actionType") ?? "");
      return page();
    });
    for (const actionType of actions) {
      await client.listFlows({ walletAddress: ADDRESS_H, actionType }, BOUNDS);
    }
    expect(seen).toEqual(actions);
    expect([
      ADDRESS_C,
      ADDRESS_D,
      ADDRESS_E,
      ADDRESS_F,
      ADDRESS_G,
    ]).toHaveLength(5);
  });
});
