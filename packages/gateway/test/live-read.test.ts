import { describe, expect, it } from "vitest";

import { createLocalLiveReadGateway } from "../src/live-read.js";

const POOL_ID = `0x${"ab".repeat(32)}`;
const PAGE = {
  items: [
    {
      poolId: POOL_ID,
      poolName: "fixture-pool",
      chainId: 1,
      expiry: "2026-01-01T00:00:00.000Z",
    },
  ],
  nextCursor: null,
  hasMore: false,
};

describe("local live-read gateway", () => {
  it("exposes only capability and Phoenix read tools", () => {
    const gateway = createLocalLiveReadGateway({
      fetch: async () => new Response(JSON.stringify(PAGE)),
      now: () => "1",
    });
    const names = gateway.router
      .listTools(gateway.principal)
      .map((tool) => tool.name);

    expect(names).toHaveLength(7);
    expect(names).toEqual(
      expect.arrayContaining([
        "cork.capabilities.v1",
        "cork.phoenix.pools.list.v1",
        "cork.phoenix.poolWhitelists.list.v1",
        "cork.phoenix.flows.list.v1",
        "cork.phoenix.limitOrders.markets.list.v1",
        "cork.phoenix.limitOrders.orderbook.list.v1",
        "cork.phoenix.limitOrders.fills.list.v1",
      ]),
    );
    expect(names.some((name) => name.includes("prepare"))).toBe(false);
    expect(names.some((name) => name.includes("submit"))).toBe(false);
  });

  it("routes a bounded pool query through the byte-preserving adapter", async () => {
    const requests: {
      readonly url: string;
      readonly method: string;
      readonly redirect: string;
      readonly signal: AbortSignal;
    }[] = [];
    const gateway = createLocalLiveReadGateway({
      fetch: async (url, init) => {
        requests.push({
          url,
          method: init.method,
          redirect: init.redirect,
          signal: init.signal,
        });
        return new Response(JSON.stringify(PAGE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      now: () => "1700000000000",
    });
    const result = await gateway.router.call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {
        chainId: 1,
        limit: 2,
        maxPages: 1,
        maxItems: 2,
      },
      principal: gateway.principal,
    });

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "GET",
      redirect: "manual",
    });
    expect(requests[0]!.url).toContain(
      "https://api-phoenix.cork.tech/v1/pools/",
    );
    expect(requests[0]!.url).toContain("chainId=1");
    expect(requests[0]!.url).toContain("limit=2");
    if (!result.ok) return;
    expect(result.coreResult).toMatchObject({
      schemaVersion: "cork.raw-observation/v1",
      kind: "success",
      providerId: "phoenix-api",
      value: {
        operation: "pools",
        items: PAGE.items,
        pagination: {
          complete: true,
          pagesRead: 1,
          itemsRead: 1,
          stopReason: "complete",
        },
        pages: [
          {
            schemaVersion: "cork.upstream/v1",
            claim: "source-payload",
            statusCode: 200,
            projection: {
              ok: true,
              kind: "page",
              value: PAGE,
            },
          },
        ],
      },
    });
  });

  it("fails closed before any write handler can run", async () => {
    let fetched = false;
    const gateway = createLocalLiveReadGateway({
      fetch: async () => {
        fetched = true;
        return new Response(JSON.stringify(PAGE));
      },
      now: () => "1",
    });
    const result = await gateway.router.call({
      name: "cork.phoenix.unwind.paired-shares-in.prepare.v1",
      arguments: {},
      principal: gateway.principal,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTHENTICATION_SCOPE_DENIED",
        message: "credential lacks the required hosted scope",
      },
    });
    expect(fetched).toBe(false);
  });
});
