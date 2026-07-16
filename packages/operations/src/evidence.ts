import {
  assertClosedObject,
  assertKeccak256Digest,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  sha256CanonicalJson,
  type JsonValue,
  type Keccak256Digest,
  type Sha256Digest,
} from "./kernel.js";

export const GENERATION_ROOTS = {
  deployment: {
    repository: "Cork-Technology/cork-deployments",
    directory: "generations",
    payloadSchemaVersion: "cork.deployment-generation/v1",
  },
  "signing-policy": {
    repository: "Cork-Technology/cork-signing-gate",
    directory: "policy-generations",
    payloadSchemaVersion: "cork.signing-policy-generation/v1",
  },
} as const;

export type GenerationRootKindV1 = keyof typeof GENERATION_ROOTS;
export type GenerationStatusV1 =
  | "staged"
  | "active"
  | "retired"
  | "emergency-disabled";

export interface GenerationIdentityV1 {
  readonly generationId: string;
  readonly generation: string;
}

export interface GenerationClaimV1 {
  readonly claimId: string;
  readonly claimDigest: Sha256Digest;
}

export type DeploymentContractRoleV1 =
  | "Permit2"
  | "Bundler3"
  | "CorkAdapter"
  | "CorkPoolManager"
  | "LimitOrderProtocol";

export interface ContractBindingV1 {
  readonly role: DeploymentContractRoleV1;
  readonly address: string;
  readonly deploymentKind: "direct" | "erc-1967" | "beacon";
  readonly runtimeCodeHash: Keccak256Digest;
  readonly abiArtifactDigest: Sha256Digest;
  readonly sourceCommit: string;
  readonly compiledArtifactDigest: Sha256Digest;
  readonly relationships: readonly JsonValue[];
}

export interface ProxyBindingV1 {
  readonly proxyKind: string;
  readonly proxyCodeHash: Keccak256Digest;
  readonly implementationSlot: string;
  readonly implementationAddress: string;
  readonly implementationCodeHash: Keccak256Digest;
  readonly adminAddress?: string;
  readonly beaconAddress?: string;
  readonly beaconCodeHash?: Keccak256Digest;
}

export interface DeploymentPoolBindingV1 {
  readonly poolId: string;
  readonly collateralAsset: string;
  readonly referenceAsset: string;
  readonly expiryTimestamp: string;
  readonly rateMin: string;
  readonly rateMax: string;
  readonly rateChangePerDayMax: string;
  readonly rateChangeCapacityMax: string;
  readonly rateOracle: string;
  readonly poolManager: string;
  readonly cptAddress: string;
  readonly cstAddress: string;
  readonly limitOrderProtocolAddress: string;
  readonly runtimeCodeHash: string;
  readonly proxyIdentityDigest: Sha256Digest;
  readonly criticalGettersDigest: Sha256Digest;
  readonly cachedCollateralDecimals: string;
  readonly issuanceState: "not-issued" | "issued" | "expired";
  readonly pauseState: "unpaused" | "paused";
  readonly whitelistState: "not-required" | "required";
  readonly adapterWhitelisted: boolean;
  readonly relationshipDigest: Sha256Digest;
}

export interface CorkDeploymentManifestV1 {
  readonly schemaVersion: string;
  readonly deploymentId: string;
  readonly chainId: string;
  readonly network: string;
  readonly generation: string;
  readonly status: GenerationStatusV1;
  readonly validFromBlock: string;
  readonly validUntilBlock?: string;
  readonly contracts: readonly ContractBindingV1[];
  readonly proxies: readonly ProxyBindingV1[];
  readonly pools: readonly DeploymentPoolBindingV1[];
  readonly manifestDigest: Sha256Digest;
}

export interface GenerationPayloadV1 extends GenerationIdentityV1 {
  readonly schemaVersion:
    | "cork.deployment-generation/v1"
    | "cork.signing-policy-generation/v1";
  readonly rootKind: GenerationRootKindV1;
  readonly status: GenerationStatusV1;
  readonly releaseIdentity: string;
  readonly contentDigest: Sha256Digest;
  readonly claims: readonly GenerationClaimV1[];
  readonly manifest?: CorkDeploymentManifestV1;
}

export interface GenerationReleaseV1 {
  readonly identity: string;
  readonly tag: string;
  readonly repositoryCommit: string;
  readonly releasedAt: string;
}

export interface ReviewPromotionV1 {
  readonly reviewedByRole: string;
  readonly reviewedAt: string;
  readonly promotedByRole: string;
  readonly promotedAt: string;
}

export interface GenerationPublisherV1 {
  readonly identity: string;
  readonly repository: string;
  readonly path: string;
  readonly publishedAt: string;
}

export interface TransparencyRecordV1 {
  readonly recordId: string;
  readonly repository: string;
  readonly path: string;
  readonly payloadDigest: Sha256Digest;
}

export type GenerationContinuityV1 =
  | {
      readonly kind: "successor";
      readonly predecessorGeneration?: string;
      readonly predecessorPayloadDigest?: Sha256Digest;
    }
  | {
      readonly kind: "tombstone";
      readonly targetGeneration: string;
      readonly priorContentDigest: Sha256Digest;
      readonly reason: string;
    };

export interface GenerationSignatureV1 {
  readonly order: string;
  readonly keyId: string;
  readonly algorithm: "ed25519";
  readonly rootKind: GenerationRootKindV1;
  readonly payloadDigest: Sha256Digest;
  readonly signedAt: string;
  readonly signature: string;
}

export interface GenerationEvidenceV1 {
  readonly schemaVersion: "cork.generation-evidence/v1";
  readonly rootKind: GenerationRootKindV1;
  readonly repository: string;
  readonly path: string;
  readonly identity: GenerationIdentityV1;
  readonly repositoryCommit: string;
  readonly release: GenerationReleaseV1;
  readonly payload: GenerationPayloadV1;
  readonly payloadDigest: Sha256Digest;
  readonly reviewPromotion: ReviewPromotionV1;
  readonly publisher: GenerationPublisherV1;
  readonly transparency: TransparencyRecordV1;
  readonly continuity: GenerationContinuityV1;
  readonly signatures: readonly GenerationSignatureV1[];
}

export interface SignatureVerificationInputV1 {
  readonly rootKind: GenerationRootKindV1;
  readonly keyId: string;
  readonly algorithm: "ed25519";
  readonly messageDigest: Sha256Digest;
  readonly signature: string;
}

export interface BrowserSignatureVerifierV1 {
  verify(input: SignatureVerificationInputV1): boolean;
}

export interface GenerationEvidenceRootsInputV1 {
  readonly deployment: unknown;
  readonly policy: unknown;
}

export interface VerifiedGenerationRootsV1 {
  readonly schemaVersion: "cork.verified-generation-roots/v1";
  readonly deployment: GenerationEvidenceV1;
  readonly policy: GenerationEvidenceV1;
  readonly rootsDigest: Sha256Digest;
}

const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const ADDRESS = /^0x[0-9a-f]{40}$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const CONTRACT_ROLES: readonly DeploymentContractRoleV1[] = [
  "Bundler3",
  "CorkAdapter",
  "CorkPoolManager",
  "LimitOrderProtocol",
  "Permit2",
];

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertSourceCommit(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !SOURCE_COMMIT.test(value)) {
    throw new TypeError(`${label} must be 40 lowercase hexadecimal characters`);
  }
}

function assertAddress(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    throw new TypeError(`${label} must be a lowercase address`);
  }
}

function assertBytes32(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    throw new TypeError(`${label} must be a lowercase bytes32 value`);
  }
}

function assertRootKind(
  value: unknown,
  label: string,
): asserts value is GenerationRootKindV1 {
  if (value !== "deployment" && value !== "signing-policy") {
    throw new TypeError(`${label} is not a generation root kind`);
  }
}

function assertStatus(
  value: unknown,
  label: string,
): asserts value is GenerationStatusV1 {
  if (
    value !== "staged" &&
    value !== "active" &&
    value !== "retired" &&
    value !== "emergency-disabled"
  ) {
    throw new TypeError(`${label} is not a generation status`);
  }
}

function validateContractBinding(
  value: unknown,
  index: number,
): ContractBindingV1 {
  const label = `manifest.contracts[${index}]`;
  assertClosedObject(value, label, [
    "role",
    "address",
    "deploymentKind",
    "runtimeCodeHash",
    "abiArtifactDigest",
    "sourceCommit",
    "compiledArtifactDigest",
    "relationships",
  ]);
  if (
    typeof value.role !== "string" ||
    !CONTRACT_ROLES.includes(value.role as DeploymentContractRoleV1)
  ) {
    throw new TypeError(`${label}.role is unsupported`);
  }
  assertAddress(value.address, `${label}.address`);
  if (
    value.deploymentKind !== "direct" &&
    value.deploymentKind !== "erc-1967" &&
    value.deploymentKind !== "beacon"
  ) {
    throw new TypeError(`${label}.deploymentKind is unsupported`);
  }
  assertKeccak256Digest(value.runtimeCodeHash, `${label}.runtimeCodeHash`);
  assertSha256Digest(value.abiArtifactDigest, `${label}.abiArtifactDigest`);
  assertSourceCommit(value.sourceCommit, `${label}.sourceCommit`);
  assertSha256Digest(
    value.compiledArtifactDigest,
    `${label}.compiledArtifactDigest`,
  );
  if (!Array.isArray(value.relationships)) {
    throw new TypeError(`${label}.relationships must be an array`);
  }
  const relationships = value.relationships.map((relationship) => {
    canonicalizeJson(relationship as JsonValue);
    return JSON.parse(canonicalizeJson(relationship as JsonValue)) as JsonValue;
  });
  return {
    role: value.role as DeploymentContractRoleV1,
    address: value.address,
    deploymentKind: value.deploymentKind,
    runtimeCodeHash: value.runtimeCodeHash,
    abiArtifactDigest: value.abiArtifactDigest,
    sourceCommit: value.sourceCommit,
    compiledArtifactDigest: value.compiledArtifactDigest,
    relationships,
  };
}

function validateProxyBinding(value: unknown, index: number): ProxyBindingV1 {
  const label = `manifest.proxies[${index}]`;
  assertClosedObject(
    value,
    label,
    [
      "proxyKind",
      "proxyCodeHash",
      "implementationSlot",
      "implementationAddress",
      "implementationCodeHash",
    ],
    ["adminAddress", "beaconAddress", "beaconCodeHash"],
  );
  assertNonEmptyString(value.proxyKind, `${label}.proxyKind`);
  assertKeccak256Digest(value.proxyCodeHash, `${label}.proxyCodeHash`);
  assertBytes32(value.implementationSlot, `${label}.implementationSlot`);
  assertAddress(value.implementationAddress, `${label}.implementationAddress`);
  assertKeccak256Digest(
    value.implementationCodeHash,
    `${label}.implementationCodeHash`,
  );
  if (value.adminAddress !== undefined) {
    assertAddress(value.adminAddress, `${label}.adminAddress`);
  }
  if (value.beaconAddress !== undefined) {
    assertAddress(value.beaconAddress, `${label}.beaconAddress`);
  }
  if (value.beaconCodeHash !== undefined) {
    assertKeccak256Digest(value.beaconCodeHash, `${label}.beaconCodeHash`);
  }
  return {
    proxyKind: value.proxyKind,
    proxyCodeHash: value.proxyCodeHash,
    implementationSlot: value.implementationSlot,
    implementationAddress: value.implementationAddress,
    implementationCodeHash: value.implementationCodeHash,
    ...(value.adminAddress === undefined
      ? {}
      : { adminAddress: value.adminAddress }),
    ...(value.beaconAddress === undefined
      ? {}
      : { beaconAddress: value.beaconAddress }),
    ...(value.beaconCodeHash === undefined
      ? {}
      : { beaconCodeHash: value.beaconCodeHash }),
  };
}

function validatePoolBinding(
  value: unknown,
  index: number,
): DeploymentPoolBindingV1 {
  const label = `manifest.pools[${index}]`;
  assertClosedObject(value, label, [
    "poolId",
    "collateralAsset",
    "referenceAsset",
    "expiryTimestamp",
    "rateMin",
    "rateMax",
    "rateChangePerDayMax",
    "rateChangeCapacityMax",
    "rateOracle",
    "poolManager",
    "cptAddress",
    "cstAddress",
    "limitOrderProtocolAddress",
    "runtimeCodeHash",
    "proxyIdentityDigest",
    "criticalGettersDigest",
    "cachedCollateralDecimals",
    "issuanceState",
    "pauseState",
    "whitelistState",
    "adapterWhitelisted",
    "relationshipDigest",
  ]);
  assertBytes32(value.poolId, `${label}.poolId`);
  for (const field of [
    "collateralAsset",
    "referenceAsset",
    "rateOracle",
    "poolManager",
    "cptAddress",
    "cstAddress",
    "limitOrderProtocolAddress",
  ] as const) {
    assertAddress(value[field], `${label}.${field}`);
  }
  for (const field of [
    "expiryTimestamp",
    "rateMin",
    "rateMax",
    "rateChangePerDayMax",
    "rateChangeCapacityMax",
    "cachedCollateralDecimals",
  ] as const) {
    assertUint256Decimal(value[field], `${label}.${field}`);
  }
  assertBytes32(value.runtimeCodeHash, `${label}.runtimeCodeHash`);
  assertSha256Digest(value.proxyIdentityDigest, `${label}.proxyIdentityDigest`);
  assertSha256Digest(
    value.criticalGettersDigest,
    `${label}.criticalGettersDigest`,
  );
  if (
    value.issuanceState !== "not-issued" &&
    value.issuanceState !== "issued" &&
    value.issuanceState !== "expired"
  ) {
    throw new TypeError(`${label}.issuanceState is unsupported`);
  }
  if (value.pauseState !== "unpaused" && value.pauseState !== "paused") {
    throw new TypeError(`${label}.pauseState is unsupported`);
  }
  if (
    value.whitelistState !== "not-required" &&
    value.whitelistState !== "required"
  ) {
    throw new TypeError(`${label}.whitelistState is unsupported`);
  }
  if (typeof value.adapterWhitelisted !== "boolean") {
    throw new TypeError(`${label}.adapterWhitelisted must be boolean`);
  }
  assertSha256Digest(value.relationshipDigest, `${label}.relationshipDigest`);
  const withoutDigest = { ...value } as Record<string, unknown>;
  delete withoutDigest["relationshipDigest"];
  if (
    sha256CanonicalJson(withoutDigest as JsonValue) !== value.relationshipDigest
  ) {
    throw new TypeError(`${label}.relationshipDigest does not match`);
  }
  return JSON.parse(
    canonicalizeJson(value as JsonValue),
  ) as DeploymentPoolBindingV1;
}

export function createCorkDeploymentManifest(
  input: Omit<CorkDeploymentManifestV1, "manifestDigest">,
): CorkDeploymentManifestV1 {
  assertClosedObject(
    input,
    "deployment manifest input",
    [
      "schemaVersion",
      "deploymentId",
      "chainId",
      "network",
      "generation",
      "status",
      "validFromBlock",
      "contracts",
      "proxies",
      "pools",
    ],
    ["validUntilBlock"],
  );
  assertNonEmptyString(input.schemaVersion, "manifest.schemaVersion");
  assertNonEmptyString(input.deploymentId, "manifest.deploymentId");
  assertUint256Decimal(input.chainId, "manifest.chainId");
  assertNonEmptyString(input.network, "manifest.network");
  assertUint256Decimal(input.generation, "manifest.generation");
  assertStatus(input.status, "manifest.status");
  assertUint256Decimal(input.validFromBlock, "manifest.validFromBlock");
  if (input.validUntilBlock !== undefined) {
    assertUint256Decimal(input.validUntilBlock, "manifest.validUntilBlock");
    if (BigInt(input.validUntilBlock) < BigInt(input.validFromBlock)) {
      throw new TypeError("manifest validity interval is inverted");
    }
  }
  if (
    !Array.isArray(input.contracts) ||
    !Array.isArray(input.proxies) ||
    !Array.isArray(input.pools) ||
    input.pools.length === 0
  ) {
    throw new TypeError("manifest contracts, proxies, and pools are required");
  }
  const contracts = input.contracts.map(validateContractBinding);
  const roles = new Set(contracts.map((contract) => contract.role));
  if (
    roles.size !== contracts.length ||
    contracts.some(
      (contract, index) =>
        contract.role !==
        [...contracts].sort((left, right) =>
          left.role.localeCompare(right.role),
        )[index]?.role,
    )
  ) {
    throw new TypeError("manifest contracts must contain unique ordered roles");
  }
  const proxies = input.proxies.map(validateProxyBinding);
  const pools = input.pools.map(validatePoolBinding);
  if (
    new Set(pools.map((pool) => pool.poolId)).size !== pools.length ||
    pools.some(
      (pool, index) =>
        pool.poolId !==
        [...pools].sort((left, right) =>
          left.poolId.localeCompare(right.poolId),
        )[index]?.poolId,
    )
  ) {
    throw new TypeError("manifest pools must be unique and ordered");
  }
  const withoutDigest: Omit<CorkDeploymentManifestV1, "manifestDigest"> = {
    schemaVersion: input.schemaVersion,
    deploymentId: input.deploymentId,
    chainId: input.chainId,
    network: input.network,
    generation: input.generation,
    status: input.status,
    validFromBlock: input.validFromBlock,
    ...(input.validUntilBlock === undefined
      ? {}
      : { validUntilBlock: input.validUntilBlock }),
    contracts,
    proxies,
    pools,
  };
  return deepFreeze({
    ...withoutDigest,
    manifestDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as CorkDeploymentManifestV1;
}

export function validateCorkDeploymentManifest(
  value: unknown,
): CorkDeploymentManifestV1 {
  assertClosedObject(
    value,
    "deployment manifest",
    [
      "schemaVersion",
      "deploymentId",
      "chainId",
      "network",
      "generation",
      "status",
      "validFromBlock",
      "contracts",
      "proxies",
      "pools",
      "manifestDigest",
    ],
    ["validUntilBlock"],
  );
  assertSha256Digest(value.manifestDigest, "manifest.manifestDigest");
  const manifest = createCorkDeploymentManifest({
    schemaVersion: value.schemaVersion as string,
    deploymentId: value.deploymentId as string,
    chainId: value.chainId as string,
    network: value.network as string,
    generation: value.generation as string,
    status: value.status as GenerationStatusV1,
    validFromBlock: value.validFromBlock as string,
    ...(value.validUntilBlock === undefined
      ? {}
      : { validUntilBlock: value.validUntilBlock as string }),
    contracts: value.contracts as readonly ContractBindingV1[],
    proxies: value.proxies as readonly ProxyBindingV1[],
    pools: value.pools as readonly DeploymentPoolBindingV1[],
  });
  if (manifest.manifestDigest !== value.manifestDigest) {
    throw new TypeError("deployment manifest digest does not match");
  }
  return manifest;
}

function expectedPath(
  rootKind: GenerationRootKindV1,
  identity: GenerationIdentityV1,
): string {
  const root = GENERATION_ROOTS[rootKind];
  return `${root.directory}/${identity.generationId}/${identity.generation}/`;
}

function validateIdentity(value: unknown, label: string): GenerationIdentityV1 {
  assertClosedObject(value, label, ["generationId", "generation"]);
  assertNonEmptyString(value.generationId, `${label}.generationId`);
  if (
    value.generationId.includes("/") ||
    value.generationId === "." ||
    value.generationId === ".."
  ) {
    throw new TypeError(`${label}.generationId is not path-safe`);
  }
  assertUint256Decimal(value.generation, `${label}.generation`);
  return {
    generationId: value.generationId,
    generation: value.generation,
  };
}

function validateClaims(value: unknown): readonly GenerationClaimV1[] {
  if (!Array.isArray(value)) {
    throw new TypeError("payload.claims must be an array");
  }
  const claimIds = new Set<string>();
  const claims = value.map((claim, index) => {
    assertClosedObject(claim, `payload.claims[${index}]`, [
      "claimId",
      "claimDigest",
    ]);
    assertNonEmptyString(claim.claimId, `payload.claims[${index}].claimId`);
    assertSha256Digest(
      claim.claimDigest,
      `payload.claims[${index}].claimDigest`,
    );
    if (claimIds.has(claim.claimId)) {
      throw new TypeError("payload claim identifiers must be unique");
    }
    claimIds.add(claim.claimId);
    return {
      claimId: claim.claimId,
      claimDigest: claim.claimDigest,
    };
  });
  const ordered = [...claims].sort((left, right) =>
    left.claimId.localeCompare(right.claimId),
  );
  if (
    ordered.some((claim, index) => claim.claimId !== claims[index]?.claimId)
  ) {
    throw new TypeError("payload claims must be ordered by claimId");
  }
  return claims;
}

function validatePayload(
  value: unknown,
  rootKind: GenerationRootKindV1,
  identity: GenerationIdentityV1,
  releaseIdentity: string,
): GenerationPayloadV1 {
  assertClosedObject(
    value,
    "payload",
    [
      "schemaVersion",
      "rootKind",
      "generationId",
      "generation",
      "status",
      "releaseIdentity",
      "contentDigest",
      "claims",
    ],
    ["manifest"],
  );
  const root = GENERATION_ROOTS[rootKind];
  if (value.schemaVersion !== root.payloadSchemaVersion) {
    throw new TypeError("payload schema version belongs to the wrong root");
  }
  if (value.rootKind !== rootKind) {
    throw new TypeError("payload root kind does not match its evidence root");
  }
  if (
    value.generationId !== identity.generationId ||
    value.generation !== identity.generation
  ) {
    throw new TypeError("payload generation identity does not match");
  }
  assertStatus(value.status, "payload.status");
  if (value.releaseIdentity !== releaseIdentity) {
    throw new TypeError("payload release identity does not match");
  }
  assertSha256Digest(value.contentDigest, "payload.contentDigest");
  const claims = validateClaims(value.claims);
  const manifest =
    rootKind === "deployment" && value.manifest !== undefined
      ? validateCorkDeploymentManifest(value.manifest)
      : undefined;
  if (
    manifest !== undefined &&
    (manifest?.deploymentId !== identity.generationId ||
      manifest.generation !== identity.generation ||
      manifest.status !== value.status ||
      manifest.manifestDigest !== value.contentDigest)
  ) {
    throw new TypeError(
      "deployment manifest identity, status, or digest does not match",
    );
  }
  if (rootKind === "signing-policy" && value.manifest !== undefined) {
    throw new TypeError(
      "signing-policy payload cannot contain a deployment manifest",
    );
  }
  return {
    schemaVersion: root.payloadSchemaVersion,
    rootKind,
    generationId: identity.generationId,
    generation: identity.generation,
    status: value.status,
    releaseIdentity,
    contentDigest: value.contentDigest,
    claims,
    ...(manifest === undefined ? {} : { manifest }),
  };
}

function validateRelease(value: unknown): GenerationReleaseV1 {
  assertClosedObject(value, "release", [
    "identity",
    "tag",
    "repositoryCommit",
    "releasedAt",
  ]);
  assertNonEmptyString(value.identity, "release.identity");
  assertNonEmptyString(value.tag, "release.tag");
  assertSourceCommit(value.repositoryCommit, "release.repositoryCommit");
  assertUint256Decimal(value.releasedAt, "release.releasedAt");
  return {
    identity: value.identity,
    tag: value.tag,
    repositoryCommit: value.repositoryCommit,
    releasedAt: value.releasedAt,
  };
}

function validateReviewPromotion(value: unknown): ReviewPromotionV1 {
  assertClosedObject(value, "reviewPromotion", [
    "reviewedByRole",
    "reviewedAt",
    "promotedByRole",
    "promotedAt",
  ]);
  assertNonEmptyString(value.reviewedByRole, "reviewPromotion.reviewedByRole");
  assertNonEmptyString(value.promotedByRole, "reviewPromotion.promotedByRole");
  if (value.reviewedByRole === value.promotedByRole) {
    throw new TypeError("review and promotion roles must be distinct");
  }
  assertUint256Decimal(value.reviewedAt, "reviewPromotion.reviewedAt");
  assertUint256Decimal(value.promotedAt, "reviewPromotion.promotedAt");
  if (BigInt(value.reviewedAt) > BigInt(value.promotedAt)) {
    throw new TypeError("review must precede promotion");
  }
  return {
    reviewedByRole: value.reviewedByRole,
    reviewedAt: value.reviewedAt,
    promotedByRole: value.promotedByRole,
    promotedAt: value.promotedAt,
  };
}

function validatePublisher(
  value: unknown,
  repository: string,
  path: string,
): GenerationPublisherV1 {
  assertClosedObject(value, "publisher", [
    "identity",
    "repository",
    "path",
    "publishedAt",
  ]);
  assertNonEmptyString(value.identity, "publisher.identity");
  if (value.repository !== repository || value.path !== path) {
    throw new TypeError("publisher is bound to the wrong repository or path");
  }
  assertUint256Decimal(value.publishedAt, "publisher.publishedAt");
  return {
    identity: value.identity,
    repository,
    path,
    publishedAt: value.publishedAt,
  };
}

function validateTransparency(
  value: unknown,
  repository: string,
  path: string,
  payloadDigest: Sha256Digest,
): TransparencyRecordV1 {
  assertClosedObject(value, "transparency", [
    "recordId",
    "repository",
    "path",
    "payloadDigest",
  ]);
  assertNonEmptyString(value.recordId, "transparency.recordId");
  if (
    value.repository !== repository ||
    value.path !== path ||
    value.payloadDigest !== payloadDigest
  ) {
    throw new TypeError("transparency record does not bind the publication");
  }
  return {
    recordId: value.recordId,
    repository,
    path,
    payloadDigest,
  };
}

function validateContinuity(
  value: unknown,
  identity: GenerationIdentityV1,
  payload: GenerationPayloadV1,
): GenerationContinuityV1 {
  if (value !== null && typeof value === "object" && "kind" in value) {
    const record = value as Record<string, unknown>;
    if (record.kind === "successor") {
      assertClosedObject(
        record,
        "continuity",
        ["kind"],
        ["predecessorGeneration", "predecessorPayloadDigest"],
      );
      const generation = BigInt(identity.generation);
      if (generation === 0n) {
        if (
          record.predecessorGeneration !== undefined ||
          record.predecessorPayloadDigest !== undefined
        ) {
          throw new TypeError("generation zero cannot name a predecessor");
        }
        return { kind: "successor" };
      }
      assertUint256Decimal(
        record.predecessorGeneration,
        "continuity.predecessorGeneration",
      );
      assertSha256Digest(
        record.predecessorPayloadDigest,
        "continuity.predecessorPayloadDigest",
      );
      if (BigInt(record.predecessorGeneration) >= generation) {
        throw new TypeError("successor must name a lower generation");
      }
      if (payload.status === "emergency-disabled") {
        throw new TypeError("emergency disable requires tombstone continuity");
      }
      return {
        kind: "successor",
        predecessorGeneration: record.predecessorGeneration,
        predecessorPayloadDigest: record.predecessorPayloadDigest,
      };
    }
    if (record.kind === "tombstone") {
      assertClosedObject(record, "continuity", [
        "kind",
        "targetGeneration",
        "priorContentDigest",
        "reason",
      ]);
      assertUint256Decimal(
        record.targetGeneration,
        "continuity.targetGeneration",
      );
      assertSha256Digest(
        record.priorContentDigest,
        "continuity.priorContentDigest",
      );
      assertNonEmptyString(record.reason, "continuity.reason");
      if (
        payload.status !== "emergency-disabled" ||
        record.targetGeneration !== identity.generation ||
        record.priorContentDigest !== payload.contentDigest
      ) {
        throw new TypeError(
          "tombstone may only disable the same unchanged generation content",
        );
      }
      return {
        kind: "tombstone",
        targetGeneration: record.targetGeneration,
        priorContentDigest: record.priorContentDigest,
        reason: record.reason,
      };
    }
  }
  throw new TypeError("continuity kind is not supported");
}

function validateSignatures(
  value: unknown,
  rootKind: GenerationRootKindV1,
  payloadDigest: Sha256Digest,
  continuity: GenerationContinuityV1,
  promotedAt: string,
  publishedAt: string,
): readonly GenerationSignatureV1[] {
  if (!Array.isArray(value)) {
    throw new TypeError("signatures must be an array");
  }
  const requiredCount = continuity.kind === "tombstone" ? 1 : 2;
  if (value.length !== requiredCount) {
    throw new TypeError(
      `generation evidence requires exactly ${requiredCount} signature(s)`,
    );
  }
  const keyIds = new Set<string>();
  return value.map((signature, index) => {
    assertClosedObject(signature, `signatures[${index}]`, [
      "order",
      "keyId",
      "algorithm",
      "rootKind",
      "payloadDigest",
      "signedAt",
      "signature",
    ]);
    assertUint256Decimal(signature.order, `signatures[${index}].order`);
    if (signature.order !== String(index)) {
      throw new TypeError("signatures must use contiguous canonical order");
    }
    assertNonEmptyString(signature.keyId, `signatures[${index}].keyId`);
    if (keyIds.has(signature.keyId)) {
      throw new TypeError("signature key identifiers must be unique");
    }
    keyIds.add(signature.keyId);
    if (
      signature.algorithm !== "ed25519" ||
      signature.rootKind !== rootKind ||
      signature.payloadDigest !== payloadDigest
    ) {
      throw new TypeError("signature is bound to the wrong root or digest");
    }
    assertUint256Decimal(signature.signedAt, `signatures[${index}].signedAt`);
    if (
      BigInt(signature.signedAt) < BigInt(promotedAt) ||
      BigInt(signature.signedAt) > BigInt(publishedAt)
    ) {
      throw new TypeError(
        "signatures must follow promotion and precede publication",
      );
    }
    assertNonEmptyString(signature.signature, `signatures[${index}].signature`);
    return {
      order: signature.order,
      keyId: signature.keyId,
      algorithm: "ed25519",
      rootKind,
      payloadDigest,
      signedAt: signature.signedAt,
      signature: signature.signature,
    };
  });
}

export function generationIdentityDigest(
  rootKind: GenerationRootKindV1,
  identity: GenerationIdentityV1,
): Sha256Digest {
  assertRootKind(rootKind, "rootKind");
  const validatedIdentity = validateIdentity(identity, "identity");
  return sha256CanonicalJson({
    rootKind,
    repository: GENERATION_ROOTS[rootKind].repository,
    path: expectedPath(rootKind, validatedIdentity),
    generationId: validatedIdentity.generationId,
    generation: validatedIdentity.generation,
  });
}

export function generationPayloadDigest(
  payload: GenerationPayloadV1,
): Sha256Digest {
  canonicalizeJson(payload as unknown as JsonValue);
  return sha256CanonicalJson(payload as unknown as JsonValue);
}

export function validateGenerationEvidence(
  value: unknown,
): GenerationEvidenceV1 {
  assertClosedObject(value, "generation evidence", [
    "schemaVersion",
    "rootKind",
    "repository",
    "path",
    "identity",
    "repositoryCommit",
    "release",
    "payload",
    "payloadDigest",
    "reviewPromotion",
    "publisher",
    "transparency",
    "continuity",
    "signatures",
  ]);
  if (value.schemaVersion !== "cork.generation-evidence/v1") {
    throw new TypeError("generation evidence schema version is not supported");
  }
  assertRootKind(value.rootKind, "rootKind");
  const root = GENERATION_ROOTS[value.rootKind];
  if (value.repository !== root.repository) {
    throw new TypeError("generation evidence repository is not authoritative");
  }
  const identity = validateIdentity(value.identity, "identity");
  const path = expectedPath(value.rootKind, identity);
  if (value.path !== path) {
    throw new TypeError("generation evidence path is mutable or incorrect");
  }
  assertSourceCommit(value.repositoryCommit, "repositoryCommit");
  const release = validateRelease(value.release);
  if (release.repositoryCommit !== value.repositoryCommit) {
    throw new TypeError("release commit does not match repository commit");
  }
  const payload = validatePayload(
    value.payload,
    value.rootKind,
    identity,
    release.identity,
  );
  assertSha256Digest(value.payloadDigest, "payloadDigest");
  const computedPayloadDigest = generationPayloadDigest(payload);
  if (value.payloadDigest !== computedPayloadDigest) {
    throw new TypeError("payload digest does not match canonical payload");
  }
  const reviewPromotion = validateReviewPromotion(value.reviewPromotion);
  const publisher = validatePublisher(value.publisher, root.repository, path);
  if (
    BigInt(release.releasedAt) < BigInt(reviewPromotion.promotedAt) ||
    BigInt(release.releasedAt) > BigInt(publisher.publishedAt)
  ) {
    throw new TypeError(
      "release must follow promotion and precede publication",
    );
  }
  const transparency = validateTransparency(
    value.transparency,
    root.repository,
    path,
    value.payloadDigest,
  );
  const continuity = validateContinuity(value.continuity, identity, payload);
  const signatures = validateSignatures(
    value.signatures,
    value.rootKind,
    value.payloadDigest,
    continuity,
    reviewPromotion.promotedAt,
    publisher.publishedAt,
  );
  return deepFreeze({
    schemaVersion: "cork.generation-evidence/v1",
    rootKind: value.rootKind,
    repository: root.repository,
    path,
    identity,
    repositoryCommit: value.repositoryCommit,
    release,
    payload,
    payloadDigest: value.payloadDigest,
    reviewPromotion,
    publisher,
    transparency,
    continuity,
    signatures,
  }) as GenerationEvidenceV1;
}

function verifySignatures(
  evidence: GenerationEvidenceV1,
  verifier: BrowserSignatureVerifierV1,
): void {
  if (
    verifier === null ||
    typeof verifier !== "object" ||
    typeof verifier.verify !== "function"
  ) {
    throw new TypeError(
      "an injected browser-safe signature verifier is required",
    );
  }
  for (const signature of evidence.signatures) {
    if (
      verifier.verify({
        rootKind: evidence.rootKind,
        keyId: signature.keyId,
        algorithm: signature.algorithm,
        messageDigest: evidence.payloadDigest,
        signature: signature.signature,
      }) !== true
    ) {
      throw new TypeError("generation signature verification failed");
    }
  }
}

export function verifyGenerationEvidenceRoots(
  input: GenerationEvidenceRootsInputV1,
  verifier: BrowserSignatureVerifierV1,
): VerifiedGenerationRootsV1 {
  assertClosedObject(input, "generation roots", ["deployment", "policy"]);
  const deployment = validateGenerationEvidence(input.deployment);
  const policy = validateGenerationEvidence(input.policy);
  if (
    deployment.rootKind !== "deployment" ||
    policy.rootKind !== "signing-policy"
  ) {
    throw new TypeError("deployment and signing-policy roots cannot be merged");
  }
  const deploymentKeys = new Set(
    deployment.signatures.map((signature) => signature.keyId),
  );
  if (
    policy.signatures.some((signature) => deploymentKeys.has(signature.keyId))
  ) {
    throw new TypeError(
      "signature key identifiers cannot be reused across roots",
    );
  }
  verifySignatures(deployment, verifier);
  verifySignatures(policy, verifier);
  const rootsDigest = sha256CanonicalJson({
    deploymentIdentityDigest: generationIdentityDigest(
      deployment.rootKind,
      deployment.identity,
    ),
    deploymentPayloadDigest: deployment.payloadDigest,
    policyIdentityDigest: generationIdentityDigest(
      policy.rootKind,
      policy.identity,
    ),
    policyPayloadDigest: policy.payloadDigest,
  });
  return deepFreeze({
    schemaVersion: "cork.verified-generation-roots/v1",
    deployment,
    policy,
    rootsDigest,
  }) as VerifiedGenerationRootsV1;
}

export function verifyDeploymentManifest(
  input: GenerationEvidenceRootsInputV1,
  verifier: BrowserSignatureVerifierV1,
): {
  readonly roots: VerifiedGenerationRootsV1;
  readonly manifest: CorkDeploymentManifestV1;
} {
  const roots = verifyGenerationEvidenceRoots(input, verifier);
  const manifest = roots.deployment.payload.manifest;
  if (manifest === undefined) {
    throw new TypeError(
      "verified deployment evidence does not contain a typed manifest",
    );
  }
  return deepFreeze({ roots, manifest });
}

export function findDeploymentContract(
  manifest: CorkDeploymentManifestV1,
  role: DeploymentContractRoleV1,
): ContractBindingV1 {
  const validated = validateCorkDeploymentManifest(manifest);
  const contract = validated.contracts.find((binding) => binding.role === role);
  if (contract === undefined) {
    throw new TypeError(`deployment manifest lacks ${role}`);
  }
  return contract;
}

export function findDeploymentPool(
  manifest: CorkDeploymentManifestV1,
  poolId: string,
): DeploymentPoolBindingV1 {
  const validated = validateCorkDeploymentManifest(manifest);
  assertBytes32(poolId, "poolId");
  const pool = validated.pools.find((binding) => binding.poolId === poolId);
  if (pool === undefined) {
    throw new TypeError("deployment manifest lacks the requested pool");
  }
  return pool;
}

export function findGenerationClaim(
  evidence: GenerationEvidenceV1,
  claimId: string,
): GenerationClaimV1 | undefined {
  assertNonEmptyString(claimId, "claimId");
  return evidence.payload.claims.find((claim) => claim.claimId === claimId);
}
