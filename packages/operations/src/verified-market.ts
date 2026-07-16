import {
  findDeploymentPool,
  verifyGenerationEvidenceRoots,
  type BrowserSignatureVerifierV1,
  type DeploymentPoolBindingV1,
  type GenerationEvidenceV1,
} from "./evidence.js";
import {
  assertClosedObject,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  sha256Bytes,
  sha256CanonicalJson,
  type JsonValue,
  type Sha256Digest,
} from "./kernel.js";
import { establishPureQuorum, type QuorumBindingV1 } from "./quorum.js";

export const VERIFIED_MARKET_FACT_FIELDS = [
  "chainId",
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
] as const;

export type VerifiedMarketFactFieldV1 =
  (typeof VERIFIED_MARKET_FACT_FIELDS)[number];

export interface MarketTupleV1 {
  readonly poolId: string;
  readonly collateralAsset: string;
  readonly referenceAsset: string;
  readonly expiryTimestamp: string;
  readonly rateMin: string;
  readonly rateMax: string;
  readonly rateChangePerDayMax: string;
  readonly rateChangeCapacityMax: string;
  readonly rateOracle: string;
}

export interface MarketDeploymentFactsV1 {
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
}

export interface SelectedMarketSourceV1 {
  readonly schemaVersion: "cork.selected-market-source/v1";
  readonly claim: "source-payload";
  readonly sourceId: string;
  readonly requestDigest: Sha256Digest;
  readonly sourceCommit: string;
  readonly sourceSchemaDigest: Sha256Digest;
  readonly selectedItemIdentity: string;
  readonly sourceItemBytes: string;
  readonly sourceItemDigest: Sha256Digest;
}

export interface MarketFactObservationSetV1 {
  readonly field: VerifiedMarketFactFieldV1;
  readonly observations: readonly unknown[];
}

export interface VerifiedMarketReconstructionInputV1 {
  readonly schemaVersion: "cork.verified-market-reconstruction-input/v1";
  readonly source: SelectedMarketSourceV1;
  readonly evidenceRoots: {
    readonly deployment: unknown;
    readonly policy: unknown;
  };
  readonly factObservations: readonly MarketFactObservationSetV1[];
}

export interface VerifiedMarketConsistencyCheckV1 {
  readonly field: VerifiedMarketFactFieldV1;
  readonly consistent: true;
}

export interface VerifiedMarketSuccessV1 {
  readonly schemaVersion: "cork.verified-market/v1";
  readonly outcome: "verified";
  readonly chainId: string;
  readonly deploymentId: string;
  readonly manifestGeneration: string;
  readonly manifestDigest: Sha256Digest;
  readonly sourcePayloadDigest: Sha256Digest;
  readonly selectedSourceItemIdentity: string;
  readonly selectedSourceItemDigest: Sha256Digest;
  readonly observation: QuorumBindingV1;
  readonly market: MarketTupleV1;
  readonly deploymentFacts: MarketDeploymentFactsV1;
  readonly consistencyChecks: readonly VerifiedMarketConsistencyCheckV1[];
  readonly verifiedMarketDigest: Sha256Digest;
}

export interface VerifiedMarketConflictV1 {
  readonly schemaVersion: "cork.verified-market/v1";
  readonly outcome: "conflict";
  readonly code:
    | "INPUT_INVALID"
    | "EVIDENCE_INVALID"
    | "EVIDENCE_INACTIVE"
    | "QUORUM_FAILED"
    | "SAME_BLOCK_REQUIRED"
    | "SOURCE_CONFLICT"
    | "DEPLOYMENT_CLAIM_MISSING";
  readonly conflicts: readonly string[];
  readonly verifiedMarketDigest: Sha256Digest;
}

export type VerifiedMarketV1 =
  | VerifiedMarketSuccessV1
  | VerifiedMarketConflictV1;

export interface VerifiedMarketUniverseCandidateV1 {
  readonly material: boolean;
  readonly reconstruction: VerifiedMarketReconstructionInputV1;
}

export interface VerifiedMarketUniverseInputV1 {
  readonly schemaVersion: "cork.verified-market-universe-input/v1";
  readonly enumerationComplete: boolean;
  readonly candidates: readonly VerifiedMarketUniverseCandidateV1[];
}

export type VerifiedMarketUniverseV1 =
  | {
      readonly schemaVersion: "cork.verified-market-universe/v1";
      readonly outcome: "complete";
      readonly verifiedMarketDigests: readonly Sha256Digest[];
      readonly universeDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.verified-market-universe/v1";
      readonly outcome: "incomplete";
      readonly reasons: readonly string[];
      readonly universeDigest: Sha256Digest;
    };

interface ParsedSourceV1 {
  readonly source: SelectedMarketSourceV1;
  readonly chainId: string;
  readonly market: MarketTupleV1;
}

const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const ADDRESS = /^0x[0-9a-f]{40}$/u;
const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
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

function assertSourceCommit(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !SOURCE_COMMIT.test(value)) {
    throw new TypeError(`${label} must be 40 lowercase hexadecimal characters`);
  }
}

function hexBytes(value: string): Uint8Array {
  if (!BYTES.test(value)) {
    throw new TypeError("sourceItemBytes must be canonical lowercase bytes");
  }
  const output = new Uint8Array((value.length - 2) / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(
      value.slice(2 + index * 2, 4 + index * 2),
      16,
    );
  }
  return output;
}

function bytesToHex(value: Uint8Array): string {
  let output = "";
  for (const byte of value) {
    output += byte.toString(16).padStart(2, "0");
  }
  return output;
}

function sha256DigestBytes(value: Uint8Array): Sha256Digest {
  return `sha256:${bytesToHex(sha256Bytes(value))}`;
}

function validateMarketTuple(value: unknown, label: string): MarketTupleV1 {
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
  ]);
  assertBytes32(value.poolId, `${label}.poolId`);
  assertAddress(value.collateralAsset, `${label}.collateralAsset`);
  assertAddress(value.referenceAsset, `${label}.referenceAsset`);
  assertUint256Decimal(value.expiryTimestamp, `${label}.expiryTimestamp`);
  assertUint256Decimal(value.rateMin, `${label}.rateMin`);
  assertUint256Decimal(value.rateMax, `${label}.rateMax`);
  assertUint256Decimal(
    value.rateChangePerDayMax,
    `${label}.rateChangePerDayMax`,
  );
  assertUint256Decimal(
    value.rateChangeCapacityMax,
    `${label}.rateChangeCapacityMax`,
  );
  assertAddress(value.rateOracle, `${label}.rateOracle`);
  return {
    poolId: value.poolId,
    collateralAsset: value.collateralAsset,
    referenceAsset: value.referenceAsset,
    expiryTimestamp: value.expiryTimestamp,
    rateMin: value.rateMin,
    rateMax: value.rateMax,
    rateChangePerDayMax: value.rateChangePerDayMax,
    rateChangeCapacityMax: value.rateChangeCapacityMax,
    rateOracle: value.rateOracle,
  };
}

function validateSelectedSource(value: unknown): ParsedSourceV1 {
  assertClosedObject(value, "source", [
    "schemaVersion",
    "claim",
    "sourceId",
    "requestDigest",
    "sourceCommit",
    "sourceSchemaDigest",
    "selectedItemIdentity",
    "sourceItemBytes",
    "sourceItemDigest",
  ]);
  if (
    value.schemaVersion !== "cork.selected-market-source/v1" ||
    value.claim !== "source-payload"
  ) {
    throw new TypeError("source must be a source-payload claim");
  }
  assertNonEmptyString(value.sourceId, "source.sourceId");
  assertSha256Digest(value.requestDigest, "source.requestDigest");
  assertSourceCommit(value.sourceCommit, "source.sourceCommit");
  assertSha256Digest(value.sourceSchemaDigest, "source.sourceSchemaDigest");
  assertNonEmptyString(
    value.selectedItemIdentity,
    "source.selectedItemIdentity",
  );
  const sourceItemBytes = hexBytes(value.sourceItemBytes as string);
  assertSha256Digest(value.sourceItemDigest, "source.sourceItemDigest");
  if (sha256DigestBytes(sourceItemBytes) !== value.sourceItemDigest) {
    throw new TypeError("source item digest does not match exact source bytes");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(sourceItemBytes),
    ) as unknown;
  } catch {
    throw new TypeError("source item bytes are not valid UTF-8 JSON");
  }
  assertClosedObject(decoded, "selected source item", ["chainId", "market"]);
  assertUint256Decimal(decoded.chainId, "selected source item.chainId");
  const market = validateMarketTuple(
    decoded.market,
    "selected source item.market",
  );
  if (value.selectedItemIdentity !== market.poolId) {
    throw new TypeError("selected source identity does not match its pool");
  }
  return {
    source: {
      schemaVersion: "cork.selected-market-source/v1",
      claim: "source-payload",
      sourceId: value.sourceId,
      requestDigest: value.requestDigest,
      sourceCommit: value.sourceCommit,
      sourceSchemaDigest: value.sourceSchemaDigest,
      selectedItemIdentity: value.selectedItemIdentity,
      sourceItemBytes: value.sourceItemBytes as string,
      sourceItemDigest: value.sourceItemDigest,
    },
    chainId: decoded.chainId,
    market,
  };
}

function factString(
  facts: ReadonlyMap<VerifiedMarketFactFieldV1, JsonValue>,
  field: VerifiedMarketFactFieldV1,
): string {
  const value = facts.get(field);
  if (typeof value !== "string") {
    throw new TypeError(`${field} quorum value must be a string`);
  }
  return value;
}

function reconstructDeploymentFacts(
  facts: ReadonlyMap<VerifiedMarketFactFieldV1, JsonValue>,
): MarketDeploymentFactsV1 {
  const poolManager = factString(facts, "poolManager");
  const cptAddress = factString(facts, "cptAddress");
  const cstAddress = factString(facts, "cstAddress");
  const limitOrderProtocolAddress = factString(
    facts,
    "limitOrderProtocolAddress",
  );
  const runtimeCodeHash = factString(facts, "runtimeCodeHash");
  const proxyIdentityDigest = factString(facts, "proxyIdentityDigest");
  const criticalGettersDigest = factString(facts, "criticalGettersDigest");
  const cachedCollateralDecimals = factString(
    facts,
    "cachedCollateralDecimals",
  );
  const issuanceState = factString(facts, "issuanceState");
  const pauseState = factString(facts, "pauseState");
  const whitelistState = factString(facts, "whitelistState");
  assertAddress(poolManager, "poolManager");
  assertAddress(cptAddress, "cptAddress");
  assertAddress(cstAddress, "cstAddress");
  assertAddress(limitOrderProtocolAddress, "limitOrderProtocolAddress");
  assertBytes32(runtimeCodeHash, "runtimeCodeHash");
  assertSha256Digest(proxyIdentityDigest, "proxyIdentityDigest");
  assertSha256Digest(criticalGettersDigest, "criticalGettersDigest");
  assertUint256Decimal(cachedCollateralDecimals, "cachedCollateralDecimals");
  if (
    issuanceState !== "not-issued" &&
    issuanceState !== "issued" &&
    issuanceState !== "expired"
  ) {
    throw new TypeError("issuanceState is not supported");
  }
  if (pauseState !== "unpaused" && pauseState !== "paused") {
    throw new TypeError("pauseState is not supported");
  }
  if (whitelistState !== "not-required" && whitelistState !== "required") {
    throw new TypeError("whitelistState is not supported");
  }
  return {
    poolManager,
    cptAddress,
    cstAddress,
    limitOrderProtocolAddress,
    runtimeCodeHash,
    proxyIdentityDigest,
    criticalGettersDigest,
    cachedCollateralDecimals,
    issuanceState,
    pauseState,
    whitelistState,
  };
}

function reconstructedMarket(
  facts: ReadonlyMap<VerifiedMarketFactFieldV1, JsonValue>,
): { readonly chainId: string; readonly market: MarketTupleV1 } {
  const chainId = factString(facts, "chainId");
  assertUint256Decimal(chainId, "chainId");
  return {
    chainId,
    market: validateMarketTuple(
      {
        poolId: factString(facts, "poolId"),
        collateralAsset: factString(facts, "collateralAsset"),
        referenceAsset: factString(facts, "referenceAsset"),
        expiryTimestamp: factString(facts, "expiryTimestamp"),
        rateMin: factString(facts, "rateMin"),
        rateMax: factString(facts, "rateMax"),
        rateChangePerDayMax: factString(facts, "rateChangePerDayMax"),
        rateChangeCapacityMax: factString(facts, "rateChangeCapacityMax"),
        rateOracle: factString(facts, "rateOracle"),
      },
      "quorum market",
    ),
  };
}

export function verifiedMarketAuthorityClaimDigest(
  selectedItemIdentity: string,
  chainId: string,
  market: MarketTupleV1,
  deploymentFacts: MarketDeploymentFactsV1,
): Sha256Digest {
  assertNonEmptyString(selectedItemIdentity, "selectedItemIdentity");
  assertUint256Decimal(chainId, "chainId");
  const validatedMarket = validateMarketTuple(market, "market");
  const validatedFacts = reconstructDeploymentFacts(
    new Map<VerifiedMarketFactFieldV1, JsonValue>([
      ["poolManager", deploymentFacts.poolManager],
      ["cptAddress", deploymentFacts.cptAddress],
      ["cstAddress", deploymentFacts.cstAddress],
      ["limitOrderProtocolAddress", deploymentFacts.limitOrderProtocolAddress],
      ["runtimeCodeHash", deploymentFacts.runtimeCodeHash],
      ["proxyIdentityDigest", deploymentFacts.proxyIdentityDigest],
      ["criticalGettersDigest", deploymentFacts.criticalGettersDigest],
      ["cachedCollateralDecimals", deploymentFacts.cachedCollateralDecimals],
      ["issuanceState", deploymentFacts.issuanceState],
      ["pauseState", deploymentFacts.pauseState],
      ["whitelistState", deploymentFacts.whitelistState],
    ]),
  );
  return sha256CanonicalJson({
    selectedItemIdentity,
    chainId,
    market: validatedMarket as unknown as JsonValue,
    deploymentFacts: validatedFacts as unknown as JsonValue,
  });
}

function conflict(
  code: VerifiedMarketConflictV1["code"],
  conflicts: readonly string[],
): VerifiedMarketConflictV1 {
  const projection = {
    schemaVersion: "cork.verified-market/v1" as const,
    outcome: "conflict" as const,
    code,
    conflicts,
  };
  return deepFreeze({
    ...projection,
    verifiedMarketDigest: sha256CanonicalJson(
      projection as unknown as JsonValue,
    ),
  }) as VerifiedMarketConflictV1;
}

function sameBlock(
  reference: QuorumBindingV1,
  candidate: QuorumBindingV1,
): boolean {
  return (
    reference.sourceId === candidate.sourceId &&
    reference.sourceCommit === candidate.sourceCommit &&
    reference.sourceSchemaDigest === candidate.sourceSchemaDigest &&
    reference.blockNumber === candidate.blockNumber &&
    reference.blockHash === candidate.blockHash &&
    reference.parentBlockHash === candidate.parentBlockHash &&
    canonicalizeJson(reference.providerIds as unknown as JsonValue) ===
      canonicalizeJson(candidate.providerIds as unknown as JsonValue) &&
    canonicalizeJson(reference.administrationIds as unknown as JsonValue) ===
      canonicalizeJson(candidate.administrationIds as unknown as JsonValue)
  );
}

function activeDeploymentEvidence(evidence: GenerationEvidenceV1): boolean {
  return (
    evidence.rootKind === "deployment" &&
    evidence.payload.status === "active" &&
    evidence.continuity.kind === "successor"
  );
}

export function reconstructVerifiedMarket(
  input: VerifiedMarketReconstructionInputV1,
  verifier: BrowserSignatureVerifierV1,
): VerifiedMarketV1 {
  let source: ParsedSourceV1;
  let factSets: readonly MarketFactObservationSetV1[];
  try {
    assertClosedObject(input, "verified market input", [
      "schemaVersion",
      "source",
      "evidenceRoots",
      "factObservations",
    ]);
    if (
      input.schemaVersion !== "cork.verified-market-reconstruction-input/v1"
    ) {
      throw new TypeError("verified market input schema is not supported");
    }
    source = validateSelectedSource(input.source);
    assertClosedObject(input.evidenceRoots, "evidenceRoots", [
      "deployment",
      "policy",
    ]);
    if (!Array.isArray(input.factObservations)) {
      throw new TypeError("factObservations must be an array");
    }
    factSets = input.factObservations.map((factSet, index) => {
      assertClosedObject(factSet, `factObservations[${index}]`, [
        "field",
        "observations",
      ]);
      if (
        typeof factSet.field !== "string" ||
        !VERIFIED_MARKET_FACT_FIELDS.includes(
          factSet.field as VerifiedMarketFactFieldV1,
        )
      ) {
        throw new TypeError(`factObservations[${index}].field is unsupported`);
      }
      if (!Array.isArray(factSet.observations)) {
        throw new TypeError(
          `factObservations[${index}].observations must be an array`,
        );
      }
      return {
        field: factSet.field as VerifiedMarketFactFieldV1,
        observations: factSet.observations,
      };
    });
    const fields = new Set(factSets.map((factSet) => factSet.field));
    if (
      fields.size !== VERIFIED_MARKET_FACT_FIELDS.length ||
      VERIFIED_MARKET_FACT_FIELDS.some((field) => !fields.has(field))
    ) {
      throw new TypeError("fact observations must cover every field exactly");
    }
  } catch (error) {
    return conflict("INPUT_INVALID", [
      error instanceof Error ? error.message : "invalid input",
    ]);
  }

  let deployment: GenerationEvidenceV1;
  try {
    const roots = verifyGenerationEvidenceRoots(input.evidenceRoots, verifier);
    deployment = roots.deployment;
    if (
      !activeDeploymentEvidence(deployment) ||
      roots.policy.payload.status !== "active"
    ) {
      return conflict("EVIDENCE_INACTIVE", [
        "deployment and signing-policy generations must both be active",
      ]);
    }
  } catch (error) {
    return conflict("EVIDENCE_INVALID", [
      error instanceof Error ? error.message : "invalid evidence",
    ]);
  }

  const facts = new Map<VerifiedMarketFactFieldV1, JsonValue>();
  let referenceBinding: QuorumBindingV1 | undefined;
  for (const factSet of factSets) {
    const quorum = establishPureQuorum(factSet.observations);
    if (quorum.outcome !== "authoritative") {
      return conflict("QUORUM_FAILED", [`${factSet.field}:${quorum.code}`]);
    }
    if (
      referenceBinding !== undefined &&
      !sameBlock(referenceBinding, quorum.binding)
    ) {
      return conflict("SAME_BLOCK_REQUIRED", [factSet.field]);
    }
    referenceBinding ??= quorum.binding;
    facts.set(factSet.field, quorum.value);
  }
  if (referenceBinding === undefined) {
    return conflict("QUORUM_FAILED", ["no fact observations"]);
  }

  let reconstructed: {
    readonly chainId: string;
    readonly market: MarketTupleV1;
  };
  let deploymentFacts: MarketDeploymentFactsV1;
  try {
    reconstructed = reconstructedMarket(facts);
    deploymentFacts = reconstructDeploymentFacts(facts);
  } catch (error) {
    return conflict("QUORUM_FAILED", [
      error instanceof Error ? error.message : "invalid quorum values",
    ]);
  }
  if (
    reconstructed.chainId !== source.chainId ||
    canonicalizeJson(reconstructed.market as unknown as JsonValue) !==
      canonicalizeJson(source.market as unknown as JsonValue)
  ) {
    return conflict("SOURCE_CONFLICT", [
      "selected source tuple differs from same-block chain observations",
    ]);
  }

  const manifest = deployment.payload.manifest;
  if (manifest === undefined) {
    return conflict("DEPLOYMENT_CLAIM_MISSING", [
      "active deployment evidence lacks a typed manifest",
    ]);
  }
  let manifestPool: DeploymentPoolBindingV1;
  try {
    manifestPool = findDeploymentPool(
      manifest,
      source.source.selectedItemIdentity,
    );
  } catch (error) {
    return conflict("DEPLOYMENT_CLAIM_MISSING", [
      error instanceof Error ? error.message : "manifest pool is absent",
    ]);
  }
  const manifestProjection = {
    chainId: manifest.chainId,
    market: {
      poolId: manifestPool.poolId,
      collateralAsset: manifestPool.collateralAsset,
      referenceAsset: manifestPool.referenceAsset,
      expiryTimestamp: manifestPool.expiryTimestamp,
      rateMin: manifestPool.rateMin,
      rateMax: manifestPool.rateMax,
      rateChangePerDayMax: manifestPool.rateChangePerDayMax,
      rateChangeCapacityMax: manifestPool.rateChangeCapacityMax,
      rateOracle: manifestPool.rateOracle,
    },
    deploymentFacts: {
      poolManager: manifestPool.poolManager,
      cptAddress: manifestPool.cptAddress,
      cstAddress: manifestPool.cstAddress,
      limitOrderProtocolAddress: manifestPool.limitOrderProtocolAddress,
      runtimeCodeHash: manifestPool.runtimeCodeHash,
      proxyIdentityDigest: manifestPool.proxyIdentityDigest,
      criticalGettersDigest: manifestPool.criticalGettersDigest,
      cachedCollateralDecimals: manifestPool.cachedCollateralDecimals,
      issuanceState: manifestPool.issuanceState,
      pauseState: manifestPool.pauseState,
      whitelistState: manifestPool.whitelistState,
    },
  };
  if (
    canonicalizeJson(manifestProjection as unknown as JsonValue) !==
    canonicalizeJson({
      chainId: reconstructed.chainId,
      market: reconstructed.market as unknown as JsonValue,
      deploymentFacts: deploymentFacts as unknown as JsonValue,
    })
  ) {
    return conflict("DEPLOYMENT_CLAIM_MISSING", [
      "typed manifest does not bind reconstructed market facts",
    ]);
  }

  const consistencyChecks = VERIFIED_MARKET_FACT_FIELDS.map((field) => ({
    field,
    consistent: true as const,
  }));
  const withoutDigest: Omit<VerifiedMarketSuccessV1, "verifiedMarketDigest"> = {
    schemaVersion: "cork.verified-market/v1",
    outcome: "verified",
    chainId: reconstructed.chainId,
    deploymentId: deployment.identity.generationId,
    manifestGeneration: deployment.identity.generation,
    manifestDigest: manifest.manifestDigest,
    sourcePayloadDigest: source.source.sourceItemDigest,
    selectedSourceItemIdentity: source.source.selectedItemIdentity,
    selectedSourceItemDigest: source.source.sourceItemDigest,
    observation: referenceBinding,
    market: reconstructed.market,
    deploymentFacts,
    consistencyChecks,
  };
  return deepFreeze({
    ...withoutDigest,
    verifiedMarketDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as VerifiedMarketSuccessV1;
}

export function reconstructVerifiedMarketUniverse(
  input: VerifiedMarketUniverseInputV1,
  verifier: BrowserSignatureVerifierV1,
): VerifiedMarketUniverseV1 {
  assertClosedObject(input, "verified market universe input", [
    "schemaVersion",
    "enumerationComplete",
    "candidates",
  ]);
  if (
    input.schemaVersion !== "cork.verified-market-universe-input/v1" ||
    typeof input.enumerationComplete !== "boolean" ||
    !Array.isArray(input.candidates)
  ) {
    throw new TypeError("verified market universe input is invalid");
  }
  const reasons: string[] = [];
  const verifiedMarketDigests: Sha256Digest[] = [];
  if (!input.enumerationComplete) {
    reasons.push("source enumeration is incomplete");
  }
  input.candidates.forEach((candidate, index) => {
    assertClosedObject(candidate, `candidates[${index}]`, [
      "material",
      "reconstruction",
    ]);
    if (typeof candidate.material !== "boolean") {
      throw new TypeError(`candidates[${index}].material must be boolean`);
    }
    const result = reconstructVerifiedMarket(
      candidate.reconstruction as VerifiedMarketReconstructionInputV1,
      verifier,
    );
    if (result.outcome === "verified") {
      verifiedMarketDigests.push(result.verifiedMarketDigest);
    } else if (candidate.material) {
      reasons.push(`material candidate ${index} is unverified:${result.code}`);
    }
  });
  if (reasons.length > 0) {
    const projection = {
      schemaVersion: "cork.verified-market-universe/v1" as const,
      outcome: "incomplete" as const,
      reasons,
    };
    return deepFreeze({
      ...projection,
      universeDigest: sha256CanonicalJson(projection as unknown as JsonValue),
    }) as VerifiedMarketUniverseV1;
  }
  const projection = {
    schemaVersion: "cork.verified-market-universe/v1" as const,
    outcome: "complete" as const,
    verifiedMarketDigests,
  };
  return deepFreeze({
    ...projection,
    universeDigest: sha256CanonicalJson(projection as unknown as JsonValue),
  }) as VerifiedMarketUniverseV1;
}
