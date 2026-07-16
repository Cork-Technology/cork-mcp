import { describe, expect, it } from "vitest";

import {
  UINT256_MAX_DECIMAL,
  createCorkDeploymentManifest,
  createPermit2Revocation,
  generationPayloadDigest,
  inspectStandingPermit2Authority,
  sha256CanonicalJson,
  type ContractBindingV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type JsonValue,
  type Sha256Digest,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (byte: string) => `0x${byte.repeat(40)}`;
const poolId = `0x${"aa".repeat(32)}`;
const verifier = { verify: () => true };

function contract(): ContractBindingV1 {
  return {
    role: "Permit2",
    address: address("2"),
    deploymentKind: "direct",
    runtimeCodeHash: `keccak256:${"1".repeat(64)}`,
    abiArtifactDigest: digest("1"),
    sourceCommit: "ab".repeat(20),
    compiledArtifactDigest: digest("2"),
    relationships: [],
  };
}

function roots(status: GenerationPayloadV1["status"] = "active") {
  const poolBase = {
    poolId,
    collateralAsset: address("8"),
    referenceAsset: address("9"),
    expiryTimestamp: "2000",
    rateMin: "1",
    rateMax: "2",
    rateChangePerDayMax: "3",
    rateChangeCapacityMax: "4",
    rateOracle: address("a"),
    poolManager: address("b"),
    cptAddress: address("1"),
    cstAddress: address("c"),
    limitOrderProtocolAddress: address("d"),
    runtimeCodeHash: `0x${"2".repeat(64)}`,
    proxyIdentityDigest: digest("3"),
    criticalGettersDigest: digest("4"),
    cachedCollateralDecimals: "6",
    issuanceState: "issued" as const,
    pauseState: "unpaused" as const,
    whitelistState: "required" as const,
    adapterWhitelisted: true,
  };
  const manifest = createCorkDeploymentManifest({
    schemaVersion: "fixture-manifest/v1",
    deploymentId: "phoenix-mainnet",
    chainId: "1",
    network: "fixture",
    generation: "7",
    status,
    validFromBlock: "1",
    contracts: [contract()],
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
  const generation = (rootKind: GenerationRootKindV1): GenerationEvidenceV1 => {
    const generationId =
      rootKind === "deployment" ? "phoenix-mainnet" : "security-policy";
    const repository =
      rootKind === "deployment"
        ? "Cork-Technology/cork-deployments"
        : "Cork-Technology/cork-signing-gate";
    const directory =
      rootKind === "deployment" ? "generations" : "policy-generations";
    const releaseIdentity = `${generationId}-release`;
    const payload: GenerationPayloadV1 = {
      schemaVersion:
        rootKind === "deployment"
          ? "cork.deployment-generation/v1"
          : "cork.signing-policy-generation/v1",
      rootKind,
      generationId,
      generation: "7",
      status,
      releaseIdentity,
      contentDigest:
        rootKind === "deployment" ? manifest.manifestDigest : digest("5"),
      claims: [],
      ...(rootKind === "deployment" ? { manifest } : {}),
    };
    const payloadDigest = generationPayloadDigest(payload);
    const path = `${directory}/${generationId}/7/`;
    const prefix = rootKind === "deployment" ? "deployment" : "policy";
    return {
      schemaVersion: "cork.generation-evidence/v1",
      rootKind,
      repository,
      path,
      identity: { generationId, generation: "7" },
      repositoryCommit: "ab".repeat(20),
      release: {
        identity: releaseIdentity,
        tag: "v7",
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
      publisher: { identity: "bot", repository, path, publishedAt: "6" },
      transparency: {
        recordId: `${prefix}-record`,
        repository,
        path,
        payloadDigest,
      },
      continuity:
        status === "emergency-disabled"
          ? {
              kind: "tombstone",
              targetGeneration: "7",
              priorContentDigest: payload.contentDigest,
              reason: "fixture disable",
            }
          : {
              kind: "successor",
              predecessorGeneration: "6",
              predecessorPayloadDigest: digest("6"),
            },
      signatures: (status === "emergency-disabled" ? [0] : [0, 1]).map(
        (order) => ({
          order: String(order),
          keyId: `${prefix}-${order}`,
          algorithm: "ed25519" as const,
          rootKind,
          payloadDigest,
          signedAt: String(4 + order),
          signature: `${prefix}-${order}`,
        }),
      ),
    };
  };
  return {
    deployment: generation("deployment"),
    policy: generation("signing-policy"),
  };
}

describe("manifest-derived standing Permit2 authority", () => {
  it("emits a terminating exact maximum-approval prerequisite with disclosure", () => {
    const result = inspectStandingPermit2Authority(
      {
        evidenceRoots: roots(),
        poolId,
        tokenRole: "cpt",
        owner: {
          kind: "externally-owned-account",
          address: address("3"),
        },
        observedAllowance: "9",
        requiredAllowance: "10",
      },
      verifier,
    );
    expect(result).toMatchObject({
      outcome: "prerequisite",
      terminatesAttempt: true,
      targetAllowance: UINT256_MAX_DECIMAL,
      transaction: {
        to: address("1"),
        value: "0",
      },
      disclosure: {
        presentedBeforeAuthorization: true,
        code: "standing-permit2-allowance",
        scope: "verified-cork-pool-share",
      },
    });
    expect(result.transaction.calldata.startsWith("0x095ea7b3")).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("keeps historical manifest revocation available and rejects arbitrary claims", () => {
    for (const status of ["active", "retired", "emergency-disabled"] as const) {
      const revocation = createPermit2Revocation(
        {
          evidenceRoots: roots(status),
          poolId,
          tokenRole: "cpt",
          owner: { kind: "safe", address: address("4") },
        },
        verifier,
      );
      expect(revocation).toMatchObject({
        outcome: "permit2-revocation",
        relationship: { status },
        transaction: { to: address("1"), value: "0" },
        confirmation: { freshAllowance: "0" },
      });
      expect(revocation.transaction.calldata.endsWith("0".repeat(64))).toBe(
        true,
      );
    }

    expect(() =>
      inspectStandingPermit2Authority(
        {
          evidenceRoots: {
            ...roots(),
            deployment: {
              ...roots().deployment,
              payload: {
                ...roots().deployment.payload,
                manifest: {
                  ...roots().deployment.payload.manifest!,
                  pools: [
                    {
                      ...roots().deployment.payload.manifest!.pools[0]!,
                      cptAddress: address("f"),
                    },
                  ],
                },
              },
            },
          },
          poolId,
          tokenRole: "cpt",
          owner: {
            kind: "externally-owned-account",
            address: address("3"),
          },
          observedAllowance: "0",
          requiredAllowance: "10",
        },
        verifier,
      ),
    ).toThrow(/digest/iu);

    expect(() =>
      inspectStandingPermit2Authority(
        {
          evidenceRoots: roots(),
          poolId,
          tokenRole: "collateral" as "cpt",
          owner: {
            kind: "externally-owned-account",
            address: address("3"),
          },
          observedAllowance: "0",
          requiredAllowance: "10",
        },
        verifier,
      ),
    ).toThrow(/cpt and cst|unsupported/u);
  });
});
