import {
  LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  createCorkDeploymentManifest,
  generationPayloadDigest,
  sha256CanonicalJson,
  type BrowserSignatureVerifierV1,
  type ContractBindingV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type JsonValue,
  type Sha256Digest,
} from "@corkprotocol/operations";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (byte: string) => `0x${byte.repeat(40)}`;
const runtime = (byte: string) => `keccak256:${byte.repeat(64)}` as const;

export const fixtureEvidenceVerifier: BrowserSignatureVerifierV1 = {
  verify: () => true,
};

export function createFixtureGenerationRoots(input: {
  readonly deploymentId: string;
  readonly chainId: string;
  readonly poolId: string;
  readonly collateralAsset: string;
  readonly referenceAsset: string;
  readonly cptAddress: string;
  readonly cstAddress: string;
  readonly limitOrderProtocolAddress: string;
  readonly status?: GenerationPayloadV1["status"];
}) {
  const status = input.status ?? "active";
  const contract = (
    role: ContractBindingV1["role"],
    contractAddress: string,
  ): ContractBindingV1 => ({
    role,
    address: contractAddress,
    deploymentKind: "direct",
    runtimeCodeHash: runtime("1"),
    abiArtifactDigest: digest("1"),
    sourceCommit:
      role === "LimitOrderProtocol"
        ? LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT
        : "ab".repeat(20),
    compiledArtifactDigest: digest("2"),
    relationships: [],
  });
  const poolBase = {
    poolId: input.poolId,
    collateralAsset: input.collateralAsset,
    referenceAsset: input.referenceAsset,
    expiryTimestamp: "2000000000",
    rateMin: "1",
    rateMax: "2",
    rateChangePerDayMax: "3",
    rateChangeCapacityMax: "4",
    rateOracle: address("a"),
    poolManager: address("6"),
    cptAddress: input.cptAddress,
    cstAddress: input.cstAddress,
    limitOrderProtocolAddress: input.limitOrderProtocolAddress,
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
    schemaVersion: "fixture-deployment-manifest/v1",
    deploymentId: input.deploymentId,
    chainId: input.chainId,
    network: "fixture",
    generation: "7",
    status,
    validFromBlock: "1",
    contracts: [
      contract("Bundler3", address("4")),
      contract("CorkAdapter", address("5")),
      contract("CorkPoolManager", address("6")),
      contract("LimitOrderProtocol", input.limitOrderProtocolAddress),
      contract("Permit2", address("3")),
    ],
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
      rootKind === "deployment" ? input.deploymentId : "security-policy";
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
      continuity: {
        kind: "successor",
        predecessorGeneration: "6",
        predecessorPayloadDigest: digest("6"),
      },
      signatures: [0, 1].map((order) => ({
        order: String(order),
        keyId: `${prefix}-${order}`,
        algorithm: "ed25519" as const,
        rootKind,
        payloadDigest,
        signedAt: String(4 + order),
        signature: `${prefix}-${order}`,
      })),
    };
  };
  return {
    deployment: generation("deployment"),
    policy: generation("signing-policy"),
  };
}
