import {
  assertAccount,
  assertClosedObject,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  keccak256Bytes,
  keccak256Digest,
  sha256CanonicalJson,
  type AccountV1,
  type JsonValue,
  type Keccak256Digest,
  type Sha256Digest,
} from "./kernel.js";
import {
  findDeploymentContract,
  findDeploymentPool,
  verifyDeploymentManifest,
  type BrowserSignatureVerifierV1,
  type DeploymentPoolBindingV1,
  type GenerationEvidenceRootsInputV1,
} from "./evidence.js";

export const LIMIT_ORDER_PROTOCOL_VERSION = "4.3.2" as const;
export const LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT =
  "67c56aee3b6a9f4982bf487084bd8da1f6638da0" as const;
export const LIMIT_ORDER_SDK_VERSION = "4.3.0" as const;
export const LIMIT_ORDER_SDK_SOURCE_COMMIT =
  "5e0c09c3d2df34923c07c3d3805afa657d8db28f" as const;
// AggregationRouterV6.abi.json from @1inch/limit-order-sdk@4.3.0 and the
// matching file at LIMIT_ORDER_SDK_SOURCE_COMMIT.
export const LIMIT_ORDER_SDK_ABI_RAW_SHA256 =
  "sha256:4129e89c971093caa4a87bcfadff5ba37f43d0a362358f40eb698ecd511ed195" as const;
export const LIMIT_ORDER_SDK_ABI_CANONICAL_SHA256 =
  "sha256:b8a1043bb178aedc35f31475b19b4048d9569632a1b1e6e2a826ece83d0b6327" as const;
export const LIMIT_ORDER_PROTOCOL_ADDRESS =
  "0x111111125421ca6dc452d289314280a0f8842a65" as const;

export type PartialFillPreferenceV1 = "single-fill" | "partial-multiple-fill";
export type InvalidationRegimeV1 = "bit-invalidator" | "remaining-invalidator";
export type MakerAccountTypeV1 = "externally-owned-account" | "eip-1271";

export interface LimitOrderDeploymentV1 {
  readonly schemaVersion: "cork.limit-order-deployment/v1";
  readonly deploymentId: string;
  readonly chainId: string;
  readonly status: "active" | "retired" | "emergency-disabled";
  readonly protocolAddress: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
  readonly protocolVersion: typeof LIMIT_ORDER_PROTOCOL_VERSION;
  readonly protocolSourceCommit: typeof LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT;
  readonly sdkVersion: typeof LIMIT_ORDER_SDK_VERSION;
  readonly sdkSourceCommit: typeof LIMIT_ORDER_SDK_SOURCE_COMMIT;
  readonly manifestDigest: Sha256Digest;
}

export interface LimitOrderDeploymentEvidenceInputV1 {
  readonly evidenceRoots: GenerationEvidenceRootsInputV1;
  readonly poolId: string;
}

export interface ResolvedLimitOrderAuthorityV1 {
  readonly deployment: LimitOrderDeploymentV1;
  readonly pool: DeploymentPoolBindingV1;
  readonly generation: string;
}

export interface LimitOrderVerifiedMarketReferenceV1 {
  readonly schemaVersion: "cork.limit-order-market/v1";
  readonly verifiedMarketDigest: Sha256Digest;
  readonly chainId: string;
  readonly deploymentId: string;
  readonly poolId: string;
  readonly makerAsset: string;
  readonly takerAsset: string;
}

export interface LimitOrderMakerIntentV1 {
  readonly schemaVersion: "cork.limit-order-maker-intent/v1";
  readonly clientRequestId: string;
  readonly chainId: string;
  readonly deploymentId: string;
  readonly verifiedMarket: LimitOrderVerifiedMarketReferenceV1;
  readonly makerAccount: AccountV1;
  readonly receiver: string;
  readonly makerAsset: string;
  readonly takerAsset: string;
  readonly makingAmount: string;
  readonly takingAmount: string;
  readonly expiry: string;
  readonly partialFillPreference: PartialFillPreferenceV1;
  readonly extensionProfile: "none";
  readonly side: "BUY" | "SELL";
  readonly premiumMetadata: JsonValue;
  readonly quoteReference?: string;
}

export interface MakerTraitsProjectionV1 {
  readonly raw: string;
  readonly noPartialFills: boolean;
  readonly allowMultipleFills: boolean;
  readonly usePermit2: false;
  readonly unwrapWeth: false;
  readonly hasExtension: false;
  readonly series: "0";
  readonly nonceOrEpoch: string;
  readonly expiration: string;
  readonly allowedSender: "0";
  readonly invalidatorRegime: InvalidationRegimeV1;
}

export interface LimitOrderV1 {
  readonly salt: string;
  readonly maker: string;
  readonly receiver: string;
  readonly makerAsset: string;
  readonly takerAsset: string;
  readonly makingAmount: string;
  readonly takingAmount: string;
  readonly makerTraits: string;
}

export interface LimitOrderIdentityV1 {
  readonly intentDigest: Sha256Digest;
  readonly nonceOrEpoch: string;
  readonly salt: string;
  readonly makerTraits: MakerTraitsProjectionV1;
  readonly invalidator: {
    readonly regime: InvalidationRegimeV1;
    readonly slot?: string;
    readonly mask?: string;
  };
  readonly order: LimitOrderV1;
  readonly typedData: {
    readonly domain: {
      readonly name: "1inch Limit Order Protocol";
      readonly version: "4";
      readonly chainId: string;
      readonly verifyingContract: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
    };
    readonly primaryType: "Order";
    readonly message: LimitOrderV1;
  };
  readonly typedDataDigest: Keccak256Digest;
  readonly orderHash: string;
}

export interface InventoryInvalidatorObservationV1 {
  readonly regime: InvalidationRegimeV1;
  readonly canonicalBlockNumber: string;
  readonly canonicalBlockHash: string;
  readonly parentBlockHash: string;
  readonly observedAt: string;
  readonly invalidated: boolean;
  readonly rawValue: string;
}

export interface MakerOrderInventoryRecordV1 {
  readonly orderHash: string;
  readonly submissionDigest: Sha256Digest;
  readonly acceptedServiceIdentity: string;
  readonly signedOrderPayloadDigest: Sha256Digest;
  readonly makerTraits: string;
  readonly nonceOrEpoch: string;
  readonly invalidatorRegime: InvalidationRegimeV1;
  readonly indexedStatus: "accepted" | "open" | "partially-filled" | "unknown";
  readonly makingAmount: string;
  readonly remainingMakingAmount: string;
  readonly expiry: string;
  readonly invalidatorObservation: InventoryInvalidatorObservationV1;
}

export interface MakerOrderInventoryV1 {
  readonly schemaVersion: "cork.maker-order-inventory/v1";
  readonly requestingPrincipal: string;
  readonly sourceProfile: string;
  readonly maker: string;
  readonly makerToken: string;
  readonly spender: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
  readonly observedAt: string;
  readonly complete: boolean;
  readonly pagesRead: string;
  readonly finalCursor: "";
  readonly records: readonly MakerOrderInventoryRecordV1[];
  readonly warnings: readonly string[];
  readonly inventoryDigest: Sha256Digest;
}

export interface LimitOrderIdentityStateV1 {
  readonly bitInvalidatorWord: string;
  readonly rawRemainingInvalidator: string;
  readonly acceptedOrderHashes: readonly string[];
  readonly finalOrderHashes: readonly string[];
  readonly conflictingOrderHashes: readonly string[];
}

export interface LimitOrderAgreementInputV1 {
  readonly deployment: LimitOrderDeploymentV1;
  readonly identity: LimitOrderIdentityV1;
}

export interface LimitOrderAgreementVerifierV1 {
  verify(input: LimitOrderAgreementInputV1): boolean;
}

export interface LimitOrderSignatureVerificationInputV1 {
  readonly accountType: MakerAccountTypeV1;
  readonly signer: string;
  readonly digest: Keccak256Digest;
  readonly signature: string;
}

export interface LimitOrderSignatureVerifierV1 {
  verify(input: LimitOrderSignatureVerificationInputV1): boolean;
}

export interface LimitOrderTransactionV1 {
  readonly from: string;
  readonly to: typeof LIMIT_ORDER_PROTOCOL_ADDRESS | string;
  readonly value: "0";
  readonly functionName: string;
  readonly calldata: string;
  readonly calldataDigest: Keccak256Digest;
}

export interface SharedAllowanceDisclosureV1 {
  readonly presentedBeforeAuthorization: true;
  readonly code: "shared-limit-order-allowance";
  readonly coverage: "cork-service-known-orders-only";
  readonly persistence: "owner-revocation";
  readonly outsideCorkSignatureRisk: true;
}

export type MakerPreparationResultV1 =
  | {
      readonly schemaVersion: "cork.limit-order-maker/v1";
      readonly outcome: "unavailable";
      readonly code:
        | "MAKER_ORDER_INVENTORY_INCOMPLETE"
        | "MAKER_ALLOWANCE_TARGET_OVERFLOW"
        | "LIMIT_ORDER_IDENTITY_ALREADY_USED";
    }
  | {
      readonly schemaVersion: "cork.limit-order-maker/v1";
      readonly outcome: "prerequisite";
      readonly intent: LimitOrderMakerIntentV1;
      readonly deployment: LimitOrderDeploymentV1;
      readonly inventory: MakerOrderInventoryV1;
      readonly identity: LimitOrderIdentityV1;
      readonly targetAllowance: string;
      readonly approvalTransactions: readonly LimitOrderTransactionV1[];
      readonly disclosure: SharedAllowanceDisclosureV1;
      readonly preparationDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.limit-order-maker/v1";
      readonly outcome: "prepared";
      readonly intent: LimitOrderMakerIntentV1;
      readonly deployment: LimitOrderDeploymentV1;
      readonly inventory: MakerOrderInventoryV1;
      readonly identityState: LimitOrderIdentityStateV1;
      readonly currentAllowance: string;
      readonly zeroFirst: boolean;
      readonly identity: LimitOrderIdentityV1;
      readonly targetAllowance: string;
      readonly extension: "";
      readonly makerPermit2: "0x";
      readonly preparationDigest: Sha256Digest;
    };

export interface FinalizedSignedOrderV1 {
  readonly schemaVersion: "cork.limit-order-signed/v1";
  readonly preparedDigest: Sha256Digest;
  readonly intent: LimitOrderMakerIntentV1;
  readonly deployment: LimitOrderDeploymentV1;
  readonly identity: LimitOrderIdentityV1;
  readonly signature: string;
  readonly venueBody: {
    readonly order: LimitOrderV1;
    readonly signature: string;
    readonly extension: "";
    readonly makerPermit2: "0x";
    readonly allowsPartialFills: boolean;
    readonly expiry: string;
    readonly nonce: string;
    readonly side: "BUY" | "SELL";
    readonly makerAccountType: MakerAccountTypeV1;
    readonly orderHash: string;
  };
  readonly finalizedDigest: Sha256Digest;
}

const ADDRESS = /^0x[0-9a-f]{40}$/u;
const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const UINT40_MAX = (1n << 40n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const TAKER_THRESHOLD_MAX = (1n << 185n) - 1n;

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

function assertBytes(
  value: unknown,
  label: string,
  nonEmpty = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !BYTES.test(value) ||
    (nonEmpty && value === "0x")
  ) {
    throw new TypeError(`${label} must be canonical lowercase bytes`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function uintWord(value: bigint): Uint8Array {
  if (value < 0n || value > UINT256_MAX) {
    throw new RangeError("uint256 value is out of range");
  }
  const output = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    output[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return output;
}

function addressWord(value: string): Uint8Array {
  assertAddress(value, "address");
  const output = new Uint8Array(32);
  output.set(hexToBytes(value), 12);
  return output;
}

function selector(signature: string): Uint8Array {
  return keccak256Bytes(new TextEncoder().encode(signature)).slice(0, 4);
}

function bytesTail(value: string): Uint8Array {
  assertBytes(value, "bytes");
  const bytes = hexToBytes(value);
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  return concatBytes([uintWord(BigInt(bytes.length)), padded]);
}

function encodeApprove(spender: string, amount: string): string {
  return `0x${bytesToHex(
    concatBytes([
      selector("approve(address,uint256)"),
      addressWord(spender),
      uintWord(BigInt(amount)),
    ]),
  )}`;
}

const ORDER_TUPLE =
  "(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)";

function orderWords(order: LimitOrderV1): readonly Uint8Array[] {
  return [
    uintWord(BigInt(order.salt)),
    uintWord(BigInt(order.maker)),
    uintWord(BigInt(order.receiver)),
    uintWord(BigInt(order.makerAsset)),
    uintWord(BigInt(order.takerAsset)),
    uintWord(BigInt(order.makingAmount)),
    uintWord(BigInt(order.takingAmount)),
    uintWord(BigInt(order.makerTraits)),
  ];
}

function compactSignature(signature: string): {
  readonly r: Uint8Array;
  readonly vs: Uint8Array;
} {
  assertBytes(signature, "signature", true);
  const bytes = hexToBytes(signature);
  if (bytes.length === 64) {
    return { r: bytes.slice(0, 32), vs: bytes.slice(32) };
  }
  if (bytes.length !== 65) {
    throw new TypeError(
      "externally-owned-account signature must be 64 or 65 bytes",
    );
  }
  const recovery = bytes[64]!;
  if (recovery !== 0 && recovery !== 1 && recovery !== 27 && recovery !== 28) {
    throw new TypeError("signature recovery value is unsupported");
  }
  const vs = bytes.slice(32, 64);
  if (recovery === 1 || recovery === 28) vs[0] = vs[0]! | 0x80;
  return { r: bytes.slice(0, 32), vs };
}

function encodeStaticCall(
  signature: string,
  words: readonly Uint8Array[],
): string {
  return `0x${bytesToHex(concatBytes([selector(signature), ...words]))}`;
}

function encodeFillCall(input: {
  readonly functionName:
    | "fillOrder"
    | "fillOrderArgs"
    | "fillContractOrder"
    | "fillContractOrderArgs";
  readonly order: LimitOrderV1;
  readonly signature: string;
  readonly amount: string;
  readonly takerTraits: string;
  readonly args: string;
}): string {
  const order = orderWords(input.order);
  const amount = uintWord(BigInt(input.amount));
  const takerTraits = uintWord(BigInt(input.takerTraits));
  if (
    input.functionName === "fillOrder" ||
    input.functionName === "fillOrderArgs"
  ) {
    const { r, vs } = compactSignature(input.signature);
    if (input.functionName === "fillOrder") {
      if (input.args !== "0x") {
        throw new TypeError("fillOrder cannot encode taker args");
      }
      return encodeStaticCall(
        `fillOrder(${ORDER_TUPLE},bytes32,bytes32,uint256,uint256)`,
        [...order, r, vs, amount, takerTraits],
      );
    }
    const args = bytesTail(input.args);
    return encodeStaticCall(
      `fillOrderArgs(${ORDER_TUPLE},bytes32,bytes32,uint256,uint256,bytes)`,
      [...order, r, vs, amount, takerTraits, uintWord(13n * 32n), args],
    );
  }
  const signature = bytesTail(input.signature);
  if (input.functionName === "fillContractOrder") {
    if (input.args !== "0x") {
      throw new TypeError("fillContractOrder cannot encode taker args");
    }
    return encodeStaticCall(
      `fillContractOrder(${ORDER_TUPLE},bytes,uint256,uint256)`,
      [...order, uintWord(11n * 32n), amount, takerTraits, signature],
    );
  }
  const args = bytesTail(input.args);
  return encodeStaticCall(
    `fillContractOrderArgs(${ORDER_TUPLE},bytes,uint256,uint256,bytes)`,
    [
      ...order,
      uintWord(12n * 32n),
      amount,
      takerTraits,
      uintWord(12n * 32n + BigInt(signature.length)),
      signature,
      args,
    ],
  );
}

function transaction(
  from: string,
  to: string,
  functionName: string,
  calldata: string,
): LimitOrderTransactionV1 {
  return {
    from,
    to,
    value: "0",
    functionName,
    calldata,
    calldataDigest: keccak256Digest(hexToBytes(calldata)),
  };
}

function stringTail(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  return concatBytes([uintWord(BigInt(bytes.length)), padded]);
}

function identitySeed(input: {
  readonly domain: string;
  readonly account: AccountV1;
  readonly deploymentId: string;
  readonly chainId: string;
  readonly clientRequestId: string;
  readonly intentDigest: Sha256Digest;
}): Uint8Array {
  const dynamic = [
    stringTail(input.domain),
    stringTail(input.account.kind),
    stringTail(input.deploymentId),
    stringTail(input.clientRequestId),
  ];
  let offset = 7 * 32;
  const head = [
    uintWord(BigInt(offset)),
    uintWord(BigInt((offset += dynamic[0]!.length))),
    addressWord(input.account.address),
    uintWord(BigInt((offset += dynamic[1]!.length))),
    uintWord(BigInt(input.chainId)),
    uintWord(BigInt((offset += dynamic[2]!.length))),
    hexToBytes(input.intentDigest.slice("sha256:".length)),
  ];
  return keccak256Bytes(concatBytes([...head, ...dynamic]));
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function validateDeployment(value: unknown): LimitOrderDeploymentV1 {
  assertClosedObject(value, "limit-order deployment", [
    "schemaVersion",
    "deploymentId",
    "chainId",
    "status",
    "protocolAddress",
    "protocolVersion",
    "protocolSourceCommit",
    "sdkVersion",
    "sdkSourceCommit",
    "manifestDigest",
  ]);
  if (
    value.schemaVersion !== "cork.limit-order-deployment/v1" ||
    value.protocolAddress !== LIMIT_ORDER_PROTOCOL_ADDRESS ||
    value.protocolVersion !== LIMIT_ORDER_PROTOCOL_VERSION ||
    value.protocolSourceCommit !== LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT ||
    value.sdkVersion !== LIMIT_ORDER_SDK_VERSION ||
    value.sdkSourceCommit !== LIMIT_ORDER_SDK_SOURCE_COMMIT
  ) {
    throw new TypeError("limit-order authority pin is not exact");
  }
  assertNonEmptyString(value.deploymentId, "deploymentId");
  assertUint256Decimal(value.chainId, "chainId");
  if (
    value.status !== "active" &&
    value.status !== "retired" &&
    value.status !== "emergency-disabled"
  ) {
    throw new TypeError("deployment status is not supported");
  }
  assertSha256Digest(value.manifestDigest, "manifestDigest");
  return {
    schemaVersion: "cork.limit-order-deployment/v1",
    deploymentId: value.deploymentId,
    chainId: value.chainId,
    status: value.status,
    protocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
    protocolVersion: LIMIT_ORDER_PROTOCOL_VERSION,
    protocolSourceCommit: LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
    sdkVersion: LIMIT_ORDER_SDK_VERSION,
    sdkSourceCommit: LIMIT_ORDER_SDK_SOURCE_COMMIT,
    manifestDigest: value.manifestDigest,
  };
}

export function resolveLimitOrderAuthority(
  input: LimitOrderDeploymentEvidenceInputV1,
  verifier: BrowserSignatureVerifierV1,
  requireActive: boolean,
): ResolvedLimitOrderAuthorityV1 {
  assertClosedObject(input, "limit-order deployment evidence", [
    "evidenceRoots",
    "poolId",
  ]);
  assertBytes32(input.poolId, "limit-order deployment poolId");
  const { roots, manifest } = verifyDeploymentManifest(
    input.evidenceRoots,
    verifier,
  );
  if (
    requireActive &&
    (manifest.status !== "active" || roots.policy.payload.status !== "active")
  ) {
    throw new TypeError("limit-order mutation requires active evidence roots");
  }
  if (manifest.status === "staged") {
    throw new TypeError("staged deployment evidence is not authoritative");
  }
  const protocol = findDeploymentContract(manifest, "LimitOrderProtocol");
  const pool = findDeploymentPool(manifest, input.poolId);
  if (
    protocol.address !== LIMIT_ORDER_PROTOCOL_ADDRESS ||
    protocol.sourceCommit !== LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT ||
    pool.limitOrderProtocolAddress !== protocol.address
  ) {
    throw new TypeError("limit-order protocol relationship is not exact");
  }
  return {
    deployment: {
      schemaVersion: "cork.limit-order-deployment/v1",
      deploymentId: manifest.deploymentId,
      chainId: manifest.chainId,
      status: manifest.status,
      protocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
      protocolVersion: LIMIT_ORDER_PROTOCOL_VERSION,
      protocolSourceCommit: LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
      sdkVersion: LIMIT_ORDER_SDK_VERSION,
      sdkSourceCommit: LIMIT_ORDER_SDK_SOURCE_COMMIT,
      manifestDigest: manifest.manifestDigest,
    },
    pool,
    generation: manifest.generation,
  };
}

export function assertLimitOrderIntentAuthority(
  intent: LimitOrderMakerIntentV1,
  deployment: LimitOrderDeploymentV1,
  pool: DeploymentPoolBindingV1,
): void {
  if (
    deployment.chainId !== intent.chainId ||
    deployment.deploymentId !== intent.deploymentId ||
    intent.verifiedMarket.chainId !== deployment.chainId ||
    intent.verifiedMarket.deploymentId !== deployment.deploymentId ||
    intent.verifiedMarket.poolId !== pool.poolId ||
    intent.verifiedMarket.makerAsset !== intent.makerAsset ||
    intent.verifiedMarket.takerAsset !== intent.takerAsset ||
    ![
      pool.collateralAsset,
      pool.referenceAsset,
      pool.cptAddress,
      pool.cstAddress,
    ].includes(intent.makerAsset) ||
    ![
      pool.collateralAsset,
      pool.referenceAsset,
      pool.cptAddress,
      pool.cstAddress,
    ].includes(intent.takerAsset) ||
    intent.makerAsset === intent.takerAsset
  ) {
    throw new TypeError("limit-order intent is not bound to the manifest pool");
  }
}

function validateMarket(value: unknown): LimitOrderVerifiedMarketReferenceV1 {
  assertClosedObject(value, "verified market reference", [
    "schemaVersion",
    "verifiedMarketDigest",
    "chainId",
    "deploymentId",
    "poolId",
    "makerAsset",
    "takerAsset",
  ]);
  if (value.schemaVersion !== "cork.limit-order-market/v1") {
    throw new TypeError("verified market reference schema is unsupported");
  }
  assertSha256Digest(value.verifiedMarketDigest, "verifiedMarketDigest");
  assertUint256Decimal(value.chainId, "market.chainId");
  assertNonEmptyString(value.deploymentId, "market.deploymentId");
  assertBytes32(value.poolId, "market.poolId");
  assertAddress(value.makerAsset, "market.makerAsset");
  assertAddress(value.takerAsset, "market.takerAsset");
  return {
    schemaVersion: "cork.limit-order-market/v1",
    verifiedMarketDigest: value.verifiedMarketDigest,
    chainId: value.chainId,
    deploymentId: value.deploymentId,
    poolId: value.poolId,
    makerAsset: value.makerAsset,
    takerAsset: value.takerAsset,
  };
}

function validateMakerIntent(value: unknown): LimitOrderMakerIntentV1 {
  assertClosedObject(
    value,
    "maker intent",
    [
      "schemaVersion",
      "clientRequestId",
      "chainId",
      "deploymentId",
      "verifiedMarket",
      "makerAccount",
      "receiver",
      "makerAsset",
      "takerAsset",
      "makingAmount",
      "takingAmount",
      "expiry",
      "partialFillPreference",
      "extensionProfile",
      "side",
      "premiumMetadata",
    ],
    ["quoteReference"],
  );
  if (
    value.schemaVersion !== "cork.limit-order-maker-intent/v1" ||
    value.extensionProfile !== "none"
  ) {
    throw new TypeError("maker intent schema or extension is unsupported");
  }
  assertNonEmptyString(value.clientRequestId, "clientRequestId");
  if (value.clientRequestId.length > 128) {
    throw new RangeError("clientRequestId exceeds 128 characters");
  }
  assertUint256Decimal(value.chainId, "chainId");
  assertNonEmptyString(value.deploymentId, "deploymentId");
  const verifiedMarket = validateMarket(value.verifiedMarket);
  assertAccount(value.makerAccount, "makerAccount");
  assertAddress(value.receiver, "receiver");
  assertAddress(value.makerAsset, "makerAsset");
  assertAddress(value.takerAsset, "takerAsset");
  assertUint256Decimal(value.makingAmount, "makingAmount");
  assertUint256Decimal(value.takingAmount, "takingAmount");
  assertUint256Decimal(value.expiry, "expiry");
  if (
    value.makingAmount === "0" ||
    value.takingAmount === "0" ||
    BigInt(value.expiry) === 0n ||
    BigInt(value.expiry) > UINT40_MAX
  ) {
    throw new TypeError("maker amounts or expiry are invalid");
  }
  if (
    value.partialFillPreference !== "single-fill" &&
    value.partialFillPreference !== "partial-multiple-fill"
  ) {
    throw new TypeError("partial fill preference is unsupported");
  }
  if (value.side !== "BUY" && value.side !== "SELL") {
    throw new TypeError("side is unsupported");
  }
  canonicalizeJson(value.premiumMetadata as JsonValue);
  if (value.quoteReference !== undefined) {
    assertNonEmptyString(value.quoteReference, "quoteReference");
  }
  if (
    verifiedMarket.chainId !== value.chainId ||
    verifiedMarket.deploymentId !== value.deploymentId ||
    verifiedMarket.makerAsset !== value.makerAsset ||
    verifiedMarket.takerAsset !== value.takerAsset
  ) {
    throw new TypeError("verified market does not match the maker intent");
  }
  return {
    schemaVersion: "cork.limit-order-maker-intent/v1",
    clientRequestId: value.clientRequestId,
    chainId: value.chainId,
    deploymentId: value.deploymentId,
    verifiedMarket,
    makerAccount: {
      kind: value.makerAccount.kind,
      address: value.makerAccount.address,
    },
    receiver: value.receiver,
    makerAsset: value.makerAsset,
    takerAsset: value.takerAsset,
    makingAmount: value.makingAmount,
    takingAmount: value.takingAmount,
    expiry: value.expiry,
    partialFillPreference: value.partialFillPreference,
    extensionProfile: "none",
    side: value.side,
    premiumMetadata: JSON.parse(
      canonicalizeJson(value.premiumMetadata as JsonValue),
    ) as JsonValue,
    ...(value.quoteReference === undefined
      ? {}
      : { quoteReference: value.quoteReference }),
  };
}

export function buildMakerTraitsV1(input: {
  readonly partialFillPreference: PartialFillPreferenceV1;
  readonly nonceOrEpoch: string;
  readonly expiry: string;
}): MakerTraitsProjectionV1 {
  assertClosedObject(input, "MakerTraits input", [
    "partialFillPreference",
    "nonceOrEpoch",
    "expiry",
  ]);
  assertUint256Decimal(input.nonceOrEpoch, "nonceOrEpoch");
  assertUint256Decimal(input.expiry, "expiry");
  if (
    BigInt(input.nonceOrEpoch) > UINT40_MAX ||
    BigInt(input.expiry) === 0n ||
    BigInt(input.expiry) > UINT40_MAX
  ) {
    throw new RangeError("MakerTraits nonce or expiry exceeds uint40");
  }
  let raw = BigInt(input.nonceOrEpoch) << 120n;
  raw |= BigInt(input.expiry) << 80n;
  if (input.partialFillPreference === "single-fill") {
    raw |= 1n << 255n;
  } else if (input.partialFillPreference === "partial-multiple-fill") {
    raw |= 1n << 254n;
  } else {
    throw new TypeError("partial fill preference is unsupported");
  }
  return deepFreeze({
    raw: raw.toString(),
    noPartialFills: input.partialFillPreference === "single-fill",
    allowMultipleFills: input.partialFillPreference === "partial-multiple-fill",
    usePermit2: false,
    unwrapWeth: false,
    hasExtension: false,
    series: "0",
    nonceOrEpoch: input.nonceOrEpoch,
    expiration: input.expiry,
    allowedSender: "0",
    invalidatorRegime:
      input.partialFillPreference === "single-fill"
        ? "bit-invalidator"
        : "remaining-invalidator",
  }) as MakerTraitsProjectionV1;
}

export function parseMakerTraitsV1(rawInput: string): MakerTraitsProjectionV1 {
  assertUint256Decimal(rawInput, "MakerTraits");
  const raw = BigInt(rawInput);
  const noPartialFills = ((raw >> 255n) & 1n) === 1n;
  const allowMultipleFills = ((raw >> 254n) & 1n) === 1n;
  const forbiddenMask =
    (1n << 253n) |
    (1n << 252n) |
    (1n << 251n) |
    (1n << 250n) |
    (1n << 249n) |
    (1n << 248n) |
    (1n << 247n) |
    (((1n << 47n) - 1n) << 200n) |
    (((1n << 40n) - 1n) << 160n) |
    ((1n << 80n) - 1n);
  if ((raw & forbiddenMask) !== 0n || noPartialFills === allowMultipleFills) {
    throw new TypeError("MakerTraits contains a forbidden version 1 flag");
  }
  const nonceOrEpoch = ((raw >> 120n) & UINT40_MAX).toString();
  const expiration = ((raw >> 80n) & UINT40_MAX).toString();
  return buildMakerTraitsV1({
    partialFillPreference: noPartialFills
      ? "single-fill"
      : "partial-multiple-fill",
    nonceOrEpoch,
    expiry: expiration,
  });
}

function eip712OrderHash(
  chainId: string,
  order: LimitOrderV1,
): { readonly digest: Keccak256Digest; readonly orderHash: string } {
  const domainType = keccak256Bytes(
    new TextEncoder().encode(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    ),
  );
  const domain = keccak256Bytes(
    concatBytes([
      domainType,
      keccak256Bytes(new TextEncoder().encode("1inch Limit Order Protocol")),
      keccak256Bytes(new TextEncoder().encode("4")),
      uintWord(BigInt(chainId)),
      addressWord(LIMIT_ORDER_PROTOCOL_ADDRESS),
    ]),
  );
  const orderType = keccak256Bytes(
    new TextEncoder().encode(
      "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 makerTraits)",
    ),
  );
  const structHash = keccak256Bytes(
    concatBytes([
      orderType,
      uintWord(BigInt(order.salt)),
      addressWord(order.maker),
      addressWord(order.receiver),
      addressWord(order.makerAsset),
      addressWord(order.takerAsset),
      uintWord(BigInt(order.makingAmount)),
      uintWord(BigInt(order.takingAmount)),
      uintWord(BigInt(order.makerTraits)),
    ]),
  );
  const hash = keccak256Bytes(
    concatBytes([new Uint8Array([0x19, 0x01]), domain, structHash]),
  );
  const orderHash = `0x${bytesToHex(hash)}`;
  return { digest: `keccak256:${bytesToHex(hash)}`, orderHash };
}

export function deriveLimitOrderIdentity(
  intentInput: LimitOrderMakerIntentV1,
  deploymentInput: LimitOrderDeploymentV1,
): LimitOrderIdentityV1 {
  const intent = validateMakerIntent(intentInput);
  const deployment = validateDeployment(deploymentInput);
  if (
    deployment.status !== "active" ||
    deployment.chainId !== intent.chainId ||
    deployment.deploymentId !== intent.deploymentId
  ) {
    throw new TypeError("maker intent requires its exact active deployment");
  }
  const intentDigest = sha256CanonicalJson(intent as unknown as JsonValue);
  const common = {
    account: intent.makerAccount,
    deploymentId: intent.deploymentId,
    chainId: intent.chainId,
    clientRequestId: intent.clientRequestId,
    intentDigest,
  };
  const nonceSeed = identitySeed({
    domain: "cork.operation/v1/limit-order-nonce",
    ...common,
  });
  const nonceOrEpoch = (bytesToBigInt(nonceSeed) & UINT40_MAX).toString();
  const salt = bytesToBigInt(
    identitySeed({
      domain: "cork.operation/v1/limit-order-salt",
      ...common,
    }),
  ).toString();
  const makerTraits = buildMakerTraitsV1({
    partialFillPreference: intent.partialFillPreference,
    nonceOrEpoch,
    expiry: intent.expiry,
  });
  const order: LimitOrderV1 = {
    salt,
    maker: intent.makerAccount.address,
    receiver: intent.receiver,
    makerAsset: intent.makerAsset,
    takerAsset: intent.takerAsset,
    makingAmount: intent.makingAmount,
    takingAmount: intent.takingAmount,
    makerTraits: makerTraits.raw,
  };
  const hash = eip712OrderHash(intent.chainId, order);
  const invalidator =
    makerTraits.invalidatorRegime === "bit-invalidator"
      ? {
          regime: "bit-invalidator" as const,
          slot: (BigInt(nonceOrEpoch) >> 8n).toString(),
          mask: (1n << (BigInt(nonceOrEpoch) & 255n)).toString(),
        }
      : { regime: "remaining-invalidator" as const };
  return deepFreeze({
    intentDigest,
    nonceOrEpoch,
    salt,
    makerTraits,
    invalidator,
    order,
    typedData: {
      domain: {
        name: "1inch Limit Order Protocol",
        version: "4",
        chainId: intent.chainId,
        verifyingContract: LIMIT_ORDER_PROTOCOL_ADDRESS,
      },
      primaryType: "Order",
      message: order,
    },
    typedDataDigest: hash.digest,
    orderHash: hash.orderHash,
  }) as LimitOrderIdentityV1;
}

function validateInvalidatorObservation(
  value: unknown,
): InventoryInvalidatorObservationV1 {
  assertClosedObject(value, "inventory invalidator observation", [
    "regime",
    "canonicalBlockNumber",
    "canonicalBlockHash",
    "parentBlockHash",
    "observedAt",
    "invalidated",
    "rawValue",
  ]);
  if (
    value.regime !== "bit-invalidator" &&
    value.regime !== "remaining-invalidator"
  ) {
    throw new TypeError("inventory invalidator regime is unsupported");
  }
  assertUint256Decimal(value.canonicalBlockNumber, "canonicalBlockNumber");
  assertBytes32(value.canonicalBlockHash, "canonicalBlockHash");
  assertBytes32(value.parentBlockHash, "parentBlockHash");
  assertUint256Decimal(value.observedAt, "observedAt");
  if (typeof value.invalidated !== "boolean") {
    throw new TypeError("invalidated must be boolean");
  }
  assertUint256Decimal(value.rawValue, "rawValue");
  return {
    regime: value.regime,
    canonicalBlockNumber: value.canonicalBlockNumber,
    canonicalBlockHash: value.canonicalBlockHash,
    parentBlockHash: value.parentBlockHash,
    observedAt: value.observedAt,
    invalidated: value.invalidated,
    rawValue: value.rawValue,
  };
}

function validateInventory(value: unknown): MakerOrderInventoryV1 {
  assertClosedObject(value, "maker inventory", [
    "schemaVersion",
    "requestingPrincipal",
    "sourceProfile",
    "maker",
    "makerToken",
    "spender",
    "observedAt",
    "complete",
    "pagesRead",
    "finalCursor",
    "records",
    "warnings",
    "inventoryDigest",
  ]);
  if (value.schemaVersion !== "cork.maker-order-inventory/v1") {
    throw new TypeError("maker inventory schema is unsupported");
  }
  assertNonEmptyString(value.requestingPrincipal, "requestingPrincipal");
  assertNonEmptyString(value.sourceProfile, "sourceProfile");
  assertAddress(value.maker, "inventory.maker");
  assertAddress(value.makerToken, "inventory.makerToken");
  if (value.spender !== LIMIT_ORDER_PROTOCOL_ADDRESS) {
    throw new TypeError("inventory spender is not the pinned protocol");
  }
  assertUint256Decimal(value.observedAt, "inventory.observedAt");
  if (typeof value.complete !== "boolean") {
    throw new TypeError("inventory.complete must be boolean");
  }
  assertUint256Decimal(value.pagesRead, "inventory.pagesRead");
  if (value.finalCursor !== "") {
    throw new TypeError("complete inventory final cursor must be empty");
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.warnings)) {
    throw new TypeError("inventory records and warnings must be arrays");
  }
  const hashes = new Set<string>();
  const records = value.records.map((record, index) => {
    assertClosedObject(record, `inventory.records[${index}]`, [
      "orderHash",
      "submissionDigest",
      "acceptedServiceIdentity",
      "signedOrderPayloadDigest",
      "makerTraits",
      "nonceOrEpoch",
      "invalidatorRegime",
      "indexedStatus",
      "makingAmount",
      "remainingMakingAmount",
      "expiry",
      "invalidatorObservation",
    ]);
    assertBytes32(record.orderHash, `records[${index}].orderHash`);
    if (hashes.has(record.orderHash)) {
      throw new TypeError("inventory order hashes must be deduplicated");
    }
    hashes.add(record.orderHash);
    assertSha256Digest(
      record.submissionDigest,
      `records[${index}].submissionDigest`,
    );
    assertNonEmptyString(
      record.acceptedServiceIdentity,
      `records[${index}].acceptedServiceIdentity`,
    );
    assertSha256Digest(
      record.signedOrderPayloadDigest,
      `records[${index}].signedOrderPayloadDigest`,
    );
    const traits = parseMakerTraitsV1(record.makerTraits as string);
    assertUint256Decimal(record.nonceOrEpoch, `records[${index}].nonceOrEpoch`);
    if (
      record.nonceOrEpoch !== traits.nonceOrEpoch ||
      record.invalidatorRegime !== traits.invalidatorRegime
    ) {
      throw new TypeError("inventory MakerTraits projection does not match");
    }
    if (
      record.indexedStatus !== "accepted" &&
      record.indexedStatus !== "open" &&
      record.indexedStatus !== "partially-filled" &&
      record.indexedStatus !== "unknown"
    ) {
      throw new TypeError("inventory indexed status is terminal or invalid");
    }
    assertUint256Decimal(record.makingAmount, `records[${index}].makingAmount`);
    assertUint256Decimal(
      record.remainingMakingAmount,
      `records[${index}].remainingMakingAmount`,
    );
    assertUint256Decimal(record.expiry, `records[${index}].expiry`);
    const observation = validateInvalidatorObservation(
      record.invalidatorObservation,
    );
    return {
      orderHash: record.orderHash,
      submissionDigest: record.submissionDigest,
      acceptedServiceIdentity: record.acceptedServiceIdentity,
      signedOrderPayloadDigest: record.signedOrderPayloadDigest,
      makerTraits: record.makerTraits as string,
      nonceOrEpoch: record.nonceOrEpoch,
      invalidatorRegime: traits.invalidatorRegime,
      indexedStatus:
        record.indexedStatus as MakerOrderInventoryRecordV1["indexedStatus"],
      makingAmount: record.makingAmount,
      remainingMakingAmount: record.remainingMakingAmount,
      expiry: record.expiry,
      invalidatorObservation: observation,
    };
  });
  const warnings = value.warnings.map((warning, index) => {
    assertNonEmptyString(warning, `warnings[${index}]`);
    return warning;
  });
  assertSha256Digest(value.inventoryDigest, "inventoryDigest");
  const withoutDigest = {
    schemaVersion: "cork.maker-order-inventory/v1" as const,
    requestingPrincipal: value.requestingPrincipal,
    sourceProfile: value.sourceProfile,
    maker: value.maker,
    makerToken: value.makerToken,
    spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
    observedAt: value.observedAt,
    complete: value.complete,
    pagesRead: value.pagesRead,
    finalCursor: "" as const,
    records,
    warnings,
  };
  if (
    sha256CanonicalJson(withoutDigest as unknown as JsonValue) !==
    value.inventoryDigest
  ) {
    throw new TypeError("inventory digest does not match its contents");
  }
  return { ...withoutDigest, inventoryDigest: value.inventoryDigest };
}

export function createMakerOrderInventory(
  input: Omit<MakerOrderInventoryV1, "schemaVersion" | "inventoryDigest">,
): MakerOrderInventoryV1 {
  const withoutDigest = {
    schemaVersion: "cork.maker-order-inventory/v1" as const,
    ...input,
  };
  return validateInventory({
    ...withoutDigest,
    inventoryDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  });
}

function validateIdentityState(value: unknown): LimitOrderIdentityStateV1 {
  assertClosedObject(value, "limit-order identity state", [
    "bitInvalidatorWord",
    "rawRemainingInvalidator",
    "acceptedOrderHashes",
    "finalOrderHashes",
    "conflictingOrderHashes",
  ]);
  assertUint256Decimal(value.bitInvalidatorWord, "bitInvalidatorWord");
  assertUint256Decimal(
    value.rawRemainingInvalidator,
    "rawRemainingInvalidator",
  );
  for (const field of [
    "acceptedOrderHashes",
    "finalOrderHashes",
    "conflictingOrderHashes",
  ] as const) {
    if (!Array.isArray(value[field])) {
      throw new TypeError(`${field} must be an array`);
    }
    for (const [index, hash] of value[field].entries()) {
      assertBytes32(hash, `${field}[${index}]`);
    }
  }
  return {
    bitInvalidatorWord: value.bitInvalidatorWord,
    rawRemainingInvalidator: value.rawRemainingInvalidator,
    acceptedOrderHashes: value.acceptedOrderHashes as string[],
    finalOrderHashes: value.finalOrderHashes as string[],
    conflictingOrderHashes: value.conflictingOrderHashes as string[],
  };
}

function identityAlreadyUsed(
  identity: LimitOrderIdentityV1,
  inventory: MakerOrderInventoryV1,
  state: LimitOrderIdentityStateV1,
): boolean {
  if (
    state.acceptedOrderHashes.includes(identity.orderHash) ||
    state.finalOrderHashes.includes(identity.orderHash) ||
    state.conflictingOrderHashes.includes(identity.orderHash) ||
    inventory.records.some((record) => record.orderHash === identity.orderHash)
  ) {
    return true;
  }
  if (identity.invalidator.regime === "bit-invalidator") {
    const mask = BigInt(identity.invalidator.mask!);
    if ((BigInt(state.bitInvalidatorWord) & mask) !== 0n) return true;
    return inventory.records.some(
      (record) =>
        record.invalidatorRegime === "bit-invalidator" &&
        record.nonceOrEpoch === identity.nonceOrEpoch &&
        BigInt(record.remainingMakingAmount) > 0n,
    );
  }
  return BigInt(state.rawRemainingInvalidator) !== 0n;
}

function checkedTargetAllowance(
  inventory: MakerOrderInventoryV1,
  newAmount: string,
): string | undefined {
  let total = BigInt(newAmount);
  for (const record of inventory.records) {
    total += BigInt(record.remainingMakingAmount);
    if (total > UINT256_MAX) return undefined;
  }
  return total.toString();
}

function approvalTransactions(
  owner: string,
  token: string,
  target: string,
  zeroFirst: boolean,
): readonly LimitOrderTransactionV1[] {
  const targetCall = transaction(
    owner,
    token,
    "approve",
    encodeApprove(LIMIT_ORDER_PROTOCOL_ADDRESS, target),
  );
  if (!zeroFirst) return [targetCall];
  return [
    transaction(
      owner,
      token,
      "approve",
      encodeApprove(LIMIT_ORDER_PROTOCOL_ADDRESS, "0"),
    ),
    targetCall,
  ];
}

export function prepareLimitOrderMaker(
  input: {
    readonly intent: LimitOrderMakerIntentV1;
    readonly deployment: LimitOrderDeploymentV1;
    readonly inventory: MakerOrderInventoryV1;
    readonly identityState: LimitOrderIdentityStateV1;
    readonly currentAllowance: string;
    readonly zeroFirst: boolean;
    readonly authorityMode: "classic-erc20";
  },
  agreementVerifier: LimitOrderAgreementVerifierV1,
): MakerPreparationResultV1 {
  assertClosedObject(input, "maker preparation input", [
    "intent",
    "deployment",
    "inventory",
    "identityState",
    "currentAllowance",
    "zeroFirst",
    "authorityMode",
  ]);
  if (input.authorityMode !== "classic-erc20") {
    throw new TypeError("Permit2 is forbidden for limit orders");
  }
  const intent = validateMakerIntent(input.intent);
  const deployment = validateDeployment(input.deployment);
  const inventory = validateInventory(input.inventory);
  const identityState = validateIdentityState(input.identityState);
  assertUint256Decimal(input.currentAllowance, "currentAllowance");
  if (typeof input.zeroFirst !== "boolean") {
    throw new TypeError("zeroFirst must be boolean");
  }
  if (
    inventory.maker !== intent.makerAccount.address ||
    inventory.makerToken !== intent.makerAsset ||
    inventory.spender !== deployment.protocolAddress
  ) {
    throw new TypeError("maker inventory identity does not match");
  }
  if (!inventory.complete) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-maker/v1",
      outcome: "unavailable",
      code: "MAKER_ORDER_INVENTORY_INCOMPLETE",
    });
  }
  const identity = deriveLimitOrderIdentity(intent, deployment);
  if (
    agreementVerifier.verify({ deployment, identity }) !== true ||
    identityAlreadyUsed(identity, inventory, identityState)
  ) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-maker/v1",
      outcome: "unavailable",
      code: "LIMIT_ORDER_IDENTITY_ALREADY_USED",
    });
  }
  const targetAllowance = checkedTargetAllowance(
    inventory,
    intent.makingAmount,
  );
  if (targetAllowance === undefined) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-maker/v1",
      outcome: "unavailable",
      code: "MAKER_ALLOWANCE_TARGET_OVERFLOW",
    });
  }
  if (BigInt(input.currentAllowance) < BigInt(targetAllowance)) {
    const withoutDigest = {
      schemaVersion: "cork.limit-order-maker/v1" as const,
      outcome: "prerequisite" as const,
      intent,
      deployment,
      inventory,
      identity,
      targetAllowance,
      approvalTransactions: approvalTransactions(
        intent.makerAccount.address,
        intent.makerAsset,
        targetAllowance,
        input.zeroFirst,
      ),
      disclosure: {
        presentedBeforeAuthorization: true as const,
        code: "shared-limit-order-allowance" as const,
        coverage: "cork-service-known-orders-only" as const,
        persistence: "owner-revocation" as const,
        outsideCorkSignatureRisk: true as const,
      },
    };
    return deepFreeze({
      ...withoutDigest,
      preparationDigest: sha256CanonicalJson(
        withoutDigest as unknown as JsonValue,
      ),
    });
  }
  const withoutDigest = {
    schemaVersion: "cork.limit-order-maker/v1" as const,
    outcome: "prepared" as const,
    intent,
    deployment,
    inventory,
    identityState,
    currentAllowance: input.currentAllowance,
    zeroFirst: input.zeroFirst,
    identity,
    targetAllowance,
    extension: "" as const,
    makerPermit2: "0x" as const,
  };
  return deepFreeze({
    ...withoutDigest,
    preparationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  });
}

export function finalizeLimitOrderMaker(
  input: {
    readonly prepared: Extract<
      MakerPreparationResultV1,
      { readonly outcome: "prepared" }
    >;
    readonly signature: string;
  },
  agreementVerifier: LimitOrderAgreementVerifierV1,
  signatureVerifier: LimitOrderSignatureVerifierV1,
): FinalizedSignedOrderV1 {
  assertClosedObject(input, "maker finalization input", [
    "prepared",
    "signature",
  ]);
  assertBytes(input.signature, "maker signature", true);
  const reconstructed = prepareLimitOrderMaker(
    {
      intent: input.prepared.intent,
      deployment: input.prepared.deployment,
      inventory: input.prepared.inventory,
      identityState: input.prepared.identityState,
      currentAllowance: input.prepared.currentAllowance,
      zeroFirst: input.prepared.zeroFirst,
      authorityMode: "classic-erc20",
    },
    agreementVerifier,
  );
  if (
    reconstructed.outcome !== "prepared" ||
    canonicalizeJson(reconstructed as unknown as JsonValue) !==
      canonicalizeJson(input.prepared as unknown as JsonValue)
  ) {
    throw new TypeError("prepared maker artifact does not reconstruct");
  }
  const accountType: MakerAccountTypeV1 =
    reconstructed.intent.makerAccount.kind === "externally-owned-account"
      ? "externally-owned-account"
      : "eip-1271";
  if (
    signatureVerifier.verify({
      accountType,
      signer: reconstructed.intent.makerAccount.address,
      digest: reconstructed.identity.typedDataDigest,
      signature: input.signature,
    }) !== true
  ) {
    throw new TypeError("maker signature verification failed");
  }
  const venueBody = {
    order: reconstructed.identity.order,
    signature: input.signature,
    extension: "" as const,
    makerPermit2: "0x" as const,
    allowsPartialFills:
      reconstructed.intent.partialFillPreference === "partial-multiple-fill",
    expiry: reconstructed.intent.expiry,
    nonce: reconstructed.identity.nonceOrEpoch,
    side: reconstructed.intent.side,
    makerAccountType: accountType,
    orderHash: reconstructed.identity.orderHash,
  };
  const withoutDigest: Omit<FinalizedSignedOrderV1, "finalizedDigest"> = {
    schemaVersion: "cork.limit-order-signed/v1",
    preparedDigest: reconstructed.preparationDigest,
    intent: reconstructed.intent,
    deployment: reconstructed.deployment,
    identity: reconstructed.identity,
    signature: input.signature,
    venueBody,
  };
  return deepFreeze({
    ...withoutDigest,
    finalizedDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as FinalizedSignedOrderV1;
}

export interface LimitOrderTakerIntentV1 {
  readonly schemaVersion: "cork.limit-order-taker-intent/v1";
  readonly signedOrder: FinalizedSignedOrderV1;
  readonly fill:
    | { readonly kind: "full" }
    | { readonly kind: "making-amount"; readonly amount: string };
  readonly takerAccount: AccountV1;
  readonly receiver: string;
  readonly maximumTakingAmount: string;
  readonly deadline: string;
  readonly currentTime: string;
  readonly currentAllowance: string;
  readonly zeroFirst: boolean;
  readonly makerBalance: string;
  readonly makerAllowance: string;
  readonly remainingMakingAmount: string;
}

export type TakerPreparationResultV1 =
  | {
      readonly schemaVersion: "cork.limit-order-taker/v1";
      readonly outcome: "unavailable";
      readonly code: "ORDER_NOT_FILLABLE";
    }
  | {
      readonly schemaVersion: "cork.limit-order-taker/v1";
      readonly outcome: "prerequisite";
      readonly requiredMakingAmount: string;
      readonly requiredTakingAmount: string;
      readonly approvalTransactions: readonly LimitOrderTransactionV1[];
      readonly preparationDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.limit-order-taker/v1";
      readonly outcome: "prepared";
      readonly requiredMakingAmount: string;
      readonly requiredTakingAmount: string;
      readonly fillFunction:
        | "fillOrder"
        | "fillOrderArgs"
        | "fillContractOrder"
        | "fillContractOrderArgs";
      readonly takerTraits: string;
      readonly transaction: LimitOrderTransactionV1;
      readonly constructionIsFill: false;
      readonly preparationDigest: Sha256Digest;
    };

export interface LimitOrderCancellationV1 {
  readonly schemaVersion: "cork.limit-order-cancellation/v1";
  readonly mode: "order-cancel" | "bit-invalidate";
  readonly orderHash: string;
  readonly makerTraits: string;
  readonly nonceOrEpoch: string;
  readonly invalidatorRegime: InvalidationRegimeV1;
  readonly transaction: LimitOrderTransactionV1;
  readonly cancellationDigest: Sha256Digest;
}

export interface LimitOrderTokenRelationshipV1 {
  readonly schemaVersion: "cork.limit-order-token-relationship/v1";
  readonly claim: "manifest-verified-limit-order-token";
  readonly deploymentId: string;
  readonly generation: string;
  readonly status: "active" | "retired" | "emergency-disabled";
  readonly chainId: string;
  readonly role: "maker" | "taker";
  readonly token: string;
  readonly spender: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
  readonly evidenceDigest: Sha256Digest;
}

export interface LimitOrderAllowanceRevocationV1 {
  readonly schemaVersion: "cork.limit-order-allowance-revocation/v1";
  readonly relationship: LimitOrderTokenRelationshipV1;
  readonly owner: AccountV1;
  readonly transaction: LimitOrderTransactionV1;
  readonly revocationDigest: Sha256Digest;
}

export const LIMIT_ORDER_RECONCILIATION_STATES = [
  "not-submitted",
  "accepted",
  "open",
  "partially-filled",
  "filled",
  "cancelled",
  "expired",
  "rejected",
  "unfillable",
  "unknown",
  "conflict",
] as const;

export type LimitOrderReconciliationStatusV1 =
  (typeof LIMIT_ORDER_RECONCILIATION_STATES)[number];

export interface LimitOrderServiceClaimV1 {
  readonly claim: "source-payload";
  readonly bodyDigest: Sha256Digest;
  readonly status:
    | "none"
    | "accepted"
    | "rejected"
    | "open"
    | "partially-filled"
    | "filled"
    | "cancelled"
    | "expired"
    | "unknown";
}

export interface LimitOrderChainReconciliationV1 {
  readonly canonicalBlockNumber: string;
  readonly canonicalBlockHash: string;
  readonly parentBlockHash: string;
  readonly finalized: boolean;
  readonly reorged: boolean;
  readonly event: {
    readonly kind:
      | "none"
      | "OrderFilled"
      | "OrderCancelled"
      | "BitInvalidatorUpdated";
    readonly orderHash: string;
    readonly canonical: boolean;
  };
  readonly invalidated: boolean;
  readonly remainingMakingAmount: string;
  readonly expiry: string;
  readonly currentTime: string;
  readonly makerBalance: string;
  readonly makerAllowance: string;
}

export interface LimitOrderReconciliationV1 {
  readonly schemaVersion: "cork.limit-order-reconciliation/v1";
  readonly orderHash: string;
  readonly status: LimitOrderReconciliationStatusV1;
  readonly service: LimitOrderServiceClaimV1;
  readonly chain: LimitOrderChainReconciliationV1;
  readonly spendableMakingAmount: string;
  readonly provenance: {
    readonly chainAuthoritative: true;
    readonly servicePayloadPreserved: true;
  };
  readonly reconciliationDigest: Sha256Digest;
}

function validateSignedOrder(
  value: unknown,
  agreementVerifier: LimitOrderAgreementVerifierV1,
  signatureVerifier: LimitOrderSignatureVerifierV1,
): FinalizedSignedOrderV1 {
  assertClosedObject(value, "signed order", [
    "schemaVersion",
    "preparedDigest",
    "intent",
    "deployment",
    "identity",
    "signature",
    "venueBody",
    "finalizedDigest",
  ]);
  if (value.schemaVersion !== "cork.limit-order-signed/v1") {
    throw new TypeError("signed order schema is unsupported");
  }
  assertSha256Digest(value.preparedDigest, "preparedDigest");
  const intent = validateMakerIntent(value.intent);
  const deployment = validateDeployment(value.deployment);
  const identity = deriveLimitOrderIdentity(intent, deployment);
  if (
    agreementVerifier.verify({ deployment, identity }) !== true ||
    canonicalizeJson(identity as unknown as JsonValue) !==
      canonicalizeJson(value.identity as unknown as JsonValue)
  ) {
    throw new TypeError("signed order identity does not reconstruct");
  }
  assertBytes(value.signature, "signed order signature", true);
  const accountType: MakerAccountTypeV1 =
    intent.makerAccount.kind === "externally-owned-account"
      ? "externally-owned-account"
      : "eip-1271";
  if (
    signatureVerifier.verify({
      accountType,
      signer: intent.makerAccount.address,
      digest: identity.typedDataDigest,
      signature: value.signature,
    }) !== true
  ) {
    throw new TypeError("signed order signature is invalid");
  }
  assertClosedObject(value.venueBody, "venue body", [
    "order",
    "signature",
    "extension",
    "makerPermit2",
    "allowsPartialFills",
    "expiry",
    "nonce",
    "side",
    "makerAccountType",
    "orderHash",
  ]);
  const expectedVenue = {
    order: identity.order,
    signature: value.signature,
    extension: "" as const,
    makerPermit2: "0x" as const,
    allowsPartialFills:
      intent.partialFillPreference === "partial-multiple-fill",
    expiry: intent.expiry,
    nonce: identity.nonceOrEpoch,
    side: intent.side,
    makerAccountType: accountType,
    orderHash: identity.orderHash,
  };
  if (
    canonicalizeJson(expectedVenue as unknown as JsonValue) !==
    canonicalizeJson(value.venueBody as unknown as JsonValue)
  ) {
    throw new TypeError("venue compatibility fields are caller-substituted");
  }
  const withoutDigest: Omit<FinalizedSignedOrderV1, "finalizedDigest"> = {
    schemaVersion: "cork.limit-order-signed/v1",
    preparedDigest: value.preparedDigest,
    intent,
    deployment,
    identity,
    signature: value.signature,
    venueBody: expectedVenue,
  };
  assertSha256Digest(value.finalizedDigest, "finalizedDigest");
  if (
    sha256CanonicalJson(withoutDigest as unknown as JsonValue) !==
    value.finalizedDigest
  ) {
    throw new TypeError("signed order digest does not match");
  }
  return { ...withoutDigest, finalizedDigest: value.finalizedDigest };
}

export function verifyFinalizedLimitOrder(
  value: unknown,
  agreementVerifier: LimitOrderAgreementVerifierV1,
  signatureVerifier: LimitOrderSignatureVerifierV1,
): FinalizedSignedOrderV1 {
  return deepFreeze(
    validateSignedOrder(value, agreementVerifier, signatureVerifier),
  ) as FinalizedSignedOrderV1;
}

export function prepareLimitOrderTaker(
  input: LimitOrderTakerIntentV1,
  agreementVerifier: LimitOrderAgreementVerifierV1,
  signatureVerifier: LimitOrderSignatureVerifierV1,
): TakerPreparationResultV1 {
  assertClosedObject(input, "taker intent", [
    "schemaVersion",
    "signedOrder",
    "fill",
    "takerAccount",
    "receiver",
    "maximumTakingAmount",
    "deadline",
    "currentTime",
    "currentAllowance",
    "zeroFirst",
    "makerBalance",
    "makerAllowance",
    "remainingMakingAmount",
  ]);
  if (input.schemaVersion !== "cork.limit-order-taker-intent/v1") {
    throw new TypeError("taker intent schema is unsupported");
  }
  const signedOrder = validateSignedOrder(
    input.signedOrder,
    agreementVerifier,
    signatureVerifier,
  );
  assertClosedObject(
    input.fill,
    "fill",
    ["kind"],
    input.fill.kind === "making-amount" ? ["amount"] : [],
  );
  if (input.fill.kind !== "full" && input.fill.kind !== "making-amount") {
    throw new TypeError("fill kind is unsupported");
  }
  assertAccount(input.takerAccount, "takerAccount");
  assertAddress(input.receiver, "receiver");
  for (const [label, value] of [
    ["maximumTakingAmount", input.maximumTakingAmount],
    ["deadline", input.deadline],
    ["currentTime", input.currentTime],
    ["currentAllowance", input.currentAllowance],
    ["makerBalance", input.makerBalance],
    ["makerAllowance", input.makerAllowance],
    ["remainingMakingAmount", input.remainingMakingAmount],
  ] as const) {
    assertUint256Decimal(value, label);
  }
  if (
    BigInt(input.currentTime) >= BigInt(input.deadline) ||
    BigInt(input.currentTime) >= BigInt(signedOrder.intent.expiry)
  ) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-taker/v1",
      outcome: "unavailable",
      code: "ORDER_NOT_FILLABLE",
    });
  }
  if (typeof input.zeroFirst !== "boolean") {
    throw new TypeError("zeroFirst must be boolean");
  }
  let requiredMakingAmount = input.remainingMakingAmount;
  if (input.fill.kind === "making-amount") {
    assertUint256Decimal(input.fill.amount, "fill.amount");
    requiredMakingAmount = input.fill.amount;
  }
  if (
    requiredMakingAmount === "0" ||
    BigInt(requiredMakingAmount) > BigInt(input.remainingMakingAmount)
  ) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-taker/v1",
      outcome: "unavailable",
      code: "ORDER_NOT_FILLABLE",
    });
  }
  const makerSpendable =
    BigInt(input.makerBalance) < BigInt(input.makerAllowance)
      ? BigInt(input.makerBalance)
      : BigInt(input.makerAllowance);
  if (makerSpendable < BigInt(requiredMakingAmount)) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-taker/v1",
      outcome: "unavailable",
      code: "ORDER_NOT_FILLABLE",
    });
  }
  const numerator =
    BigInt(signedOrder.identity.order.takingAmount) *
    BigInt(requiredMakingAmount);
  const denominator = BigInt(signedOrder.identity.order.makingAmount);
  const requiredTakingAmount = (
    (numerator + denominator - 1n) /
    denominator
  ).toString();
  if (BigInt(input.maximumTakingAmount) > TAKER_THRESHOLD_MAX) {
    throw new RangeError(
      "maximumTakingAmount exceeds the TakerTraits threshold",
    );
  }
  if (BigInt(requiredTakingAmount) > BigInt(input.maximumTakingAmount)) {
    return deepFreeze({
      schemaVersion: "cork.limit-order-taker/v1",
      outcome: "unavailable",
      code: "ORDER_NOT_FILLABLE",
    });
  }
  if (BigInt(input.currentAllowance) < BigInt(requiredTakingAmount)) {
    const withoutDigest = {
      schemaVersion: "cork.limit-order-taker/v1" as const,
      outcome: "prerequisite" as const,
      requiredMakingAmount,
      requiredTakingAmount,
      approvalTransactions: approvalTransactions(
        input.takerAccount.address,
        signedOrder.intent.takerAsset,
        requiredTakingAmount,
        input.zeroFirst,
      ),
    };
    return deepFreeze({
      ...withoutDigest,
      preparationDigest: sha256CanonicalJson(
        withoutDigest as unknown as JsonValue,
      ),
    });
  }
  const makerContract = signedOrder.venueBody.makerAccountType === "eip-1271";
  const needsArgs = input.receiver !== input.takerAccount.address;
  const fillFunction: Extract<
    TakerPreparationResultV1,
    { readonly outcome: "prepared" }
  >["fillFunction"] = makerContract
    ? needsArgs
      ? "fillContractOrderArgs"
      : "fillContractOrder"
    : needsArgs
      ? "fillOrderArgs"
      : "fillOrder";
  const receiverIsExplicit = input.receiver !== input.takerAccount.address;
  const takerTraits = (
    (1n << 255n) |
    (receiverIsExplicit ? 1n << 251n : 0n) |
    BigInt(input.maximumTakingAmount)
  ).toString();
  const calldata = encodeFillCall({
    functionName: fillFunction,
    order: signedOrder.identity.order,
    signature: signedOrder.signature,
    amount: requiredMakingAmount,
    takerTraits,
    args: receiverIsExplicit ? input.receiver : "0x",
  });
  const withoutDigest = {
    schemaVersion: "cork.limit-order-taker/v1" as const,
    outcome: "prepared" as const,
    requiredMakingAmount,
    requiredTakingAmount,
    fillFunction,
    takerTraits,
    transaction: transaction(
      input.takerAccount.address,
      LIMIT_ORDER_PROTOCOL_ADDRESS,
      fillFunction,
      calldata,
    ),
    constructionIsFill: false as const,
  };
  return deepFreeze({
    ...withoutDigest,
    preparationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  });
}

export function prepareLimitOrderCancellation(
  input: {
    readonly signedOrder: FinalizedSignedOrderV1;
    readonly mode: "order-cancel" | "bit-invalidate";
    readonly currentInvalidatorRaw: string;
  },
  agreementVerifier: LimitOrderAgreementVerifierV1,
  signatureVerifier: LimitOrderSignatureVerifierV1,
): LimitOrderCancellationV1 {
  assertClosedObject(input, "cancellation input", [
    "signedOrder",
    "mode",
    "currentInvalidatorRaw",
  ]);
  const signedOrder = validateSignedOrder(
    input.signedOrder,
    agreementVerifier,
    signatureVerifier,
  );
  assertUint256Decimal(input.currentInvalidatorRaw, "currentInvalidatorRaw");
  if (input.mode !== "order-cancel" && input.mode !== "bit-invalidate") {
    throw new TypeError("cancellation mode is unsupported");
  }
  if (
    input.mode === "bit-invalidate" &&
    signedOrder.identity.invalidator.regime !== "bit-invalidator"
  ) {
    throw new TypeError("bit invalidation is only available for single-fill");
  }
  const currentInvalidatorRaw = BigInt(input.currentInvalidatorRaw);
  if (
    signedOrder.identity.invalidator.regime === "bit-invalidator" &&
    (currentInvalidatorRaw & BigInt(signedOrder.identity.invalidator.mask!)) !==
      0n
  ) {
    throw new TypeError("limit order is already bit-invalidated");
  }
  if (
    signedOrder.identity.invalidator.regime === "remaining-invalidator" &&
    currentInvalidatorRaw === UINT256_MAX
  ) {
    throw new TypeError("limit order is already fully invalidated");
  }
  const functionName =
    input.mode === "order-cancel" ? "cancelOrder" : "bitsInvalidateForOrder";
  const calldata =
    input.mode === "order-cancel"
      ? encodeStaticCall("cancelOrder(uint256,bytes32)", [
          uintWord(BigInt(signedOrder.identity.makerTraits.raw)),
          hexToBytes(signedOrder.identity.orderHash),
        ])
      : encodeStaticCall("bitsInvalidateForOrder(uint256,uint256)", [
          uintWord(BigInt(signedOrder.identity.makerTraits.raw)),
          uintWord(0n),
        ]);
  const withoutDigest: Omit<LimitOrderCancellationV1, "cancellationDigest"> = {
    schemaVersion: "cork.limit-order-cancellation/v1",
    mode: input.mode,
    orderHash: signedOrder.identity.orderHash,
    makerTraits: signedOrder.identity.makerTraits.raw,
    nonceOrEpoch: signedOrder.identity.nonceOrEpoch,
    invalidatorRegime: signedOrder.identity.invalidator.regime,
    transaction: transaction(
      signedOrder.intent.makerAccount.address,
      LIMIT_ORDER_PROTOCOL_ADDRESS,
      functionName,
      calldata,
    ),
  };
  return deepFreeze({
    ...withoutDigest,
    cancellationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as LimitOrderCancellationV1;
}

function validateTokenRelationship(
  value: unknown,
): LimitOrderTokenRelationshipV1 {
  assertClosedObject(value, "limit-order token relationship", [
    "schemaVersion",
    "claim",
    "deploymentId",
    "generation",
    "status",
    "chainId",
    "role",
    "token",
    "spender",
    "evidenceDigest",
  ]);
  if (
    value.schemaVersion !== "cork.limit-order-token-relationship/v1" ||
    value.claim !== "manifest-verified-limit-order-token" ||
    value.spender !== LIMIT_ORDER_PROTOCOL_ADDRESS
  ) {
    throw new TypeError(
      "limit-order token relationship is not manifest-derived",
    );
  }
  assertNonEmptyString(value.deploymentId, "relationship.deploymentId");
  assertUint256Decimal(value.generation, "relationship.generation");
  if (
    value.status !== "active" &&
    value.status !== "retired" &&
    value.status !== "emergency-disabled"
  ) {
    throw new TypeError("relationship status is unsupported");
  }
  assertUint256Decimal(value.chainId, "relationship.chainId");
  if (value.role !== "maker" && value.role !== "taker") {
    throw new TypeError("relationship role is unsupported");
  }
  assertAddress(value.token, "relationship.token");
  assertSha256Digest(value.evidenceDigest, "relationship.evidenceDigest");
  return {
    schemaVersion: "cork.limit-order-token-relationship/v1",
    claim: "manifest-verified-limit-order-token",
    deploymentId: value.deploymentId,
    generation: value.generation,
    status: value.status,
    chainId: value.chainId,
    role: value.role,
    token: value.token,
    spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
    evidenceDigest: value.evidenceDigest,
  };
}

export function prepareLimitOrderAllowanceRevocation(
  input: {
    readonly deploymentEvidence: LimitOrderDeploymentEvidenceInputV1;
    readonly market: LimitOrderVerifiedMarketReferenceV1;
    readonly role: "maker" | "taker";
    readonly owner: AccountV1;
  },
  verifier: BrowserSignatureVerifierV1,
): LimitOrderAllowanceRevocationV1 {
  assertClosedObject(input, "allowance revocation input", [
    "deploymentEvidence",
    "market",
    "role",
    "owner",
  ]);
  if (input.role !== "maker" && input.role !== "taker") {
    throw new TypeError("relationship role is unsupported");
  }
  const { deployment, pool, generation } = resolveLimitOrderAuthority(
    input.deploymentEvidence,
    verifier,
    false,
  );
  const market = validateMarket(input.market);
  if (
    market.chainId !== deployment.chainId ||
    market.deploymentId !== deployment.deploymentId ||
    market.poolId !== pool.poolId ||
    ![
      pool.collateralAsset,
      pool.referenceAsset,
      pool.cptAddress,
      pool.cstAddress,
    ].includes(market.makerAsset) ||
    ![
      pool.collateralAsset,
      pool.referenceAsset,
      pool.cptAddress,
      pool.cstAddress,
    ].includes(market.takerAsset)
  ) {
    throw new TypeError("revocation market is not bound to the manifest pool");
  }
  const relationship = validateTokenRelationship({
    schemaVersion: "cork.limit-order-token-relationship/v1",
    claim: "manifest-verified-limit-order-token",
    deploymentId: deployment.deploymentId,
    generation,
    status: deployment.status,
    chainId: deployment.chainId,
    role: input.role,
    token: input.role === "maker" ? market.makerAsset : market.takerAsset,
    spender: deployment.protocolAddress,
    evidenceDigest: pool.relationshipDigest,
  });
  assertAccount(input.owner, "owner");
  const owner = {
    kind: input.owner.kind,
    address: input.owner.address,
  };
  const withoutDigest: Omit<
    LimitOrderAllowanceRevocationV1,
    "revocationDigest"
  > = {
    schemaVersion: "cork.limit-order-allowance-revocation/v1",
    relationship,
    owner,
    transaction: transaction(
      owner.address,
      relationship.token,
      "approve",
      encodeApprove(LIMIT_ORDER_PROTOCOL_ADDRESS, "0"),
    ),
  };
  return deepFreeze({
    ...withoutDigest,
    revocationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as LimitOrderAllowanceRevocationV1;
}

function validateServiceClaim(value: unknown): LimitOrderServiceClaimV1 {
  assertClosedObject(value, "service claim", ["claim", "bodyDigest", "status"]);
  if (value.claim !== "source-payload") {
    throw new TypeError("service evidence must remain a source-payload claim");
  }
  assertSha256Digest(value.bodyDigest, "service.bodyDigest");
  if (
    value.status !== "none" &&
    value.status !== "accepted" &&
    value.status !== "rejected" &&
    value.status !== "open" &&
    value.status !== "partially-filled" &&
    value.status !== "filled" &&
    value.status !== "cancelled" &&
    value.status !== "expired" &&
    value.status !== "unknown"
  ) {
    throw new TypeError("service status is unsupported");
  }
  return {
    claim: "source-payload",
    bodyDigest: value.bodyDigest,
    status: value.status,
  };
}

function validateChainReconciliation(
  value: unknown,
  orderHash: string,
): LimitOrderChainReconciliationV1 {
  assertClosedObject(value, "chain reconciliation", [
    "canonicalBlockNumber",
    "canonicalBlockHash",
    "parentBlockHash",
    "finalized",
    "reorged",
    "event",
    "invalidated",
    "remainingMakingAmount",
    "expiry",
    "currentTime",
    "makerBalance",
    "makerAllowance",
  ]);
  assertUint256Decimal(value.canonicalBlockNumber, "canonicalBlockNumber");
  assertBytes32(value.canonicalBlockHash, "canonicalBlockHash");
  assertBytes32(value.parentBlockHash, "parentBlockHash");
  if (
    typeof value.finalized !== "boolean" ||
    typeof value.reorged !== "boolean" ||
    typeof value.invalidated !== "boolean"
  ) {
    throw new TypeError("chain boolean evidence is invalid");
  }
  assertClosedObject(value.event, "chain event", [
    "kind",
    "orderHash",
    "canonical",
  ]);
  if (
    value.event.kind !== "none" &&
    value.event.kind !== "OrderFilled" &&
    value.event.kind !== "OrderCancelled" &&
    value.event.kind !== "BitInvalidatorUpdated"
  ) {
    throw new TypeError("chain event kind is unsupported");
  }
  assertBytes32(value.event.orderHash, "event.orderHash");
  if (typeof value.event.canonical !== "boolean") {
    throw new TypeError("event.canonical must be boolean");
  }
  assertUint256Decimal(value.remainingMakingAmount, "remainingMakingAmount");
  assertUint256Decimal(value.expiry, "expiry");
  assertUint256Decimal(value.currentTime, "currentTime");
  assertUint256Decimal(value.makerBalance, "makerBalance");
  assertUint256Decimal(value.makerAllowance, "makerAllowance");
  return {
    canonicalBlockNumber: value.canonicalBlockNumber,
    canonicalBlockHash: value.canonicalBlockHash,
    parentBlockHash: value.parentBlockHash,
    finalized: value.finalized,
    reorged: value.reorged,
    event: {
      kind: value.event.kind,
      orderHash: value.event.orderHash,
      canonical: value.event.canonical,
    },
    invalidated: value.invalidated,
    remainingMakingAmount: value.remainingMakingAmount,
    expiry: value.expiry,
    currentTime: value.currentTime,
    makerBalance: value.makerBalance,
    makerAllowance: value.makerAllowance,
  };
}

export function reconcileLimitOrder(input: {
  readonly signedOrder: FinalizedSignedOrderV1;
  readonly submitted: boolean;
  readonly service: LimitOrderServiceClaimV1;
  readonly chain: LimitOrderChainReconciliationV1;
}): LimitOrderReconciliationV1 {
  assertClosedObject(input, "limit-order reconciliation input", [
    "signedOrder",
    "submitted",
    "service",
    "chain",
  ]);
  assertBytes32(input.signedOrder.identity.orderHash, "orderHash");
  if (typeof input.submitted !== "boolean") {
    throw new TypeError("submitted must be boolean");
  }
  const service = validateServiceClaim(input.service);
  const chain = validateChainReconciliation(
    input.chain,
    input.signedOrder.identity.orderHash,
  );
  const orderHash = input.signedOrder.identity.orderHash;
  const eventHostile =
    chain.event.kind !== "none" &&
    (chain.event.orderHash !== orderHash || !chain.event.canonical);
  const spendable =
    BigInt(chain.makerBalance) < BigInt(chain.makerAllowance)
      ? BigInt(chain.makerBalance)
      : BigInt(chain.makerAllowance);
  const remaining = BigInt(chain.remainingMakingAmount);
  const makingAmount = BigInt(input.signedOrder.identity.order.makingAmount);
  const cancellationEvent =
    chain.event.kind === "OrderCancelled" ||
    chain.event.kind === "BitInvalidatorUpdated";
  let status: LimitOrderReconciliationStatusV1;
  if (eventHostile || remaining > makingAmount) {
    status = "conflict";
  } else if (chain.reorged || !chain.finalized) {
    status =
      service.status === "filled" ||
      service.status === "cancelled" ||
      service.status === "rejected"
        ? "conflict"
        : "unknown";
  } else if (service.status === "rejected") {
    status =
      chain.event.kind === "none" &&
      !chain.invalidated &&
      remaining === makingAmount
        ? "rejected"
        : "conflict";
  } else if (
    service.status === "filled" &&
    (remaining !== 0n || chain.event.kind !== "OrderFilled")
  ) {
    status = "conflict";
  } else if (
    service.status === "cancelled" &&
    (!chain.invalidated || chain.event.kind === "OrderFilled")
  ) {
    status = "conflict";
  } else if (
    !input.submitted &&
    service.status === "none" &&
    chain.event.kind === "none" &&
    !chain.invalidated &&
    remaining === makingAmount
  ) {
    status = "not-submitted";
  } else if (
    service.status === "accepted" &&
    chain.canonicalBlockNumber === "0" &&
    chain.event.kind === "none" &&
    !chain.invalidated
  ) {
    status = "accepted";
  } else if (chain.event.kind === "OrderFilled") {
    status =
      remaining === 0n
        ? "filled"
        : remaining < makingAmount
          ? "partially-filled"
          : "conflict";
  } else if (cancellationEvent) {
    status = chain.invalidated ? "cancelled" : "conflict";
  } else if (service.status === "cancelled" && chain.invalidated) {
    status = "cancelled";
  } else if (chain.invalidated) {
    status = "unknown";
  } else if (BigInt(chain.currentTime) >= BigInt(chain.expiry)) {
    status = "expired";
  } else if (remaining > 0n && remaining < makingAmount) {
    status = "partially-filled";
  } else if (remaining === makingAmount && spendable < remaining) {
    status = "unfillable";
  } else if (
    remaining === makingAmount &&
    spendable >= remaining &&
    service.status === "open"
  ) {
    status = "open";
  } else {
    status = "unknown";
  }
  const withoutDigest: Omit<
    LimitOrderReconciliationV1,
    "reconciliationDigest"
  > = {
    schemaVersion: "cork.limit-order-reconciliation/v1",
    orderHash,
    status,
    service,
    chain,
    spendableMakingAmount: spendable.toString(),
    provenance: {
      chainAuthoritative: true,
      servicePayloadPreserved: true,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reconciliationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as LimitOrderReconciliationV1;
}
