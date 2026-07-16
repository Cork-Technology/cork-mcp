import { describe, expect, it } from "vitest";

import {
  VERIFIED_MARKET_FACT_FIELDS,
  createCorkDeploymentManifest,
  generationPayloadDigest,
  reconstructVerifiedMarket,
  reconstructVerifiedMarketUniverse,
  sha256Bytes,
  sha256CanonicalJson,
  type BrowserSignatureVerifierV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type JsonValue,
  type MarketDeploymentFactsV1,
  type MarketTupleV1,
  type Sha256Digest,
  type VerifiedMarketFactFieldV1,
  type VerifiedMarketReconstructionInputV1,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (byte: string) => `0x${byte.repeat(40)}`;
const bytes32 = (byte: string) => `0x${byte.repeat(64)}`;

function byteDigest(bytes: Uint8Array): Sha256Digest {
  return `sha256:${Array.from(sha256Bytes(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function hex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function deploymentManifest() {
  const poolWithoutDigest = {
    ...MARKET,
    ...DEPLOYMENT_FACTS,
    adapterWhitelisted: true,
  };
  return createCorkDeploymentManifest({
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
        ...poolWithoutDigest,
        relationshipDigest: sha256CanonicalJson(
          poolWithoutDigest as unknown as JsonValue,
        ),
      },
    ],
  });
}

function generation(rootKind: GenerationRootKindV1): GenerationEvidenceV1 {
  const generationId =
    rootKind === "deployment" ? "phoenix-mainnet" : "signer-policy";
  const repository =
    rootKind === "deployment"
      ? "Cork-Technology/cork-deployments"
      : "Cork-Technology/cork-signing-gate";
  const directory =
    rootKind === "deployment" ? "generations" : "policy-generations";
  const path = `${directory}/${generationId}/7/`;
  const releaseIdentity = `${generationId}-release-7`;
  const manifest = rootKind === "deployment" ? deploymentManifest() : undefined;
  const payload: GenerationPayloadV1 = {
    schemaVersion:
      rootKind === "deployment"
        ? "cork.deployment-generation/v1"
        : "cork.signing-policy-generation/v1",
    rootKind,
    generationId,
    generation: "7",
    status: "active",
    releaseIdentity,
    contentDigest: manifest?.manifestDigest ?? digest("2"),
    claims: [],
    ...(manifest === undefined ? {} : { manifest }),
  };
  const payloadDigest = generationPayloadDigest(payload);
  const keyPrefix = rootKind === "deployment" ? "release" : "security";
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
      identity: "release-bot",
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
      keyId: `${keyPrefix}-${order}`,
      algorithm: "ed25519" as const,
      rootKind,
      payloadDigest,
      signedAt: String(4 + order),
      signature: `${keyPrefix}-signature-${order}`,
    })),
  };
}

const MARKET: MarketTupleV1 = {
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

const DEPLOYMENT_FACTS: MarketDeploymentFactsV1 = {
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

const FACTS: Record<VerifiedMarketFactFieldV1, string> = {
  chainId: "1",
  poolId: MARKET.poolId,
  collateralAsset: MARKET.collateralAsset,
  referenceAsset: MARKET.referenceAsset,
  expiryTimestamp: MARKET.expiryTimestamp,
  rateMin: MARKET.rateMin,
  rateMax: MARKET.rateMax,
  rateChangePerDayMax: MARKET.rateChangePerDayMax,
  rateChangeCapacityMax: MARKET.rateChangeCapacityMax,
  rateOracle: MARKET.rateOracle,
  poolManager: DEPLOYMENT_FACTS.poolManager,
  cptAddress: DEPLOYMENT_FACTS.cptAddress,
  cstAddress: DEPLOYMENT_FACTS.cstAddress,
  limitOrderProtocolAddress: DEPLOYMENT_FACTS.limitOrderProtocolAddress,
  runtimeCodeHash: DEPLOYMENT_FACTS.runtimeCodeHash,
  proxyIdentityDigest: DEPLOYMENT_FACTS.proxyIdentityDigest,
  criticalGettersDigest: DEPLOYMENT_FACTS.criticalGettersDigest,
  cachedCollateralDecimals: DEPLOYMENT_FACTS.cachedCollateralDecimals,
  issuanceState: DEPLOYMENT_FACTS.issuanceState,
  pauseState: DEPLOYMENT_FACTS.pauseState,
  whitelistState: DEPLOYMENT_FACTS.whitelistState,
};

function reconstruction(): VerifiedMarketReconstructionInputV1 {
  const sourceBytes = new TextEncoder().encode(
    JSON.stringify({ chainId: "1", market: MARKET }),
  );
  const requestBytes = "123456789abcdef123456";
  return {
    schemaVersion: "cork.verified-market-reconstruction-input/v1",
    source: {
      schemaVersion: "cork.selected-market-source/v1",
      claim: "source-payload",
      sourceId: "phoenix-markets",
      requestDigest: digest("6"),
      sourceCommit: "cd".repeat(20),
      sourceSchemaDigest: digest("7"),
      selectedItemIdentity: MARKET.poolId,
      sourceItemBytes: hex(sourceBytes),
      sourceItemDigest: byteDigest(sourceBytes),
    },
    evidenceRoots: {
      deployment: generation("deployment"),
      policy: generation("signing-policy"),
    },
    factObservations: VERIFIED_MARKET_FACT_FIELDS.map((field, index) => ({
      field,
      observations: [
        {
          schemaVersion: "cork.raw-observation/v1",
          kind: "success",
          providerId: "provider-a",
          administrationId: "operator-a",
          sourceId: "chain-reader-v1",
          requestDigest: digest(requestBytes[index] ?? "f"),
          sourceCommit: "ef".repeat(20),
          sourceSchemaDigest: digest("8"),
          observedAt: "1000",
          block: {
            kind: "independently-pinned",
            blockNumber: "100",
            blockHash: bytes32("c"),
            parentBlockHash: bytes32("d"),
          },
          value: FACTS[field],
        },
        {
          schemaVersion: "cork.raw-observation/v1",
          kind: "success",
          providerId: "provider-b",
          administrationId: "operator-b",
          sourceId: "chain-reader-v1",
          requestDigest: digest(requestBytes[index] ?? "f"),
          sourceCommit: "ef".repeat(20),
          sourceSchemaDigest: digest("8"),
          observedAt: "1001",
          block: {
            kind: "independently-pinned",
            blockNumber: "100",
            blockHash: bytes32("c"),
            parentBlockHash: bytes32("d"),
          },
          value: FACTS[field],
        },
      ],
    })),
  };
}

const VERIFIER: BrowserSignatureVerifierV1 = { verify: () => true };

describe("hostile-reader verified market reconstruction", () => {
  it("reconstructs the full tuple and all deployment facts in the pure core", () => {
    const result = reconstructVerifiedMarket(reconstruction(), VERIFIER);
    expect(result).toMatchObject({
      schemaVersion: "cork.verified-market/v1",
      outcome: "verified",
      chainId: "1",
      deploymentId: "phoenix-mainnet",
      market: MARKET,
      deploymentFacts: DEPLOYMENT_FACTS,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects reader or caller verdicts and source-only promotion", () => {
    const input = reconstruction();
    const forgedReader = structuredClone(input);
    (
      forgedReader.factObservations[0]?.observations[0] as Record<
        string,
        unknown
      >
    ).verdict = "verified";
    expect(reconstructVerifiedMarket(forgedReader, VERIFIER)).toMatchObject({
      outcome: "conflict",
      code: "QUORUM_FAILED",
    });

    const forgedCaller = {
      ...input,
      verifiedMarket: {
        schemaVersion: "cork.verified-market/v1",
        outcome: "verified",
      },
    };
    expect(
      reconstructVerifiedMarket(
        forgedCaller as unknown as VerifiedMarketReconstructionInputV1,
        VERIFIER,
      ),
    ).toMatchObject({ outcome: "conflict", code: "INPUT_INVALID" });

    expect(
      reconstructVerifiedMarket(
        input.source as unknown as VerifiedMarketReconstructionInputV1,
        VERIFIER,
      ),
    ).toMatchObject({ outcome: "conflict", code: "INPUT_INVALID" });
  });

  it("marks a complete-universe claim incomplete for a material conflict", () => {
    const conflicting = reconstruction();
    const rateMinimum = conflicting.factObservations.find(
      (fact) => fact.field === "rateMin",
    );
    const second = rateMinimum?.observations[1] as
      | Record<string, unknown>
      | undefined;
    if (second !== undefined) second.value = "999";

    const universe = reconstructVerifiedMarketUniverse(
      {
        schemaVersion: "cork.verified-market-universe-input/v1",
        enumerationComplete: true,
        candidates: [
          { material: false, reconstruction: reconstruction() },
          { material: true, reconstruction: conflicting },
        ],
      },
      VERIFIER,
    );
    expect(universe).toMatchObject({
      outcome: "incomplete",
    });
    if (universe.outcome === "incomplete") {
      expect(universe.reasons[0]).toMatch(/material candidate/u);
    }
  });
});
