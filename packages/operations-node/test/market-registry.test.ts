import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  VERIFIED_MARKET_FACT_FIELDS,
  createCorkDeploymentManifest,
  establishPureQuorum,
  generationPayloadDigest,
  reconstructVerifiedMarket,
  sha256CanonicalJson,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type JsonValue,
  type MarketDeploymentFactsV1,
  type MarketTupleV1,
  type Sha256Digest,
  type VerifiedMarketFactFieldV1,
} from "@corkprotocol/operations";
import {
  MARKET_REGISTRY_SOURCE_COMMIT,
  MarketRegistryClient,
  PinnedProviderReader,
} from "../src/index.js";

const CA = `0x${"11".repeat(20)}`;
const REF = `0x${"22".repeat(20)}`;
const WRAPPER = `0x${"33".repeat(20)}`;
const FEED = `0x${"44".repeat(20)}`;
const BLOCK_HASH = `0x${"aa".repeat(32)}`;
const PARENT_HASH = `0x${"bb".repeat(32)}`;

function registryClient(
  fetch: (
    input: string,
    init: { readonly method: "GET"; readonly redirect: "manual" },
  ) => Promise<Response>,
): MarketRegistryClient {
  return new MarketRegistryClient({
    transport: {
      origin: "https://registry.example",
      administrationIdentity: "registry-operator-a",
      sourceSchemaDigest: `sha256:${"1".repeat(64)}`,
      fetch,
    },
    now: () => "1000",
  });
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("MarketRegistryClient", () => {
  it("exposes exactly the three pinned read routes and preserves ca/ref order", async () => {
    const urls: string[] = [];
    const client = registryClient(async (input, init) => {
      expect(init).toEqual({ method: "GET", redirect: "manual" });
      urls.push(input);
      if (input.endsWith("/v1/assets")) {
        return response({
          data: [],
          total: 0,
          limit: 500,
          offset: 0,
          meta: { reads: {} },
        });
      }
      if (input.includes("/v1/oracles/")) {
        return response({
          chain_id: 1,
          ca: CA,
          ref: REF,
          wrapper: WRAPPER,
          deployed: true,
          deployable: true,
          reason: null,
          meta: { reads: { "1": { block_number: 123 } } },
        });
      }
      return response({
        address: CA,
        chain_id: 1,
        symbol: "CA",
        decimals: 18,
        sources: [{ address: FEED, quote_unit: "" }],
        meta: { reads: { "1": { block_number: 123 } } },
      });
    });

    await client.listAssets();
    await client.getAsset({ chainId: 1, address: CA });
    const oracle = await client.getOracle({ chainId: 1, ca: CA, ref: REF });

    expect(
      Object.getOwnPropertyNames(MarketRegistryClient.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(["getAsset", "getOracle", "listAssets"].sort());
    expect(urls).toEqual([
      "https://registry.example/v1/assets",
      `https://registry.example/v1/assets/1/${CA}`,
      `https://registry.example/v1/oracles/1/${CA}/${REF}`,
    ]);
    expect(oracle.sourceCommit).toBe(MARKET_REGISTRY_SOURCE_COMMIT);
    expect(MARKET_REGISTRY_SOURCE_COMMIT).toBe(
      "d2f0352bd2eaca64f65b2cb401dcf9d343e0190b",
    );
  });

  it("preserves full bytes and labels meta and deployed fields as untrusted", async () => {
    const raw =
      `{"chain_id":1,"ca":"${CA}","ref":"${REF}",` +
      `"wrapper":"${WRAPPER}","deployed":true,"deployable":true,` +
      `"reason":null,"meta":{"reads":{"1":{"block_number":123,"stale":false}}}}`;
    const bytes = new TextEncoder().encode(raw);
    const result = await registryClient(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { "content-type": " application/json " },
        }),
    ).getOracle({ chainId: 1, ca: CA, ref: REF });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.bodyBase64).toBe(
        Buffer.from(bytes).toString("base64"),
      );
      expect(result.value.bodyLength).toBe(String(bytes.byteLength));
      expect(result.value.projection.ok).toBe(true);
      if (
        result.value.projection.ok &&
        result.value.projection.kind === "oracle"
      ) {
        expect(result.value.projection.value.deployedClaim).toEqual({
          classification: "untrusted-source-claim",
          value: true,
        });
        expect(result.value.projection.value.deployableClaim).toEqual({
          classification: "untrusted-source-claim",
          value: true,
        });
        expect(result.value.projection.value.reads.classification).toBe(
          "untrusted-source-metadata",
        );
      }
      expect(JSON.stringify(result.value)).not.toContain('"verified"');
      expect(JSON.stringify(result.value)).not.toContain('"healthy"');
    }
  });

  it("rejects reversed response keys without losing the exact source bytes", async () => {
    const raw = JSON.stringify({
      chain_id: 1,
      ca: REF,
      ref: CA,
      wrapper: WRAPPER,
      deployed: true,
      deployable: true,
      reason: null,
      meta: { reads: {} },
    });
    const result = await registryClient(async () =>
      response(JSON.parse(raw)),
    ).getOracle({ chainId: 1, ca: CA, ref: REF });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.bodyBase64).toBe(Buffer.from(raw).toString("base64"));
      expect(result.value.projection.ok).toBe(false);
    }
  });
});

describe("PinnedProviderReader", () => {
  it("returns only exact raw pinned-block observations and no verdict fields", async () => {
    const reader = new PinnedProviderReader({
      providerIdentity: "provider-a",
      administrationIdentity: "independent-admin-a",
      chainIdentity: "eip155:1",
      sourceCommit: "1111111111111111111111111111111111111111",
      sourceSchemaDigest: `sha256:${"2".repeat(64)}`,
      adapter: {
        readAtBlock: async () => ({
          blockNumber: 123,
          blockHash: BLOCK_HASH,
          parentHash: PARENT_HASH,
          rawResult: { result: "0x1234" },
        }),
      },
      now: () => "1000",
    });

    const observation = await reader.read({
      kind: "contract-call",
      chainId: 1,
      blockNumber: 123,
      target: CA,
      data: "0x1234",
    });
    expect(observation.kind).toBe("success");
    if (observation.kind === "success") {
      expect(observation.block).toEqual({
        kind: "independently-pinned",
        blockNumber: "123",
        blockHash: BLOCK_HASH,
        parentBlockHash: PARENT_HASH,
      });
      expect(observation.value).toEqual({ result: "0x1234" });
      const serialized = JSON.stringify(observation);
      for (const forbidden of [
        '"verified"',
        '"healthy"',
        '"active"',
        '"binding"',
        '"quorum"',
        '"deploymentVerdict"',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });

  it("fails when the provider does not bind the requested block exactly", async () => {
    const reader = new PinnedProviderReader({
      providerIdentity: "provider-b",
      administrationIdentity: "independent-admin-b",
      chainIdentity: "eip155:1",
      sourceCommit: "2222222222222222222222222222222222222222",
      sourceSchemaDigest: `sha256:${"3".repeat(64)}`,
      adapter: {
        readAtBlock: async () => ({
          blockNumber: 124,
          blockHash: BLOCK_HASH,
          parentHash: PARENT_HASH,
          rawResult: "0x",
        }),
      },
      now: () => "1000",
    });
    const observation = await reader.read({
      kind: "block-header",
      chainId: 1,
      blockNumber: 123,
    });
    expect(observation.kind).toBe("failure");
    if (observation.kind === "failure") {
      expect(observation.failure.code).toBe("PROVIDER_OBSERVATION_INVALID");
      expect("block" in observation).toBe(false);
    }
  });

  it("feeds real provider output directly into the canonical quorum", async () => {
    const reader = (providerIdentity: string, administrationIdentity: string) =>
      new PinnedProviderReader({
        providerIdentity,
        administrationIdentity,
        chainIdentity: "eip155:1",
        sourceCommit: "3333333333333333333333333333333333333333",
        sourceSchemaDigest: `sha256:${"4".repeat(64)}`,
        adapter: {
          readAtBlock: async () => ({
            blockNumber: 123,
            blockHash: BLOCK_HASH,
            parentHash: PARENT_HASH,
            rawResult: "0x1234",
          }),
        },
        now: () => "1000",
      });
    const request = {
      kind: "contract-call" as const,
      chainId: 1,
      blockNumber: 123,
      target: CA,
      data: "0x1234",
    };
    const result = establishPureQuorum(
      await Promise.all([
        reader("provider-a", "admin-a").read(request),
        reader("provider-b", "admin-b").read(request),
      ]),
    );
    expect(result).toMatchObject({
      outcome: "authoritative",
      value: "0x1234",
      binding: {
        blockNumber: "123",
        blockHash: BLOCK_HASH,
        parentBlockHash: PARENT_HASH,
      },
    });
  });

  it("feeds real provider output directly into verified-market reconstruction", async () => {
    const digest = (byte: string) =>
      `sha256:${byte.repeat(64)}` as Sha256Digest;
    const address = (byte: string) => `0x${byte.repeat(40)}`;
    const bytes32 = (byte: string) => `0x${byte.repeat(64)}`;
    const market: MarketTupleV1 = {
      poolId: bytes32("a"),
      collateralAsset: address("1"),
      referenceAsset: address("2"),
      expiryTimestamp: "2000000000",
      rateMin: "1",
      rateMax: "2",
      rateChangePerDayMax: "3",
      rateChangeCapacityMax: "4",
      rateOracle: address("3"),
    };
    const deploymentFacts: MarketDeploymentFactsV1 = {
      poolManager: address("4"),
      cptAddress: address("5"),
      cstAddress: address("6"),
      limitOrderProtocolAddress: address("7"),
      runtimeCodeHash: bytes32("b"),
      proxyIdentityDigest: digest("4"),
      criticalGettersDigest: digest("5"),
      cachedCollateralDecimals: "6",
      issuanceState: "issued",
      pauseState: "unpaused",
      whitelistState: "required",
    };
    const values: Record<VerifiedMarketFactFieldV1, JsonValue> = {
      chainId: "1",
      poolId: market.poolId,
      collateralAsset: market.collateralAsset,
      referenceAsset: market.referenceAsset,
      expiryTimestamp: market.expiryTimestamp,
      rateMin: market.rateMin,
      rateMax: market.rateMax,
      rateChangePerDayMax: market.rateChangePerDayMax,
      rateChangeCapacityMax: market.rateChangeCapacityMax,
      rateOracle: market.rateOracle,
      poolManager: deploymentFacts.poolManager,
      cptAddress: deploymentFacts.cptAddress,
      cstAddress: deploymentFacts.cstAddress,
      limitOrderProtocolAddress: deploymentFacts.limitOrderProtocolAddress,
      runtimeCodeHash: deploymentFacts.runtimeCodeHash,
      proxyIdentityDigest: deploymentFacts.proxyIdentityDigest,
      criticalGettersDigest: deploymentFacts.criticalGettersDigest,
      cachedCollateralDecimals: deploymentFacts.cachedCollateralDecimals,
      issuanceState: deploymentFacts.issuanceState,
      pauseState: deploymentFacts.pauseState,
      whitelistState: deploymentFacts.whitelistState,
    };
    const poolBase = {
      ...market,
      ...deploymentFacts,
      adapterWhitelisted: true,
    };
    const manifest = createCorkDeploymentManifest({
      schemaVersion: "fixture-deployment-manifest/v1",
      deploymentId: "phoenix-mainnet",
      chainId: "1",
      network: "fixture",
      generation: "7",
      status: "active",
      validFromBlock: "1",
      contracts: [],
      proxies: [],
      pools: [
        {
          ...poolBase,
          relationshipDigest: sha256CanonicalJson(
            poolBase as unknown as JsonValue,
          ),
        },
      ],
    });
    const generation = (
      rootKind: GenerationRootKindV1,
    ): GenerationEvidenceV1 => {
      const deployment = rootKind === "deployment";
      const generationId = deployment ? "phoenix-mainnet" : "signer-policy";
      const repository = deployment
        ? "Cork-Technology/cork-deployments"
        : "Cork-Technology/cork-signing-gate";
      const directory = deployment ? "generations" : "policy-generations";
      const path = `${directory}/${generationId}/7/`;
      const releaseIdentity = `${generationId}-release-7`;
      const payload: GenerationPayloadV1 = {
        schemaVersion: deployment
          ? "cork.deployment-generation/v1"
          : "cork.signing-policy-generation/v1",
        rootKind,
        generationId,
        generation: "7",
        status: "active",
        releaseIdentity,
        contentDigest: deployment ? manifest.manifestDigest : digest("2"),
        claims: [],
        ...(deployment ? { manifest } : {}),
      };
      const payloadDigest = generationPayloadDigest(payload);
      return {
        schemaVersion: "cork.generation-evidence/v1",
        rootKind,
        repository,
        path,
        identity: { generationId, generation: "7" },
        repositoryCommit: "ab".repeat(20),
        release: {
          identity: releaseIdentity,
          tag: "v7.0.0",
          repositoryCommit: "ab".repeat(20),
          releasedAt: "3",
        },
        payload,
        payloadDigest,
        reviewPromotion: {
          reviewedByRole: "reviewer",
          reviewedAt: "1",
          promotedByRole: "promoter",
          promotedAt: "2",
        },
        publisher: {
          identity: "publisher",
          repository,
          path,
          publishedAt: "6",
        },
        transparency: {
          recordId: `${generationId}-record`,
          repository,
          path,
          payloadDigest,
        },
        continuity: {
          kind: "successor",
          predecessorGeneration: "6",
          predecessorPayloadDigest: digest("3"),
        },
        signatures: [0, 1].map((order) => ({
          order: String(order),
          keyId: `${deployment ? "release" : "security"}-${order}`,
          algorithm: "ed25519" as const,
          rootKind,
          payloadDigest,
          signedAt: String(4 + order),
          signature: `signature-${rootKind}-${order}`,
        })),
      };
    };
    const sourceBytes = new TextEncoder().encode(
      JSON.stringify({ chainId: "1", market }),
    );
    const sourceItemBytes = `0x${Buffer.from(sourceBytes).toString("hex")}`;
    const sourceItemDigest =
      `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}` as Sha256Digest;
    const factObservations = await Promise.all(
      VERIFIED_MARKET_FACT_FIELDS.map(async (field, index) => {
        const makeReader = (
          providerIdentity: string,
          administrationIdentity: string,
        ) =>
          new PinnedProviderReader({
            providerIdentity,
            administrationIdentity,
            chainIdentity: "chain-reader-v1",
            sourceCommit: "ef".repeat(20),
            sourceSchemaDigest: digest("8"),
            adapter: {
              readAtBlock: async () => ({
                blockNumber: 100,
                blockHash: bytes32("c"),
                parentHash: bytes32("d"),
                rawResult: values[field],
              }),
            },
            now: () => "1000",
          });
        const request = {
          kind: "contract-call" as const,
          chainId: 1,
          blockNumber: 100,
          target: address("9"),
          data: `0x${index.toString(16).padStart(2, "0")}`,
        };
        return {
          field,
          observations: await Promise.all([
            makeReader("provider-a", "operator-a").read(request),
            makeReader("provider-b", "operator-b").read(request),
          ]),
        };
      }),
    );
    const result = reconstructVerifiedMarket(
      {
        schemaVersion: "cork.verified-market-reconstruction-input/v1",
        source: {
          schemaVersion: "cork.selected-market-source/v1",
          claim: "source-payload",
          sourceId: "phoenix-markets",
          requestDigest: digest("6"),
          sourceCommit: "cd".repeat(20),
          sourceSchemaDigest: digest("7"),
          selectedItemIdentity: market.poolId,
          sourceItemBytes,
          sourceItemDigest,
        },
        evidenceRoots: {
          deployment: generation("deployment"),
          policy: generation("signing-policy"),
        },
        factObservations,
      },
      { verify: () => true },
    );
    expect(result).toMatchObject({
      outcome: "verified",
      market,
      deploymentFacts,
    });
  });
});
