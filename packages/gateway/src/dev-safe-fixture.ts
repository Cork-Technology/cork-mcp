import {
  LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  assertClosedObject,
  assertUint256Decimal,
  authorizeSafePermitMessages,
  createCorkDeploymentManifest,
  createSafeExecutionWrapper,
  finalizePairedSharesUnwind,
  generationPayloadDigest,
  keccak256Digest,
  preparePairedSharesUnwind,
  sha256CanonicalJson,
  type ApprovedSafePolicyV1,
  type BrowserSignatureVerifierV1,
  type ContractBindingV1,
  type GenerationEvidenceRootsInputV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type JsonValue,
  type SafeConfigurationV1,
  type Sha256Digest,
} from "@corkprotocol/operations";
import { type HostedScope } from "./controls.js";
import { LOCAL_FIXTURE_NOTICE } from "./dev-constants.js";
import { type ClosedInputSchema } from "./router.js";

const ADDRESS = /^0x[0-9a-f]{40}$/u;
const FIXTURE_CHAIN_ID = "31337";
const PREPARED_AT = "1800000000";
const DEADLINE = "1800003600";
const FINALIZED_AT = "1800000001";
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;

function address(value: number): string {
  return `0x${value.toString(16).padStart(40, "0")}`;
}

function bytes32(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function fixtureDigest(label: string): Sha256Digest {
  return sha256CanonicalJson({ fixture: label });
}

const FIXTURE_CONTRACTS = Object.freeze({
  permit2: address(0x1001),
  bundler3: address(0x1002),
  corkAdapter: address(0x1003),
  poolManager: address(0x1004),
  limitOrderProtocol: address(0x1005),
});

const FIXTURE_SAFE = Object.freeze({
  safeAddress: address(0x3004),
  singletonAddress: address(0x2001),
  fallbackHandlerAddress: address(0x2002),
  owners: [address(0x3001), address(0x3002), address(0x3003)] as const,
});

const SAFE_POLICY_BASE = {
  schemaVersion: "cork.safe-policy/v1" as const,
  singletonAddress: FIXTURE_SAFE.singletonAddress,
  singletonCodeHash: bytes32(0x2001),
  safeVersion: "1.4.1-local-fixture",
  fallbackHandlerAddress: FIXTURE_SAFE.fallbackHandlerAddress,
  fallbackHandlerCodeHash: bytes32(0x2002),
};

const SAFE_POLICY: ApprovedSafePolicyV1 = Object.freeze({
  ...SAFE_POLICY_BASE,
  policyDigest: sha256CanonicalJson(SAFE_POLICY_BASE),
});

export interface LocalFixtureMarketV1 {
  readonly id: string;
  readonly displayName: string;
  readonly network: "local-fixture";
  readonly chainId: "31337";
  readonly deploymentId: string;
  readonly poolId: string;
  readonly collateralAsset: {
    readonly symbol: string;
    readonly address: string;
    readonly decimals: "6";
  };
  readonly referenceAsset: {
    readonly symbol: string;
    readonly address: string;
  };
  readonly cptAddress: string;
  readonly cstAddress: string;
  readonly shareQuantum: "1000000000000";
  readonly supportedAction: "unwind-paired-shares";
}

export const LOCAL_FIXTURE_MARKETS: readonly LocalFixtureMarketV1[] =
  Object.freeze([
    Object.freeze({
      id: "synthetic-weth-usdc-2027",
      displayName: "Synthetic WETH / USDC 2027 (local fixture)",
      network: "local-fixture",
      chainId: FIXTURE_CHAIN_ID,
      deploymentId: "local-fixture-weth-usdc",
      poolId: bytes32(0x5001),
      collateralAsset: Object.freeze({
        symbol: "fUSDC",
        address: address(0x4001),
        decimals: "6",
      }),
      referenceAsset: Object.freeze({
        symbol: "fWETH",
        address: address(0x4002),
      }),
      cptAddress: address(0x4003),
      cstAddress: address(0x4004),
      shareQuantum: "1000000000000",
      supportedAction: "unwind-paired-shares",
    }),
    Object.freeze({
      id: "synthetic-wsteth-usdc-2027",
      displayName: "Synthetic wstETH / USDC 2027 (local fixture)",
      network: "local-fixture",
      chainId: FIXTURE_CHAIN_ID,
      deploymentId: "local-fixture-wsteth-usdc",
      poolId: bytes32(0x5002),
      collateralAsset: Object.freeze({
        symbol: "fUSDC",
        address: address(0x4101),
        decimals: "6",
      }),
      referenceAsset: Object.freeze({
        symbol: "fwstETH",
        address: address(0x4102),
      }),
      cptAddress: address(0x4103),
      cstAddress: address(0x4104),
      shareQuantum: "1000000000000",
      supportedAction: "unwind-paired-shares",
    }),
  ]);

export interface LocalSafeToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly scope: HostedScope;
  readonly inputSchema: ClosedInputSchema;
  readonly capabilityId?: undefined;
}

const LIST_MARKETS_TOOL = {
  name: "cork.local.markets.list.v1",
  description:
    "List synthetic, local-only Cork markets available for Safe transaction construction tests.",
  scope: "phoenix:read",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
} as const satisfies LocalSafeToolDefinition;

const PREPARE_SAFE_UNWIND_TOOL = {
  name: "cork.local.safe.unwind.prepare.v1",
  description:
    "Construct deterministic paired-share unwind calldata and an unsigned Safe transaction for a synthetic local market; never broadcast.",
  scope: "action:write",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      marketId: { type: "string" },
      requestedSharesIn: { type: "string" },
      minimumCollateralAssetsOut: { type: "string" },
      safeNonce: { type: "string" },
      receiver: { type: "string" },
    },
    required: [
      "marketId",
      "requestedSharesIn",
      "minimumCollateralAssetsOut",
      "safeNonce",
    ],
  },
} as const satisfies LocalSafeToolDefinition;

export const LOCAL_SAFE_TOOL_CATALOG: readonly LocalSafeToolDefinition[] =
  Object.freeze([LIST_MARKETS_TOOL, PREPARE_SAFE_UNWIND_TOOL]);

export type LocalSafeToolName =
  | "cork.local.markets.list.v1"
  | "cork.local.safe.unwind.prepare.v1";

export function findLocalSafeTool(
  name: string,
): LocalSafeToolDefinition | undefined {
  return LOCAL_SAFE_TOOL_CATALOG.find((tool) => tool.name === name);
}

function contract(
  role: ContractBindingV1["role"],
  contractAddress: string,
): ContractBindingV1 {
  return {
    role,
    address: contractAddress,
    deploymentKind: "direct",
    runtimeCodeHash: keccak256Digest(
      new TextEncoder().encode(`local-fixture:${role}`),
    ),
    abiArtifactDigest: fixtureDigest(`${role}:abi`),
    sourceCommit:
      role === "LimitOrderProtocol"
        ? LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT
        : "ab".repeat(20),
    compiledArtifactDigest: fixtureDigest(`${role}:artifact`),
    relationships: [],
  };
}

function generationRoots(
  market: LocalFixtureMarketV1,
): GenerationEvidenceRootsInputV1 {
  const poolBase = {
    poolId: market.poolId,
    collateralAsset: market.collateralAsset.address,
    referenceAsset: market.referenceAsset.address,
    expiryTimestamp: "2000000000",
    rateMin: "1",
    rateMax: "2",
    rateChangePerDayMax: "3",
    rateChangeCapacityMax: "4",
    rateOracle: address(0x6001),
    poolManager: FIXTURE_CONTRACTS.poolManager,
    cptAddress: market.cptAddress,
    cstAddress: market.cstAddress,
    limitOrderProtocolAddress: FIXTURE_CONTRACTS.limitOrderProtocol,
    runtimeCodeHash: bytes32(0x7001),
    proxyIdentityDigest: fixtureDigest(`${market.id}:proxy`),
    criticalGettersDigest: fixtureDigest(`${market.id}:getters`),
    cachedCollateralDecimals: market.collateralAsset.decimals,
    issuanceState: "issued" as const,
    pauseState: "unpaused" as const,
    whitelistState: "required" as const,
    adapterWhitelisted: true,
  };
  const manifest = createCorkDeploymentManifest({
    schemaVersion: "cork.local-fixture-deployment-manifest/v1",
    deploymentId: market.deploymentId,
    chainId: market.chainId,
    network: market.network,
    generation: "1",
    status: "active",
    validFromBlock: "1",
    contracts: [
      contract("Bundler3", FIXTURE_CONTRACTS.bundler3),
      contract("CorkAdapter", FIXTURE_CONTRACTS.corkAdapter),
      contract("CorkPoolManager", FIXTURE_CONTRACTS.poolManager),
      contract("LimitOrderProtocol", FIXTURE_CONTRACTS.limitOrderProtocol),
      contract("Permit2", FIXTURE_CONTRACTS.permit2),
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
    const isDeployment = rootKind === "deployment";
    const generationId = isDeployment
      ? market.deploymentId
      : "local-fixture-security-policy";
    const repository = isDeployment
      ? "Cork-Technology/cork-deployments"
      : "Cork-Technology/cork-signing-gate";
    const releaseIdentity = `${generationId}-release-1`;
    const payload: GenerationPayloadV1 = {
      schemaVersion: isDeployment
        ? "cork.deployment-generation/v1"
        : "cork.signing-policy-generation/v1",
      rootKind,
      generationId,
      generation: "1",
      status: "active",
      releaseIdentity,
      contentDigest: isDeployment
        ? manifest.manifestDigest
        : fixtureDigest(`${market.id}:policy`),
      claims: [],
      ...(isDeployment ? { manifest } : {}),
    };
    const payloadDigest = generationPayloadDigest(payload);
    const path = `${isDeployment ? "generations" : "policy-generations"}/${generationId}/1/`;
    return {
      schemaVersion: "cork.generation-evidence/v1",
      rootKind,
      repository,
      path,
      identity: { generationId, generation: "1" },
      repositoryCommit: "ab".repeat(20),
      release: {
        identity: releaseIdentity,
        tag: "local-v1",
        repositoryCommit: "ab".repeat(20),
        releasedAt: "3",
      },
      payload,
      payloadDigest,
      reviewPromotion: {
        reviewedByRole: "local-fixture-reviewer",
        reviewedAt: "1",
        promotedByRole: "local-fixture-promoter",
        promotedAt: "2",
      },
      publisher: {
        identity: "local-fixture-publisher",
        repository,
        path,
        publishedAt: "6",
      },
      transparency: {
        recordId: `${generationId}-record-1`,
        repository,
        path,
        payloadDigest,
      },
      continuity: {
        kind: "successor",
        predecessorGeneration: "0",
        predecessorPayloadDigest: fixtureDigest(`${generationId}:predecessor`),
      },
      signatures: [0, 1].map((order) => ({
        order: String(order),
        keyId: `${generationId}-fixture-key-${order}`,
        algorithm: "ed25519" as const,
        rootKind,
        payloadDigest,
        signedAt: String(4 + order),
        signature: `local-fixture-signature-${order}`,
      })),
    };
  };

  return {
    deployment: generation("deployment"),
    policy: generation("signing-policy"),
  };
}

function safeConfiguration(nonce: string): SafeConfigurationV1 {
  return {
    safeAddress: FIXTURE_SAFE.safeAddress,
    singletonAddress: SAFE_POLICY.singletonAddress,
    singletonCodeHash: SAFE_POLICY.singletonCodeHash,
    safeVersion: SAFE_POLICY.safeVersion,
    owners: FIXTURE_SAFE.owners,
    threshold: "2",
    fallbackHandlerAddress: SAFE_POLICY.fallbackHandlerAddress,
    fallbackHandlerCodeHash: SAFE_POLICY.fallbackHandlerCodeHash,
    guardAddress: ZERO_ADDRESS,
    enabledModules: [],
    nonce,
  };
}

const EVIDENCE_VERIFIER: BrowserSignatureVerifierV1 = {
  verify: () => true,
};

const SAFE_MESSAGE_VERIFIER = {
  verify: (): "0x1626ba7e" => "0x1626ba7e",
};

function validateAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    throw new TypeError(`${label} must be a lowercase address`);
  }
  if (value === ZERO_ADDRESS || value === FIXTURE_CONTRACTS.corkAdapter) {
    throw new TypeError(
      `${label} must be non-zero and distinct from the fixture Cork adapter`,
    );
  }
  return value;
}

interface LocalSafeUnwindInput {
  readonly marketId: string;
  readonly requestedSharesIn: string;
  readonly minimumCollateralAssetsOut: string;
  readonly safeNonce: string;
  readonly receiver: string;
}

function validateSafeUnwindInput(value: unknown): LocalSafeUnwindInput {
  assertClosedObject(
    value,
    "local Safe unwind input",
    [
      "marketId",
      "requestedSharesIn",
      "minimumCollateralAssetsOut",
      "safeNonce",
    ],
    ["receiver"],
  );
  if (typeof value["marketId"] !== "string" || value["marketId"].length === 0) {
    throw new TypeError("marketId must be a non-empty string");
  }
  const market = LOCAL_FIXTURE_MARKETS.find(
    (candidate) => candidate.id === value["marketId"],
  );
  if (market === undefined) {
    throw new TypeError("marketId is not a known local fixture market");
  }
  assertUint256Decimal(value["requestedSharesIn"], "requestedSharesIn");
  assertUint256Decimal(
    value["minimumCollateralAssetsOut"],
    "minimumCollateralAssetsOut",
  );
  assertUint256Decimal(value["safeNonce"], "safeNonce");
  if (
    value["requestedSharesIn"] === "0" ||
    BigInt(value["requestedSharesIn"]) < BigInt(market.shareQuantum)
  ) {
    throw new TypeError(
      `requestedSharesIn must be at least the market share quantum ${market.shareQuantum}`,
    );
  }
  if (value["minimumCollateralAssetsOut"] === "0") {
    throw new TypeError("minimumCollateralAssetsOut must be greater than zero");
  }
  return {
    marketId: value["marketId"],
    requestedSharesIn: value["requestedSharesIn"],
    minimumCollateralAssetsOut: value["minimumCollateralAssetsOut"],
    safeNonce: value["safeNonce"],
    receiver:
      value["receiver"] === undefined
        ? FIXTURE_SAFE.safeAddress
        : validateAddress(value["receiver"], "receiver"),
  };
}

export function listLocalFixtureMarkets(value: unknown = {}): {
  readonly schemaVersion: "cork.local-market-list/v1";
  readonly fixtureOnly: true;
  readonly notice: typeof LOCAL_FIXTURE_NOTICE;
  readonly markets: readonly LocalFixtureMarketV1[];
} {
  assertClosedObject(value, "local market list input", []);
  return Object.freeze({
    schemaVersion: "cork.local-market-list/v1",
    fixtureOnly: true,
    notice: LOCAL_FIXTURE_NOTICE,
    markets: LOCAL_FIXTURE_MARKETS,
  });
}

export function prepareLocalSafeUnwind(value: unknown) {
  const input = validateSafeUnwindInput(value);
  const market = LOCAL_FIXTURE_MARKETS.find(
    (candidate) => candidate.id === input.marketId,
  );
  if (market === undefined) {
    throw new TypeError("marketId is not a known local fixture market");
  }
  const roots = generationRoots(market);
  const prepared = preparePairedSharesUnwind(
    {
      intent: {
        schemaVersion: "cork.operation/v1",
        action: "phoenix.unwind-mint",
        clientRequestId: [
          "local-safe-unwind",
          market.id,
          input.requestedSharesIn,
          input.minimumCollateralAssetsOut,
          input.receiver,
        ].join(":"),
        account: { kind: "safe", address: FIXTURE_SAFE.safeAddress },
        chainId: market.chainId,
        deploymentId: market.deploymentId,
        poolId: market.poolId,
        requestedSharesIn: input.requestedSharesIn,
        receiver: input.receiver,
        minCollateralAssetsOut: input.minimumCollateralAssetsOut,
        deadline: DEADLINE,
      },
      bindings: {
        evidenceRoots: roots,
        liveCollateralDecimals: market.collateralAsset.decimals,
        preparedAt: PREPARED_AT,
        adapterStartingBalancesDigest: fixtureDigest(
          `${market.id}:adapter-starting-balances`,
        ),
      },
    },
    EVIDENCE_VERIFIER,
  );
  const finalized = finalizePairedSharesUnwind(
    {
      prepared,
      evidenceRoots: roots,
      signatures: [
        { id: "permit-cpt", signature: "0x11" },
        { id: "permit-cst", signature: "0x22" },
      ],
      finalizedAt: FINALIZED_AT,
    },
    { verify: () => true },
    EVIDENCE_VERIFIER,
  );
  const configuration = safeConfiguration(input.safeNonce);
  const authorization = authorizeSafePermitMessages(
    {
      configuration,
      policy: SAFE_POLICY,
      requirements: prepared.authorizations,
      signatureArtifacts: [
        { id: "permit-cpt", signatureBlob: "0xaa" },
        { id: "permit-cst", signatureBlob: "0xbb" },
      ],
    },
    SAFE_MESSAGE_VERIFIER,
  );
  const safeTransaction = createSafeExecutionWrapper(
    {
      configuration,
      policy: SAFE_POLICY,
      authorization,
      chainId: market.chainId,
      bundler3: finalized.execution.to,
      bundlerData: finalized.execution.data,
    },
    SAFE_MESSAGE_VERIFIER,
  );

  return Object.freeze({
    schemaVersion: "cork.local-safe-transaction-demo/v1" as const,
    fixtureOnly: true as const,
    notice: LOCAL_FIXTURE_NOTICE,
    broadcastReady: false as const,
    market,
    request: Object.freeze(input),
    prepared,
    finalized,
    safeTransaction,
    safety: Object.freeze({
      networkAccess: false as const,
      productionEvidenceUsed: false as const,
      productionSignaturesUsed: false as const,
      safeConfirmationsCollected: false as const,
      transactionSubmitted: false as const,
      transactionAuthorization: "caller-owned-not-collected" as const,
      fixtureVerification:
        "Deterministic test bytes accepted only by injected local verifier seams." as const,
    }),
  });
}
