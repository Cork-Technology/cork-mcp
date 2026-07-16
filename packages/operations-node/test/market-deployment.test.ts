import { describe, expect, it } from "vitest";

import {
  MARKET_REGISTRY_SOURCE_COMMIT,
  MarketDeploymentRawReader,
  MarketRegistryClient,
} from "../src/index.js";

const CA = `0x${"11".repeat(20)}`;
const REF = `0x${"22".repeat(20)}`;
const WRAPPER = `0x${"33".repeat(20)}`;

function client(calls: string[], body: string): MarketRegistryClient {
  return new MarketRegistryClient({
    transport: {
      origin: "https://registry.example",
      administrationIdentity: "registry-admin",
      sourceSchemaDigest: `sha256:${"1".repeat(64)}`,
      fetch: async (input, init) => {
        expect(init).toEqual({ method: "GET", redirect: "manual" });
        calls.push(input);
        return new Response(new TextEncoder().encode(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
    now: () => "1000",
  });
}

describe("MarketDeploymentRawReader", () => {
  it("exposes only three pinned reads and preserves order, bytes, metadata, and source claims", async () => {
    const calls: string[] = [];
    const raw =
      `{"chain_id":1,"ca":"${CA}","ref":"${REF}",` +
      `"wrapper":"${WRAPPER}","deployed":true,"deployable":false,` +
      `"reason":"entry-not-found","meta":{"reads":{"1":{"block_number":123}}}}`;
    const reader = new MarketDeploymentRawReader({
      client: client(calls, raw),
      sourceCommit: MARKET_REGISTRY_SOURCE_COMMIT,
    });

    await reader.read({ kind: "assets-list" });
    await reader.read({ kind: "asset", chainId: 1, address: CA });
    const oracle = await reader.read({
      kind: "oracle",
      chainId: 1,
      ca: CA,
      ref: REF,
    });

    expect(calls).toEqual([
      "https://registry.example/v1/assets",
      `https://registry.example/v1/assets/1/${CA}`,
      `https://registry.example/v1/oracles/1/${CA}/${REF}`,
    ]);
    expect(
      Object.getOwnPropertyNames(MarketDeploymentRawReader.prototype).filter(
        (name) => name !== "constructor",
      ),
    ).toEqual(["read"]);
    expect(oracle.kind).toBe("success");
    if (oracle.kind !== "success") return;
    expect(oracle.value.bodyBase64).toBe(
      Buffer.from(raw, "utf8").toString("base64"),
    );
    expect(oracle.value.projection).toMatchObject({
      ok: true,
      kind: "oracle",
      value: {
        deployedClaim: {
          classification: "untrusted-source-claim",
          value: true,
        },
        deployableClaim: {
          classification: "untrusted-source-claim",
          value: false,
        },
        reads: { classification: "untrusted-source-metadata" },
      },
    });
    const serialized = JSON.stringify(oracle);
    for (const forbidden of [
      '"verdict"',
      '"authoritative"',
      '"activated"',
      '"callable"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects a moving source identity", () => {
    expect(
      () =>
        new MarketDeploymentRawReader({
          client: client([], "{}"),
          sourceCommit: "ff".repeat(20) as typeof MARKET_REGISTRY_SOURCE_COMMIT,
        }),
    ).toThrow(/source identity drifted/u);
  });
});
