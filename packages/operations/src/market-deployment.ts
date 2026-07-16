import {
  assertClosedObject,
  assertKeccak256Digest,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  keccak256Bytes,
  keccak256Digest,
  sha256Bytes,
  sha256CanonicalJson,
  type JsonValue,
  type Keccak256Digest,
  type Sha256Digest,
} from "./kernel.js";
import { establishPureQuorum } from "./quorum.js";

export const MARKET_REGISTRY_SOURCE_COMMIT =
  "d2f0352bd2eaca64f65b2cb401dcf9d343e0190b" as const;

export const MARKET_DEPLOYMENT_FACTS = [
  "lookupWrapper",
  "wrapperFactory",
  "marketRegistryRuntime",
  "wrapperFactoryRuntime",
  "wrapperRuntime",
  "factoryRelationship",
  "collateralRegistered",
  "referenceRegistered",
  "collateralDecimals",
  "referenceDecimals",
  "collateralQuoteUnit",
  "referenceQuoteUnit",
  "conversionFeeds",
  "expectedWrapper",
  "rateOracleFactory",
  "rateOracleRuntime",
] as const;

export type MarketDeploymentFactV1 = (typeof MARKET_DEPLOYMENT_FACTS)[number];

export interface MergedRFC007ReleaseV1 {
  readonly schemaVersion: "cork.merged-rfc007-release/v1";
  readonly status: "merged-immutable";
  readonly revision: string;
  readonly releaseIdentity: string;
  readonly underwritingService: {
    readonly sourceCommit: string;
    readonly packageVersion: string;
  };
  readonly marketPipeline: {
    readonly sourceCommit: string;
    readonly packageVersion: string;
  };
  readonly marketRegistry: {
    readonly sourceCommit: typeof MARKET_REGISTRY_SOURCE_COMMIT;
    readonly packageVersion: string;
  };
  readonly recipePackage: {
    readonly identity: string;
    readonly version: string;
    readonly digest: Sha256Digest;
  };
  readonly schemaDigests: {
    readonly handoff: Sha256Digest;
    readonly resolvedArtifact: Sha256Digest;
    readonly verdict: Sha256Digest;
    readonly build: Sha256Digest;
    readonly staging: Sha256Digest;
    readonly unsignedSafeProposal: Sha256Digest;
    readonly attestation: Sha256Digest;
  };
  readonly releaseDigest: Sha256Digest;
}

export interface ReleasedProducerArtifactV1 {
  readonly schemaVersion: string;
  readonly producerIdentity: string;
  readonly bytes: string;
  readonly byteDigest: Sha256Digest;
  readonly contentDigest: Sha256Digest;
}

export type RFC007ArtifactNameV1 =
  | "handoff"
  | "resolvedArtifact"
  | "verdict"
  | "build"
  | "staging"
  | "unsignedSafeProposal"
  | "attestation";

export interface RFC007SchemaDocumentV1 {
  readonly artifactName: RFC007ArtifactNameV1;
  readonly encoding: "canonical-json-utf8";
  readonly producerIdentity: string;
  readonly releaseIdentity: string;
  readonly schema: JsonValue;
  readonly schemaDigest: Sha256Digest;
}

export interface RFC007SchemaBundleV1 {
  readonly schemaVersion: "cork.rfc007-schema-bundle/v1";
  readonly revision: string;
  readonly releaseIdentity: string;
  readonly documents: readonly RFC007SchemaDocumentV1[];
  readonly bundleDigest: Sha256Digest;
}

export interface RFC007SchemaValidationInputV1 {
  readonly artifactName: RFC007ArtifactNameV1;
  readonly schema: JsonValue;
  readonly document: JsonValue;
}

export interface RFC007SchemaValidatorV1 {
  validate(input: RFC007SchemaValidationInputV1): boolean;
}

export interface MarketBuildPackageV1 {
  readonly marketRegistry: string;
  readonly collateralAsset: string;
  readonly referenceAsset: string;
  readonly wrapperFactory: string;
  readonly expectedWrapper: string;
  readonly registryDeployCalldata: string;
  readonly registryDeployCalldataHash: Keccak256Digest;
  readonly poolCreationSender: string;
  readonly poolCreationTarget: string;
  readonly poolCreationCalldata: string;
  readonly poolCreationCalldataHash: Keccak256Digest;
  readonly orderedCallsDigest: Sha256Digest;
}

export interface MarketDeploymentInputV1 {
  readonly schemaVersion: "cork.market-deployment/v1";
  readonly clientRequestId: string;
  readonly chainId: string;
  readonly automationRelease: MergedRFC007ReleaseV1;
  readonly schemaBundle: RFC007SchemaBundleV1;
  readonly handoff: ReleasedProducerArtifactV1;
  readonly resolvedArtifact: ReleasedProducerArtifactV1;
  readonly verdict: ReleasedProducerArtifactV1;
  readonly buildArtifact: ReleasedProducerArtifactV1;
  readonly buildPackage: MarketBuildPackageV1;
  readonly stagingEvidence: ReleasedProducerArtifactV1;
  readonly unsignedSafeProposal: ReleasedProducerArtifactV1;
  readonly attestation: ReleasedProducerArtifactV1;
}

export interface MarketDeploymentQuoteInputV1 {
  readonly schemaVersion: "cork.market-deployment-quote-input/v1";
  readonly clientRequestId: string;
  readonly chainId: string;
  readonly automationRelease: MergedRFC007ReleaseV1;
  readonly schemaBundle: RFC007SchemaBundleV1;
  readonly handoff: ReleasedProducerArtifactV1;
}

export type MarketQuoteResultV1 =
  | {
      readonly schemaVersion: "cork.market-deployment-quote/v1";
      readonly outcome: "invalid";
      readonly code: "INPUT_INVALID";
      readonly issues: readonly string[];
      readonly quoteDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.market-deployment-quote/v1";
      readonly outcome: "quoted";
      readonly clientRequestId: string;
      readonly chainId: string;
      readonly release: MergedRFC007ReleaseV1;
      readonly schemaBundleDigest: Sha256Digest;
      readonly handoff: ReleasedProducerArtifactV1;
      readonly quoteDigest: Sha256Digest;
    };

export interface MarketDeploymentFactObservationSetV1 {
  readonly field: MarketDeploymentFactV1;
  readonly observations: readonly unknown[];
}

export interface MarketDeploymentPairV1 {
  readonly chainId: string;
  readonly collateralAsset: string;
  readonly referenceAsset: string;
}

export interface MarketDeploymentBlockBindingV1 {
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly parentBlockHash: string;
}

export interface MarketDeploymentTransactionV1 {
  readonly sender: string;
  readonly target: string;
  readonly value: "0";
  readonly data: string;
  readonly dataDigest: Keccak256Digest;
}

export type PreparedMarketDeploymentV1 =
  | {
      readonly schemaVersion: "cork.prepared-market-deployment/v1";
      readonly outcome: "conflict";
      readonly code: string;
      readonly conflicts: readonly string[];
      readonly preparedDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.prepared-market-deployment/v1";
      readonly outcome: "existing-wrapper";
      readonly quoteDigest: Sha256Digest;
      readonly release: MergedRFC007ReleaseV1;
      readonly buildPackage: MarketBuildPackageV1;
      readonly pair: MarketDeploymentPairV1;
      readonly producerArtifactDigests: readonly Sha256Digest[];
      readonly quorumDigest: Sha256Digest;
      readonly quorumBinding: MarketDeploymentBlockBindingV1;
      readonly wrapper: string;
      readonly transactions: readonly [];
      readonly poolExecutionProven: false;
      readonly preparedDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.prepared-market-deployment/v1";
      readonly outcome: "fresh-deployment";
      readonly quoteDigest: Sha256Digest;
      readonly release: MergedRFC007ReleaseV1;
      readonly buildPackage: MarketBuildPackageV1;
      readonly pair: MarketDeploymentPairV1;
      readonly producerArtifactDigests: readonly Sha256Digest[];
      readonly quorumDigest: Sha256Digest;
      readonly quorumBinding: MarketDeploymentBlockBindingV1;
      readonly transactions: readonly [
        MarketDeploymentTransactionV1,
        MarketDeploymentTransactionV1,
      ];
      readonly preparedDigest: Sha256Digest;
    };

export interface MarketDeploymentSimulationCallV1 {
  readonly transactionIndex: number;
  readonly target: string;
  readonly dataDigest: Keccak256Digest;
  readonly status: "success" | "revert" | "unavailable";
  readonly reasonCode: string;
}

export interface MarketDeploymentSimulationV1 {
  readonly schemaVersion: "cork.market-deployment-simulation/v1";
  readonly preparedDigest: Sha256Digest;
  readonly quoteDigest: Sha256Digest;
  readonly releaseDigest: Sha256Digest;
  readonly quorumDigest: Sha256Digest;
  readonly orderedCallsDigest: Sha256Digest;
  readonly calls: readonly MarketDeploymentSimulationCallV1[];
  readonly status: "success" | "revert" | "unavailable";
  readonly simulatedAt: string;
  readonly deploymentProven: false;
  readonly simulationDigest: Sha256Digest;
}

export type MarketDeploymentReconciliationStatusV1 =
  | "verified-existing-wrapper"
  | "fresh-two-step-success"
  | "repeat-registry-no-event"
  | "uncertain-registry-outcome"
  | "registry-only-partial"
  | "pool-evidence-mismatch"
  | "conflict";

export type MarketDeploymentReceiptEventV1 =
  | {
      readonly kind: "wrapper-deployed";
      readonly emitter: string;
      readonly collateralAsset: string;
      readonly referenceAsset: string;
      readonly wrapperFactory: string;
      readonly wrapper: string;
    }
  | {
      readonly kind: "pool-created";
      readonly emitter: string;
      readonly collateralAsset: string;
      readonly referenceAsset: string;
      readonly wrapper: string;
    };

export interface MarketDeploymentReceiptV1 {
  readonly transactionIndex: number;
  readonly transactionHash: Keccak256Digest;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly parentBlockHash: string;
  readonly final: boolean;
  readonly status: "success" | "revert";
  readonly sender: string;
  readonly target: string;
  readonly value: "0";
  readonly data: string;
  readonly dataDigest: Keccak256Digest;
  readonly events: readonly MarketDeploymentReceiptEventV1[];
}

export type MarketDeploymentReconciliationV1 =
  | {
      readonly schemaVersion: "cork.market-deployment-reconciliation/v1";
      readonly status: "conflict" | "pool-evidence-mismatch";
      readonly conflicts: readonly string[];
      readonly reconciliationDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.market-deployment-reconciliation/v1";
      readonly status: Exclude<
        MarketDeploymentReconciliationStatusV1,
        "conflict" | "pool-evidence-mismatch"
      >;
      readonly preparedDigest: Sha256Digest;
      readonly quoteDigest: Sha256Digest;
      readonly releaseDigest: Sha256Digest;
      readonly producerArtifactDigests: readonly Sha256Digest[];
      readonly finalQuorumDigest: Sha256Digest;
      readonly finalBinding: MarketDeploymentBlockBindingV1;
      readonly wrapper: string;
      readonly verifiedReceiptDigests: readonly Sha256Digest[];
      readonly remainingTransactions: readonly MarketDeploymentTransactionV1[];
      readonly wrapperDeploymentProven: boolean;
      readonly poolExecutionProven: boolean;
      readonly reconciliationDigest: Sha256Digest;
    };

export interface MarketDeploymentReconciliationInputV1 {
  readonly prepared: Exclude<
    PreparedMarketDeploymentV1,
    { readonly outcome: "conflict" }
  >;
  readonly quote: Extract<MarketQuoteResultV1, { readonly outcome: "quoted" }>;
  readonly deployment: MarketDeploymentInputV1;
  readonly preparationFacts: readonly MarketDeploymentFactObservationSetV1[];
  readonly finalFacts: readonly MarketDeploymentFactObservationSetV1[];
  readonly receipts: readonly MarketDeploymentReceiptV1[];
}

const ADDRESS = /^0x[0-9a-f]{40}$/u;
const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
const SOURCE = /^[0-9a-f]{40}$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const ZERO = `0x${"00".repeat(20)}`;

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be non-empty`);
  }
}

function address(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    throw new TypeError(`${label} must be a lowercase address`);
  }
}

function bytes(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !BYTES.test(value)) {
    throw new TypeError(`${label} must be lowercase bytes`);
  }
}

function hex(value: string): Uint8Array {
  const raw = value.slice(2);
  const output = new Uint8Array(raw.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function hexString(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function shaBytes(value: string): Sha256Digest {
  return `sha256:${hexString(sha256Bytes(hex(value)))}`;
}

function validateRelease(value: unknown): MergedRFC007ReleaseV1 {
  assertClosedObject(value, "merged release", [
    "schemaVersion",
    "status",
    "revision",
    "releaseIdentity",
    "underwritingService",
    "marketPipeline",
    "marketRegistry",
    "recipePackage",
    "schemaDigests",
    "releaseDigest",
  ]);
  if (
    value.schemaVersion !== "cork.merged-rfc007-release/v1" ||
    value.status !== "merged-immutable"
  ) {
    throw new TypeError("RFC 007 release must be merged and immutable");
  }
  nonEmpty(value.revision, "revision");
  nonEmpty(value.releaseIdentity, "releaseIdentity");
  for (const [label, producer] of [
    ["underwritingService", value.underwritingService],
    ["marketPipeline", value.marketPipeline],
    ["marketRegistry", value.marketRegistry],
  ] as const) {
    assertClosedObject(producer, label, ["sourceCommit", "packageVersion"]);
    if (
      typeof producer.sourceCommit !== "string" ||
      !SOURCE.test(producer.sourceCommit)
    ) {
      throw new TypeError(`${label}.sourceCommit is not immutable`);
    }
    nonEmpty(producer.packageVersion, `${label}.packageVersion`);
  }
  const marketRegistry = value.marketRegistry as Record<string, unknown>;
  if (marketRegistry["sourceCommit"] !== MARKET_REGISTRY_SOURCE_COMMIT) {
    throw new TypeError("Market Registry source identity drifted");
  }
  assertClosedObject(value.recipePackage, "recipePackage", [
    "identity",
    "version",
    "digest",
  ]);
  nonEmpty(value.recipePackage.identity, "recipePackage.identity");
  nonEmpty(value.recipePackage.version, "recipePackage.version");
  assertSha256Digest(value.recipePackage.digest, "recipePackage.digest");
  assertClosedObject(value.schemaDigests, "schemaDigests", [
    "handoff",
    "resolvedArtifact",
    "verdict",
    "build",
    "staging",
    "unsignedSafeProposal",
    "attestation",
  ]);
  for (const [name, digest] of Object.entries(value.schemaDigests)) {
    assertSha256Digest(digest, `schemaDigests.${name}`);
  }
  assertSha256Digest(value.releaseDigest, "releaseDigest");
  const without = { ...value } as Record<string, unknown>;
  delete without.releaseDigest;
  if (sha256CanonicalJson(without as JsonValue) !== value.releaseDigest) {
    throw new TypeError("merged release digest does not match");
  }
  return value as unknown as MergedRFC007ReleaseV1;
}

export function createMergedRFC007Release(
  input: Omit<MergedRFC007ReleaseV1, "releaseDigest">,
): MergedRFC007ReleaseV1 {
  return validateRelease({
    ...input,
    releaseDigest: sha256CanonicalJson(input as unknown as JsonValue),
  });
}

const RFC007_ARTIFACT_NAMES: readonly RFC007ArtifactNameV1[] = [
  "attestation",
  "build",
  "handoff",
  "resolvedArtifact",
  "staging",
  "unsignedSafeProposal",
  "verdict",
];

function validateSchemaBundle(
  value: unknown,
  release: MergedRFC007ReleaseV1,
): RFC007SchemaBundleV1 {
  assertClosedObject(value, "RFC 007 schema bundle", [
    "schemaVersion",
    "revision",
    "releaseIdentity",
    "documents",
    "bundleDigest",
  ]);
  if (
    value.schemaVersion !== "cork.rfc007-schema-bundle/v1" ||
    value.revision !== release.revision ||
    value.releaseIdentity !== release.releaseIdentity ||
    !Array.isArray(value.documents)
  ) {
    throw new TypeError("RFC 007 schema bundle identity is invalid");
  }
  const documents = value.documents.map((document, index) => {
    assertClosedObject(document, `schemaBundle.documents[${index}]`, [
      "artifactName",
      "encoding",
      "producerIdentity",
      "releaseIdentity",
      "schema",
      "schemaDigest",
    ]);
    if (
      typeof document.artifactName !== "string" ||
      !RFC007_ARTIFACT_NAMES.includes(
        document.artifactName as RFC007ArtifactNameV1,
      ) ||
      document.encoding !== "canonical-json-utf8" ||
      document.releaseIdentity !== release.releaseIdentity
    ) {
      throw new TypeError("RFC 007 schema document identity is invalid");
    }
    nonEmpty(document.producerIdentity, "schema producerIdentity");
    canonicalizeJson(document.schema as JsonValue);
    assertSha256Digest(document.schemaDigest, "schema document digest");
    const schemaDigest = sha256CanonicalJson({
      artifactName: document.artifactName,
      encoding: document.encoding,
      producerIdentity: document.producerIdentity,
      releaseIdentity: document.releaseIdentity,
      schema: document.schema as JsonValue,
    });
    if (
      schemaDigest !== document.schemaDigest ||
      release.schemaDigests[document.artifactName as RFC007ArtifactNameV1] !==
        schemaDigest
    ) {
      throw new TypeError("RFC 007 schema document digest is not released");
    }
    return JSON.parse(
      canonicalizeJson(document as JsonValue),
    ) as RFC007SchemaDocumentV1;
  });
  if (
    documents.length !== RFC007_ARTIFACT_NAMES.length ||
    documents.some(
      (document, index) =>
        document.artifactName !== RFC007_ARTIFACT_NAMES[index],
    )
  ) {
    throw new TypeError(
      "RFC 007 schema documents must be complete and ordered",
    );
  }
  assertSha256Digest(value.bundleDigest, "schema bundle digest");
  const withoutDigest = { ...value } as Record<string, unknown>;
  delete withoutDigest["bundleDigest"];
  if (sha256CanonicalJson(withoutDigest as JsonValue) !== value.bundleDigest) {
    throw new TypeError("RFC 007 schema bundle digest does not match");
  }
  return deepFreeze({
    schemaVersion: "cork.rfc007-schema-bundle/v1",
    revision: release.revision,
    releaseIdentity: release.releaseIdentity,
    documents,
    bundleDigest: value.bundleDigest,
  });
}

function validateArtifact(
  value: unknown,
  document: RFC007SchemaDocumentV1,
  validator: RFC007SchemaValidatorV1,
): {
  readonly artifact: ReleasedProducerArtifactV1;
  readonly decoded: JsonValue;
} {
  const label = document.artifactName;
  assertClosedObject(value, label, [
    "schemaVersion",
    "producerIdentity",
    "bytes",
    "byteDigest",
    "contentDigest",
  ]);
  nonEmpty(value.schemaVersion, `${label}.schemaVersion`);
  nonEmpty(value.producerIdentity, `${label}.producerIdentity`);
  bytes(value.bytes, `${label}.bytes`);
  assertSha256Digest(value.byteDigest, `${label}.byteDigest`);
  assertSha256Digest(value.contentDigest, `${label}.contentDigest`);
  if (
    shaBytes(value.bytes) !== value.byteDigest ||
    value.contentDigest !== document.schemaDigest ||
    value.producerIdentity !== document.producerIdentity
  ) {
    throw new TypeError(`${label} bytes or released schema digest mismatch`);
  }
  let decoded: JsonValue;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(hex(value.bytes)),
    ) as JsonValue;
    canonicalizeJson(decoded);
  } catch {
    throw new TypeError(`${label} bytes do not decode as JSON`);
  }
  if (
    decoded === null ||
    typeof decoded !== "object" ||
    Array.isArray(decoded) ||
    validator.validate({
      artifactName: document.artifactName,
      schema: document.schema,
      document: decoded,
    }) !== true
  ) {
    throw new TypeError(`${label} bytes fail the released schema`);
  }
  return {
    artifact: {
      schemaVersion: value.schemaVersion,
      producerIdentity: value.producerIdentity,
      bytes: value.bytes,
      byteDigest: value.byteDigest,
      contentDigest: value.contentDigest,
    },
    decoded,
  };
}

function deployCalldata(ca: string, ref: string): string {
  const selector = keccak256Bytes(
    new TextEncoder().encode("deploy(address,address)"),
  ).slice(0, 4);
  const encode = (value: string) => `${"0".repeat(24)}${value.slice(2)}`;
  return `0x${hexString(selector)}${encode(ca)}${encode(ref)}`;
}

function validateBuild(value: unknown): MarketBuildPackageV1 {
  assertClosedObject(value, "buildPackage", [
    "marketRegistry",
    "collateralAsset",
    "referenceAsset",
    "wrapperFactory",
    "expectedWrapper",
    "registryDeployCalldata",
    "registryDeployCalldataHash",
    "poolCreationSender",
    "poolCreationTarget",
    "poolCreationCalldata",
    "poolCreationCalldataHash",
    "orderedCallsDigest",
  ]);
  for (const [label, field] of [
    ["marketRegistry", value.marketRegistry],
    ["collateralAsset", value.collateralAsset],
    ["referenceAsset", value.referenceAsset],
    ["wrapperFactory", value.wrapperFactory],
    ["expectedWrapper", value.expectedWrapper],
    ["poolCreationSender", value.poolCreationSender],
    ["poolCreationTarget", value.poolCreationTarget],
  ] as const)
    address(field, label);
  const marketRegistry = value.marketRegistry as string;
  const collateralAsset = value.collateralAsset as string;
  const referenceAsset = value.referenceAsset as string;
  const poolCreationSender = value.poolCreationSender as string;
  const poolCreationTarget = value.poolCreationTarget as string;
  bytes(value.registryDeployCalldata, "registryDeployCalldata");
  bytes(value.poolCreationCalldata, "poolCreationCalldata");
  assertKeccak256Digest(value.registryDeployCalldataHash, "registry hash");
  assertKeccak256Digest(value.poolCreationCalldataHash, "pool hash");
  assertSha256Digest(value.orderedCallsDigest, "orderedCallsDigest");
  if (
    value.registryDeployCalldata !==
      deployCalldata(collateralAsset, referenceAsset) ||
    keccak256Digest(hex(value.registryDeployCalldata)) !==
      value.registryDeployCalldataHash ||
    keccak256Digest(hex(value.poolCreationCalldata)) !==
      value.poolCreationCalldataHash
  ) {
    throw new TypeError("released Build bytes do not reconstruct");
  }
  const ordered = sha256CanonicalJson([
    {
      sender: ZERO,
      target: marketRegistry,
      value: "0",
      dataDigest: value.registryDeployCalldataHash,
    },
    {
      sender: poolCreationSender,
      target: poolCreationTarget,
      value: "0",
      dataDigest: value.poolCreationCalldataHash,
    },
  ]);
  if (ordered !== value.orderedCallsDigest) {
    throw new TypeError("ordered call digest does not match");
  }
  return value as unknown as MarketBuildPackageV1;
}

class MarketPreparationConflict extends Error {
  readonly code: string;
  readonly conflicts: readonly string[];

  constructor(code: string, conflicts: readonly string[]) {
    super(code);
    this.code = code;
    this.conflicts = conflicts;
  }
}

interface ValidatedMarketDeploymentV1 {
  readonly release: MergedRFC007ReleaseV1;
  readonly bundle: RFC007SchemaBundleV1;
  readonly artifacts: readonly {
    readonly artifact: ReleasedProducerArtifactV1;
    readonly decoded: JsonValue;
  }[];
  readonly build: MarketBuildPackageV1;
}

interface ResolvedMarketDeploymentFactsV1 {
  readonly values: ReadonlyMap<MarketDeploymentFactV1, JsonValue>;
  readonly quorumDigest: Sha256Digest;
  readonly binding: MarketDeploymentBlockBindingV1;
}

function validateSchemaValidator(
  value: unknown,
): asserts value is RFC007SchemaValidatorV1 {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as RFC007SchemaValidatorV1).validate !== "function"
  ) {
    throw new TypeError("an injected RFC 007 schema validator is required");
  }
}

function documentFor(
  bundle: RFC007SchemaBundleV1,
  name: RFC007ArtifactNameV1,
): RFC007SchemaDocumentV1 {
  const match = bundle.documents.find(
    (candidate) => candidate.artifactName === name,
  );
  if (match === undefined) throw new TypeError(`schema ${name} is absent`);
  return match;
}

function validateMarketDeployment(
  value: unknown,
  schemaValidator: RFC007SchemaValidatorV1,
): ValidatedMarketDeploymentV1 {
  validateSchemaValidator(schemaValidator);
  assertClosedObject(value, "market deployment", [
    "schemaVersion",
    "clientRequestId",
    "chainId",
    "automationRelease",
    "schemaBundle",
    "handoff",
    "resolvedArtifact",
    "verdict",
    "buildArtifact",
    "buildPackage",
    "stagingEvidence",
    "unsignedSafeProposal",
    "attestation",
  ]);
  if (value.schemaVersion !== "cork.market-deployment/v1") {
    throw new TypeError("market deployment schema is not supported");
  }
  nonEmpty(value.clientRequestId, "clientRequestId");
  assertUint256Decimal(value.chainId, "chainId");
  const release = validateRelease(value.automationRelease);
  const bundle = validateSchemaBundle(value.schemaBundle, release);
  const artifacts = [
    validateArtifact(
      value.handoff,
      documentFor(bundle, "handoff"),
      schemaValidator,
    ),
    validateArtifact(
      value.resolvedArtifact,
      documentFor(bundle, "resolvedArtifact"),
      schemaValidator,
    ),
    validateArtifact(
      value.verdict,
      documentFor(bundle, "verdict"),
      schemaValidator,
    ),
    validateArtifact(
      value.buildArtifact,
      documentFor(bundle, "build"),
      schemaValidator,
    ),
    validateArtifact(
      value.stagingEvidence,
      documentFor(bundle, "staging"),
      schemaValidator,
    ),
    validateArtifact(
      value.unsignedSafeProposal,
      documentFor(bundle, "unsignedSafeProposal"),
      schemaValidator,
    ),
    validateArtifact(
      value.attestation,
      documentFor(bundle, "attestation"),
      schemaValidator,
    ),
  ];
  const build = validateBuild(value.buildPackage);
  if (
    canonicalizeJson(artifacts[3]!.decoded) !==
    canonicalizeJson(build as unknown as JsonValue)
  ) {
    throw new TypeError("released Build artifact does not bind calldata");
  }
  return { release, bundle, artifacts, build };
}

function quoteBase(input: MarketDeploymentQuoteInputV1): {
  readonly schemaVersion: "cork.market-deployment-quote/v1";
  readonly outcome: "quoted";
  readonly clientRequestId: string;
  readonly chainId: string;
  readonly release: MergedRFC007ReleaseV1;
  readonly schemaBundleDigest: Sha256Digest;
  readonly handoff: ReleasedProducerArtifactV1;
} {
  return {
    schemaVersion: "cork.market-deployment-quote/v1",
    outcome: "quoted",
    clientRequestId: input.clientRequestId,
    chainId: input.chainId,
    release: input.automationRelease,
    schemaBundleDigest: input.schemaBundle.bundleDigest,
    handoff: input.handoff,
  };
}

export function quoteMarketDeployment(
  input: MarketDeploymentQuoteInputV1,
  schemaValidator: RFC007SchemaValidatorV1,
): MarketQuoteResultV1 {
  try {
    validateSchemaValidator(schemaValidator);
    assertClosedObject(input, "market deployment quote input", [
      "schemaVersion",
      "clientRequestId",
      "chainId",
      "automationRelease",
      "schemaBundle",
      "handoff",
    ]);
    if (input.schemaVersion !== "cork.market-deployment-quote-input/v1") {
      throw new TypeError("market deployment quote schema is not supported");
    }
    nonEmpty(input.clientRequestId, "clientRequestId");
    assertUint256Decimal(input.chainId, "chainId");
    const release = validateRelease(input.automationRelease);
    const bundle = validateSchemaBundle(input.schemaBundle, release);
    const handoff = validateArtifact(
      input.handoff,
      documentFor(bundle, "handoff"),
      schemaValidator,
    ).artifact;
    const base = quoteBase({
      ...input,
      automationRelease: release,
      schemaBundle: bundle,
      handoff,
    });
    return deepFreeze({
      ...base,
      quoteDigest: sha256CanonicalJson(base as unknown as JsonValue),
    });
  } catch (error) {
    const base = {
      schemaVersion: "cork.market-deployment-quote/v1" as const,
      outcome: "invalid" as const,
      code: "INPUT_INVALID" as const,
      issues: [error instanceof Error ? error.message : "invalid"],
    };
    return deepFreeze({
      ...base,
      quoteDigest: sha256CanonicalJson(base as unknown as JsonValue),
    });
  }
}

function quoteInputFromDeployment(
  value: MarketDeploymentInputV1,
): MarketDeploymentQuoteInputV1 {
  return {
    schemaVersion: "cork.market-deployment-quote-input/v1",
    clientRequestId: value.clientRequestId,
    chainId: value.chainId,
    automationRelease: value.automationRelease,
    schemaBundle: value.schemaBundle,
    handoff: value.handoff,
  };
}

function assertQuoteBinding(
  quote: MarketQuoteResultV1,
  deployment: MarketDeploymentInputV1,
  schemaValidator: RFC007SchemaValidatorV1,
): asserts quote is Extract<
  MarketQuoteResultV1,
  { readonly outcome: "quoted" }
> {
  const reconstructed = quoteMarketDeployment(
    quoteInputFromDeployment(deployment),
    schemaValidator,
  );
  if (
    reconstructed.outcome !== "quoted" ||
    quote.outcome !== "quoted" ||
    canonicalizeJson(reconstructed as unknown as JsonValue) !==
      canonicalizeJson(quote as unknown as JsonValue)
  ) {
    throw new TypeError("quote does not bind the deployment handoff");
  }
}

function validateFactShapes(
  values: ReadonlyMap<MarketDeploymentFactV1, JsonValue>,
  build: MarketBuildPackageV1,
): void {
  for (const field of [
    "lookupWrapper",
    "wrapperFactory",
    "expectedWrapper",
    "rateOracleFactory",
  ] as const) {
    address(values.get(field), field);
  }
  for (const field of [
    "marketRegistryRuntime",
    "wrapperFactoryRuntime",
    "wrapperRuntime",
    "rateOracleRuntime",
  ] as const) {
    assertSha256Digest(values.get(field), field);
  }
  for (const field of ["collateralDecimals", "referenceDecimals"] as const) {
    assertUint256Decimal(values.get(field), field);
  }
  for (const field of ["collateralQuoteUnit", "referenceQuoteUnit"] as const) {
    if (typeof values.get(field) !== "string") {
      throw new TypeError(`${field} must be a string`);
    }
  }
  const feeds = values.get("conversionFeeds");
  if (!Array.isArray(feeds) || feeds.length !== 2) {
    throw new TypeError("conversionFeeds must preserve the ordered pair");
  }
  feeds.forEach((feed, index) => address(feed, `conversionFeeds[${index}]`));
  if (
    values.get("wrapperFactory") !== build.wrapperFactory ||
    values.get("expectedWrapper") !== build.expectedWrapper ||
    values.get("factoryRelationship") !== true ||
    values.get("collateralRegistered") !== true ||
    values.get("referenceRegistered") !== true
  ) {
    throw new MarketPreparationConflict("FACT_CONFLICT", [
      "registry/factory/assets",
    ]);
  }
}

function resolveMarketDeploymentFacts(
  facts: readonly MarketDeploymentFactObservationSetV1[],
  build: MarketBuildPackageV1,
): ResolvedMarketDeploymentFactsV1 {
  if (
    !Array.isArray(facts) ||
    facts.length !== MARKET_DEPLOYMENT_FACTS.length
  ) {
    throw new TypeError("all market facts are required");
  }
  const resolved = new Map<
    MarketDeploymentFactV1,
    {
      readonly value: JsonValue;
      readonly digest: Sha256Digest;
      readonly binding: MarketDeploymentBlockBindingV1;
    }
  >();
  for (const set of facts) {
    assertClosedObject(set, "fact set", ["field", "observations"]);
    if (
      typeof set.field !== "string" ||
      !MARKET_DEPLOYMENT_FACTS.includes(set.field as MarketDeploymentFactV1) ||
      !Array.isArray(set.observations)
    ) {
      throw new TypeError("unknown market deployment fact");
    }
    const field = set.field as MarketDeploymentFactV1;
    if (resolved.has(field)) {
      throw new TypeError(`duplicate market deployment fact ${field}`);
    }
    const quorum = establishPureQuorum(set.observations);
    if (quorum.outcome !== "authoritative") {
      throw new MarketPreparationConflict("QUORUM_FAILED", [field]);
    }
    resolved.set(field, {
      value: quorum.value,
      digest: quorum.quorumDigest,
      binding: {
        blockNumber: quorum.binding.blockNumber,
        blockHash: quorum.binding.blockHash,
        parentBlockHash: quorum.binding.parentBlockHash,
      },
    });
  }
  const first = resolved.get(MARKET_DEPLOYMENT_FACTS[0])!;
  for (const field of MARKET_DEPLOYMENT_FACTS) {
    const current = resolved.get(field);
    if (current === undefined) {
      throw new TypeError(`market deployment fact ${field} is absent`);
    }
    if (
      current.binding.blockNumber !== first.binding.blockNumber ||
      current.binding.blockHash !== first.binding.blockHash ||
      current.binding.parentBlockHash !== first.binding.parentBlockHash
    ) {
      throw new MarketPreparationConflict("SAME_BLOCK_REQUIRED", [field]);
    }
  }
  const values = new Map(
    MARKET_DEPLOYMENT_FACTS.map((field) => [field, resolved.get(field)!.value]),
  );
  validateFactShapes(values, build);
  return {
    values,
    binding: first.binding,
    quorumDigest: sha256CanonicalJson(
      MARKET_DEPLOYMENT_FACTS.map((field) => resolved.get(field)!.digest),
    ),
  };
}

function producerArtifactDigests(
  artifacts: ValidatedMarketDeploymentV1["artifacts"],
): readonly Sha256Digest[] {
  return artifacts.map(({ artifact }) => artifact.byteDigest);
}

function pair(
  chainId: string,
  build: MarketBuildPackageV1,
): MarketDeploymentPairV1 {
  return {
    chainId,
    collateralAsset: build.collateralAsset,
    referenceAsset: build.referenceAsset,
  };
}

function transactions(
  build: MarketBuildPackageV1,
): readonly [MarketDeploymentTransactionV1, MarketDeploymentTransactionV1] {
  return [
    {
      sender: ZERO,
      target: build.marketRegistry,
      value: "0",
      data: build.registryDeployCalldata,
      dataDigest: build.registryDeployCalldataHash,
    },
    {
      sender: build.poolCreationSender,
      target: build.poolCreationTarget,
      value: "0",
      data: build.poolCreationCalldata,
      dataDigest: build.poolCreationCalldataHash,
    },
  ];
}

function conflict(
  code: string,
  conflicts: readonly string[],
): PreparedMarketDeploymentV1 {
  const base = {
    schemaVersion: "cork.prepared-market-deployment/v1" as const,
    outcome: "conflict" as const,
    code,
    conflicts,
  };
  return deepFreeze({
    ...base,
    preparedDigest: sha256CanonicalJson(base as unknown as JsonValue),
  });
}

export function prepareMarketDeployment(
  input: {
    readonly quote: Extract<
      MarketQuoteResultV1,
      { readonly outcome: "quoted" }
    >;
    readonly deployment: MarketDeploymentInputV1;
    readonly facts: readonly MarketDeploymentFactObservationSetV1[];
  },
  schemaValidator: RFC007SchemaValidatorV1,
): PreparedMarketDeploymentV1 {
  try {
    assertClosedObject(input, "market preparation input", [
      "quote",
      "deployment",
      "facts",
    ]);
    const validated = validateMarketDeployment(
      input.deployment,
      schemaValidator,
    );
    assertQuoteBinding(input.quote, input.deployment, schemaValidator);
    const facts = resolveMarketDeploymentFacts(input.facts, validated.build);
    const common = {
      schemaVersion: "cork.prepared-market-deployment/v1" as const,
      quoteDigest: input.quote.quoteDigest,
      release: validated.release,
      buildPackage: validated.build,
      pair: pair(input.deployment.chainId, validated.build),
      producerArtifactDigests: producerArtifactDigests(validated.artifacts),
      quorumDigest: facts.quorumDigest,
      quorumBinding: facts.binding,
    };
    const lookup = facts.values.get("lookupWrapper");
    if (lookup === validated.build.expectedWrapper) {
      const base = {
        ...common,
        outcome: "existing-wrapper" as const,
        wrapper: validated.build.expectedWrapper,
        transactions: [] as const,
        poolExecutionProven: false as const,
      };
      return deepFreeze({
        ...base,
        preparedDigest: sha256CanonicalJson(base as unknown as JsonValue),
      });
    }
    if (lookup !== ZERO) {
      throw new MarketPreparationConflict("LOOKUP_CONFLICT", ["lookupWrapper"]);
    }
    const base = {
      ...common,
      outcome: "fresh-deployment" as const,
      transactions: transactions(validated.build),
    };
    return deepFreeze({
      ...base,
      preparedDigest: sha256CanonicalJson(base as unknown as JsonValue),
    });
  } catch (error) {
    if (error instanceof MarketPreparationConflict) {
      return conflict(error.code, error.conflicts);
    }
    return conflict("INPUT_INVALID", [
      error instanceof Error ? error.message : "invalid",
    ]);
  }
}

function validatePair(
  value: unknown,
  build: MarketBuildPackageV1,
): MarketDeploymentPairV1 {
  assertClosedObject(value, "market deployment pair", [
    "chainId",
    "collateralAsset",
    "referenceAsset",
  ]);
  assertUint256Decimal(value.chainId, "pair.chainId");
  address(value.collateralAsset, "pair.collateralAsset");
  address(value.referenceAsset, "pair.referenceAsset");
  if (
    value.collateralAsset !== build.collateralAsset ||
    value.referenceAsset !== build.referenceAsset
  ) {
    throw new TypeError("prepared pair order does not match Build");
  }
  return value as unknown as MarketDeploymentPairV1;
}

function validateBinding(
  value: unknown,
  label: string,
): MarketDeploymentBlockBindingV1 {
  assertClosedObject(value, label, [
    "blockNumber",
    "blockHash",
    "parentBlockHash",
  ]);
  assertUint256Decimal(value.blockNumber, `${label}.blockNumber`);
  if (
    typeof value.blockHash !== "string" ||
    !BYTES32.test(value.blockHash) ||
    typeof value.parentBlockHash !== "string" ||
    !BYTES32.test(value.parentBlockHash)
  ) {
    throw new TypeError(`${label} hashes must be lowercase bytes32`);
  }
  return value as unknown as MarketDeploymentBlockBindingV1;
}

function validateTransaction(
  value: unknown,
  expected: MarketDeploymentTransactionV1,
  label: string,
): MarketDeploymentTransactionV1 {
  assertClosedObject(value, label, [
    "sender",
    "target",
    "value",
    "data",
    "dataDigest",
  ]);
  address(value.sender, `${label}.sender`);
  address(value.target, `${label}.target`);
  if (value.value !== "0") throw new TypeError(`${label}.value must be zero`);
  bytes(value.data, `${label}.data`);
  assertKeccak256Digest(value.dataDigest, `${label}.dataDigest`);
  if (
    canonicalizeJson(value as JsonValue) !==
    canonicalizeJson(expected as unknown as JsonValue)
  ) {
    throw new TypeError(`${label} changed after preparation`);
  }
  return value as unknown as MarketDeploymentTransactionV1;
}

function validatePreparedMarketDeployment(
  value: unknown,
): Exclude<PreparedMarketDeploymentV1, { readonly outcome: "conflict" }> {
  if (value === null || typeof value !== "object" || !("outcome" in value)) {
    throw new TypeError("prepared market deployment is invalid");
  }
  const prepared = value as Record<string, unknown>;
  const commonKeys = [
    "schemaVersion",
    "outcome",
    "quoteDigest",
    "release",
    "buildPackage",
    "pair",
    "producerArtifactDigests",
    "quorumDigest",
    "quorumBinding",
    "transactions",
    "preparedDigest",
  ];
  if (prepared.outcome === "existing-wrapper") {
    assertClosedObject(prepared, "prepared market deployment", [
      ...commonKeys,
      "wrapper",
      "poolExecutionProven",
    ]);
  } else if (prepared.outcome === "fresh-deployment") {
    assertClosedObject(prepared, "prepared market deployment", commonKeys);
  } else {
    throw new TypeError("prepared market deployment cannot be a conflict");
  }
  if (prepared.schemaVersion !== "cork.prepared-market-deployment/v1") {
    throw new TypeError("prepared market deployment schema is not supported");
  }
  assertSha256Digest(prepared.quoteDigest, "quoteDigest");
  const release = validateRelease(prepared.release);
  const build = validateBuild(prepared.buildPackage);
  validatePair(prepared.pair, build);
  if (
    !Array.isArray(prepared.producerArtifactDigests) ||
    prepared.producerArtifactDigests.length !== RFC007_ARTIFACT_NAMES.length
  ) {
    throw new TypeError("all producer artifact digests are required");
  }
  prepared.producerArtifactDigests.forEach((digest, index) =>
    assertSha256Digest(digest, `producerArtifactDigests[${index}]`),
  );
  assertSha256Digest(prepared.quorumDigest, "quorumDigest");
  validateBinding(prepared.quorumBinding, "quorumBinding");
  assertSha256Digest(prepared.preparedDigest, "preparedDigest");
  if (!Array.isArray(prepared.transactions)) {
    throw new TypeError("prepared transactions must be an array");
  }
  const preparedTransactions = prepared.transactions;
  if (prepared.outcome === "existing-wrapper") {
    address(prepared.wrapper, "wrapper");
    if (
      prepared.wrapper !== build.expectedWrapper ||
      preparedTransactions.length !== 0 ||
      prepared.poolExecutionProven !== false
    ) {
      throw new TypeError("existing wrapper preparation is inconsistent");
    }
  } else {
    const expected = transactions(build);
    if (preparedTransactions.length !== expected.length) {
      throw new TypeError("fresh deployment requires two exact transactions");
    }
    expected.forEach((transaction, index) =>
      validateTransaction(
        preparedTransactions[index],
        transaction,
        `transactions[${index}]`,
      ),
    );
  }
  const withoutDigest = { ...prepared };
  delete withoutDigest["preparedDigest"];
  if (
    sha256CanonicalJson(withoutDigest as JsonValue) !== prepared.preparedDigest
  ) {
    throw new TypeError("prepared market deployment digest changed");
  }
  return value as Exclude<
    PreparedMarketDeploymentV1,
    { readonly outcome: "conflict" }
  >;
}

export function createMarketDeploymentSimulation(input: {
  readonly prepared: Exclude<
    PreparedMarketDeploymentV1,
    { readonly outcome: "conflict" }
  >;
  readonly calls: readonly MarketDeploymentSimulationCallV1[];
  readonly simulatedAt: string;
}): MarketDeploymentSimulationV1 {
  assertClosedObject(input, "simulation input", [
    "prepared",
    "calls",
    "simulatedAt",
  ]);
  const prepared = validatePreparedMarketDeployment(input.prepared);
  assertUint256Decimal(input.simulatedAt, "simulatedAt");
  if (
    !Array.isArray(input.calls) ||
    input.calls.length !== prepared.transactions.length
  ) {
    throw new TypeError("simulation must cover every unchanged transaction");
  }
  const calls = input.calls.map((call, index) => {
    assertClosedObject(call, `calls[${index}]`, [
      "transactionIndex",
      "target",
      "dataDigest",
      "status",
      "reasonCode",
    ]);
    const validatedCall = call as unknown as MarketDeploymentSimulationCallV1;
    if (validatedCall.transactionIndex !== index) {
      throw new TypeError("simulation call order changed");
    }
    address(validatedCall.target, `calls[${index}].target`);
    assertKeccak256Digest(
      validatedCall.dataDigest,
      `calls[${index}].dataDigest`,
    );
    if (
      !["success", "revert", "unavailable"].includes(validatedCall.status) ||
      validatedCall.target !== prepared.transactions[index]!.target ||
      validatedCall.dataDigest !== prepared.transactions[index]!.dataDigest
    ) {
      throw new TypeError("simulation call does not bind prepared bytes");
    }
    nonEmpty(validatedCall.reasonCode, `calls[${index}].reasonCode`);
    return { ...validatedCall };
  });
  const status: MarketDeploymentSimulationV1["status"] = calls.some(
    (call) => call.status === "revert",
  )
    ? "revert"
    : calls.some((call) => call.status === "unavailable")
      ? "unavailable"
      : "success";
  const base = {
    schemaVersion: "cork.market-deployment-simulation/v1" as const,
    preparedDigest: prepared.preparedDigest,
    quoteDigest: prepared.quoteDigest,
    releaseDigest: prepared.release.releaseDigest,
    quorumDigest: prepared.quorumDigest,
    orderedCallsDigest: prepared.buildPackage.orderedCallsDigest,
    calls,
    status,
    simulatedAt: input.simulatedAt,
    deploymentProven: false as const,
  };
  return deepFreeze({
    ...base,
    simulationDigest: sha256CanonicalJson(base as unknown as JsonValue),
  });
}

function reconciliationConflict(
  status: "conflict" | "pool-evidence-mismatch",
  conflicts: readonly string[],
): MarketDeploymentReconciliationV1 {
  const base = {
    schemaVersion: "cork.market-deployment-reconciliation/v1" as const,
    status,
    conflicts,
  };
  return deepFreeze({
    ...base,
    reconciliationDigest: sha256CanonicalJson(base as unknown as JsonValue),
  });
}

function validateReceiptEvent(
  value: unknown,
  receiptIndex: number,
  build: MarketBuildPackageV1,
): MarketDeploymentReceiptEventV1 {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    throw new TypeError("receipt event is invalid");
  }
  const event = value as Record<string, unknown>;
  if (event.kind === "wrapper-deployed") {
    assertClosedObject(event, "wrapper deployed event", [
      "kind",
      "emitter",
      "collateralAsset",
      "referenceAsset",
      "wrapperFactory",
      "wrapper",
    ]);
    for (const field of [
      "emitter",
      "collateralAsset",
      "referenceAsset",
      "wrapperFactory",
      "wrapper",
    ] as const) {
      address(event[field], `wrapper event.${field}`);
    }
    if (
      receiptIndex !== 0 ||
      event.emitter !== build.marketRegistry ||
      event.collateralAsset !== build.collateralAsset ||
      event.referenceAsset !== build.referenceAsset ||
      event.wrapperFactory !== build.wrapperFactory ||
      event.wrapper !== build.expectedWrapper
    ) {
      throw new TypeError("wrapper deployment event fields do not match");
    }
  } else if (event.kind === "pool-created") {
    assertClosedObject(event, "pool created event", [
      "kind",
      "emitter",
      "collateralAsset",
      "referenceAsset",
      "wrapper",
    ]);
    for (const field of [
      "emitter",
      "collateralAsset",
      "referenceAsset",
      "wrapper",
    ] as const) {
      address(event[field], `pool event.${field}`);
    }
    if (
      receiptIndex !== 1 ||
      event.emitter !== build.poolCreationTarget ||
      event.collateralAsset !== build.collateralAsset ||
      event.referenceAsset !== build.referenceAsset ||
      event.wrapper !== build.expectedWrapper
    ) {
      throw new TypeError("pool creation event fields do not match");
    }
  } else {
    throw new TypeError("receipt event kind is not supported");
  }
  return value as MarketDeploymentReceiptEventV1;
}

function validateReceipt(
  value: unknown,
  expected: MarketDeploymentTransactionV1,
  index: number,
  build: MarketBuildPackageV1,
): {
  readonly receipt: MarketDeploymentReceiptV1;
  readonly digest: Sha256Digest;
} {
  assertClosedObject(value, `receipts[${index}]`, [
    "transactionIndex",
    "transactionHash",
    "blockNumber",
    "blockHash",
    "parentBlockHash",
    "final",
    "status",
    "sender",
    "target",
    "value",
    "data",
    "dataDigest",
    "events",
  ]);
  if (value.transactionIndex !== index) {
    throw new TypeError("receipt transaction order changed");
  }
  assertKeccak256Digest(value.transactionHash, "receipt.transactionHash");
  assertUint256Decimal(value.blockNumber, "receipt.blockNumber");
  if (
    typeof value.blockHash !== "string" ||
    !BYTES32.test(value.blockHash) ||
    typeof value.parentBlockHash !== "string" ||
    !BYTES32.test(value.parentBlockHash) ||
    typeof value.final !== "boolean" ||
    !["success", "revert"].includes(value.status as string)
  ) {
    throw new TypeError("receipt finality or block binding is invalid");
  }
  validateTransaction(
    {
      sender: value.sender,
      target: value.target,
      value: value.value,
      data: value.data,
      dataDigest: value.dataDigest,
    },
    expected,
    `receipts[${index}].transaction`,
  );
  if (!Array.isArray(value.events)) {
    throw new TypeError("receipt events must be an array");
  }
  const events = value.events.map((event) =>
    validateReceiptEvent(event, index, build),
  );
  if (
    (index === 0 &&
      (events.length > 1 ||
        events.some((event) => event.kind !== "wrapper-deployed"))) ||
    (index === 1 && (events.length !== 1 || events[0]!.kind !== "pool-created"))
  ) {
    throw new TypeError("receipt event set is not canonical");
  }
  const receipt = { ...value, events } as unknown as MarketDeploymentReceiptV1;
  return {
    receipt,
    digest: sha256CanonicalJson(receipt as unknown as JsonValue),
  };
}

function reconciliationSuccess(input: {
  readonly prepared: Exclude<
    PreparedMarketDeploymentV1,
    { readonly outcome: "conflict" }
  >;
  readonly finalFacts: ResolvedMarketDeploymentFactsV1;
  readonly status: Exclude<
    MarketDeploymentReconciliationStatusV1,
    "conflict" | "pool-evidence-mismatch"
  >;
  readonly receiptDigests: readonly Sha256Digest[];
  readonly remainingTransactions: readonly MarketDeploymentTransactionV1[];
  readonly wrapperDeploymentProven: boolean;
  readonly poolExecutionProven: boolean;
}): MarketDeploymentReconciliationV1 {
  const base = {
    schemaVersion: "cork.market-deployment-reconciliation/v1" as const,
    status: input.status,
    preparedDigest: input.prepared.preparedDigest,
    quoteDigest: input.prepared.quoteDigest,
    releaseDigest: input.prepared.release.releaseDigest,
    producerArtifactDigests: input.prepared.producerArtifactDigests,
    finalQuorumDigest: input.finalFacts.quorumDigest,
    finalBinding: input.finalFacts.binding,
    wrapper: input.prepared.buildPackage.expectedWrapper,
    verifiedReceiptDigests: input.receiptDigests,
    remainingTransactions: input.remainingTransactions,
    wrapperDeploymentProven: input.wrapperDeploymentProven,
    poolExecutionProven: input.poolExecutionProven,
  };
  return deepFreeze({
    ...base,
    reconciliationDigest: sha256CanonicalJson(base as unknown as JsonValue),
  });
}

function assertFinalFactRelationships(
  preparation: ResolvedMarketDeploymentFactsV1,
  finalFacts: ResolvedMarketDeploymentFactsV1,
): void {
  for (const field of MARKET_DEPLOYMENT_FACTS) {
    if (field === "lookupWrapper") continue;
    if (
      canonicalizeJson(preparation.values.get(field)!) !==
      canonicalizeJson(finalFacts.values.get(field)!)
    ) {
      throw new TypeError(`final relationship changed for ${field}`);
    }
  }
}

export function reconcileMarketDeployment(
  input: MarketDeploymentReconciliationInputV1,
  schemaValidator: RFC007SchemaValidatorV1,
): MarketDeploymentReconciliationV1 {
  try {
    assertClosedObject(input, "market deployment reconciliation input", [
      "prepared",
      "quote",
      "deployment",
      "preparationFacts",
      "finalFacts",
      "receipts",
    ]);
    const prepared = validatePreparedMarketDeployment(input.prepared);
    const reconstructed = prepareMarketDeployment(
      {
        quote: input.quote,
        deployment: input.deployment,
        facts: input.preparationFacts,
      },
      schemaValidator,
    );
    if (
      reconstructed.outcome === "conflict" ||
      canonicalizeJson(reconstructed as unknown as JsonValue) !==
        canonicalizeJson(prepared as unknown as JsonValue)
    ) {
      throw new TypeError("prepared deployment does not reconstruct");
    }
    const preparationFacts = resolveMarketDeploymentFacts(
      input.preparationFacts,
      prepared.buildPackage,
    );
    const finalFacts = resolveMarketDeploymentFacts(
      input.finalFacts,
      prepared.buildPackage,
    );
    assertFinalFactRelationships(preparationFacts, finalFacts);
    if (
      finalFacts.values.get("lookupWrapper") !==
      prepared.buildPackage.expectedWrapper
    ) {
      throw new TypeError("final ordered-pair wrapper is not authoritative");
    }
    if (!Array.isArray(input.receipts) || input.receipts.length > 2) {
      throw new TypeError("at most two ordered receipts are accepted");
    }
    if (prepared.outcome === "existing-wrapper") {
      if (input.receipts.length !== 0) {
        throw new TypeError(
          "existing-wrapper reconciliation accepts no receipts",
        );
      }
      return reconciliationSuccess({
        prepared,
        finalFacts,
        status: "verified-existing-wrapper",
        receiptDigests: [],
        remainingTransactions: [],
        wrapperDeploymentProven: true,
        poolExecutionProven: false,
      });
    }
    const expected = prepared.transactions;
    const receiptResults = input.receipts.map((receipt, index) =>
      validateReceipt(receipt, expected[index]!, index, prepared.buildPackage),
    );
    const registry = receiptResults[0]?.receipt;
    const pool = receiptResults[1]?.receipt;
    const receiptDigests = receiptResults.map(({ digest }) => digest);
    for (const receipt of receiptResults.map(({ receipt }) => receipt)) {
      if (
        receipt.final &&
        BigInt(receipt.blockNumber) > BigInt(finalFacts.binding.blockNumber)
      ) {
        throw new TypeError("final facts precede a final receipt");
      }
    }
    if (registry !== undefined && pool !== undefined) {
      const registryBlock = BigInt(registry.blockNumber);
      const poolBlock = BigInt(pool.blockNumber);
      if (
        poolBlock < registryBlock ||
        (poolBlock === registryBlock &&
          (pool.blockHash !== registry.blockHash ||
            pool.parentBlockHash !== registry.parentBlockHash)) ||
        (poolBlock === registryBlock + 1n &&
          pool.parentBlockHash !== registry.blockHash)
      ) {
        throw new TypeError("pool receipt does not follow registry receipt");
      }
    }
    if (registry === undefined || !registry.final) {
      return reconciliationSuccess({
        prepared,
        finalFacts,
        status: "uncertain-registry-outcome",
        receiptDigests,
        remainingTransactions: expected,
        wrapperDeploymentProven: true,
        poolExecutionProven: false,
      });
    }
    if (registry.status !== "success") {
      throw new TypeError("registry transaction did not succeed");
    }
    const repeated = registry.events.length === 0;
    if (pool === undefined) {
      return reconciliationSuccess({
        prepared,
        finalFacts,
        status: "registry-only-partial",
        receiptDigests,
        remainingTransactions: [expected[1]],
        wrapperDeploymentProven: true,
        poolExecutionProven: false,
      });
    }
    if (!pool.final) {
      return reconciliationSuccess({
        prepared,
        finalFacts,
        status: "uncertain-registry-outcome",
        receiptDigests,
        remainingTransactions: [],
        wrapperDeploymentProven: true,
        poolExecutionProven: false,
      });
    }
    if (pool.status !== "success") {
      return reconciliationConflict("pool-evidence-mismatch", [
        "pool transaction reverted",
      ]);
    }
    return reconciliationSuccess({
      prepared,
      finalFacts,
      status: repeated ? "repeat-registry-no-event" : "fresh-two-step-success",
      receiptDigests,
      remainingTransactions: [],
      wrapperDeploymentProven: true,
      poolExecutionProven: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid";
    return reconciliationConflict(
      message.includes("pool") || message.includes("receipts[1]")
        ? "pool-evidence-mismatch"
        : "conflict",
      [message],
    );
  }
}
