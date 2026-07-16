import {
  assertAccount,
  assertClosedObject,
  assertKeccak256Digest,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  deriveOperationId,
  keccak256Bytes,
  keccak256Digest,
  sha256CanonicalJson,
  type AccountV1,
  type CoreBuildV1,
  type JsonValue,
  type Keccak256Digest,
  type OperationIdV1,
  type Sha256Digest,
} from "./kernel.js";
import { CAPPED_INPUT_CAPABILITY_IDS } from "./capabilities.js";
import { establishPureQuorum } from "./quorum.js";
import {
  createFrozenExecution,
  createSimulationAttestation,
  validateFrozenExecution,
  type AccountWrapperV1,
  type FrozenExecutionV1,
  type SimulationAttestationV1,
  type SimulationOutcomeV1,
} from "./simulation.js";
import {
  findDeploymentContract,
  findDeploymentPool,
  verifyDeploymentManifest,
  type BrowserSignatureVerifierV1,
  type DeploymentPoolBindingV1,
  type GenerationEvidenceRootsInputV1,
} from "./evidence.js";

export interface UnwindIntentV1 {
  readonly schemaVersion: "cork.operation/v1";
  readonly action: "phoenix.unwind-mint";
  readonly clientRequestId: string;
  readonly account: AccountV1;
  readonly chainId: string;
  readonly deploymentId: string;
  readonly poolId: string;
  readonly requestedSharesIn: string;
  readonly receiver: string;
  readonly minCollateralAssetsOut: string;
  readonly deadline: string;
}

export interface UnwindBindingsV1 {
  readonly deploymentId: string;
  readonly generation: string;
  readonly status: "active";
  readonly manifestDigest: Sha256Digest;
  readonly chainId: string;
  readonly permit2: string;
  readonly bundler3: string;
  readonly corkAdapter: string;
  readonly cptAddress: string;
  readonly cstAddress: string;
  readonly poolCollateralDecimals: string;
  readonly liveCollateralDecimals: string;
  readonly collateralPrecisionEvidenceDigest: Sha256Digest;
  readonly preparedAt: string;
  readonly adapterStartingBalancesDigest: Sha256Digest;
}

export interface UnwindBindingEvidenceInputV1 {
  readonly evidenceRoots: GenerationEvidenceRootsInputV1;
  readonly liveCollateralDecimals: string;
  readonly preparedAt: string;
  readonly adapterStartingBalancesDigest: Sha256Digest;
}

export interface PermitAuthorizationRequestV1 {
  readonly id: "permit-cpt" | "permit-cst";
  readonly tokenRole: "cpt" | "cst";
  readonly signer: string;
  readonly validationMode:
    | "externally-owned-account-typed-data"
    | "safe-contract-signature";
  readonly typedData: {
    readonly domain: {
      readonly name: "Permit2";
      readonly chainId: string;
      readonly verifyingContract: string;
    };
    readonly primaryType: "PermitTransferFrom";
    readonly permitted: {
      readonly token: string;
      readonly amount: string;
    };
    readonly spender: string;
    readonly nonce: string;
    readonly deadline: string;
  };
  readonly typedDataDigest: Sha256Digest;
  readonly nonce: string;
  readonly wordPosition: string;
  readonly bitPosition: string;
  readonly insertion: {
    readonly callIndex: "0" | "1";
    readonly abiField: "signature";
  };
}

export interface ActionCallTemplateV1 {
  readonly index: string;
  readonly to: string;
  readonly value: "0";
  readonly functionName: string;
  readonly functionSelector: string;
  readonly arguments: readonly JsonValue[];
  readonly unresolvedFields: readonly string[];
  readonly skipRevert: false;
  readonly callbackHash: string;
}

export interface PreparedPairedSharesUnwindV1 {
  readonly schemaVersion: "cork.prepared-unwind/v1";
  readonly operationId: OperationIdV1;
  readonly intentDigest: Sha256Digest;
  readonly intent: UnwindIntentV1;
  readonly bindings: UnwindBindingsV1;
  readonly constraints: {
    readonly requestedSharesIn: string;
    readonly effectiveSharesIn: string;
    readonly shareQuantum: string;
    readonly minCollateralAssetsOut: string;
    readonly receiver: string;
    readonly transactionValue: "0";
    readonly callCount: "3";
  };
  readonly authorizations: readonly [
    PermitAuthorizationRequestV1,
    PermitAuthorizationRequestV1,
  ];
  readonly callTemplates: readonly [
    ActionCallTemplateV1,
    ActionCallTemplateV1,
    ActionCallTemplateV1,
  ];
  readonly preparedDigest: Sha256Digest;
}

export interface AuthorizationSignatureArtifactV1 {
  readonly id: "permit-cpt" | "permit-cst";
  readonly signature: string;
}

export interface AuthorizationVerificationInputV1 {
  readonly requirement: PermitAuthorizationRequestV1;
  readonly signature: string;
}

export interface AuthorizationSignatureVerifierV1 {
  verify(input: AuthorizationVerificationInputV1): boolean;
}

export interface FrozenActionCallV1 {
  readonly index: string;
  readonly to: string;
  readonly value: "0";
  readonly functionName: string;
  readonly functionSelector: string;
  readonly arguments: readonly JsonValue[];
  readonly calldata: string;
  readonly calldataDigest: Keccak256Digest;
  readonly skipRevert: false;
  readonly callbackHash: string;
}

export interface FinalizedPairedSharesUnwindV1 {
  readonly schemaVersion: "cork.finalized-unwind/v1";
  readonly operationId: OperationIdV1;
  readonly intentDigest: Sha256Digest;
  readonly preparedDigest: Sha256Digest;
  readonly finalizedAt: string;
  readonly intent: UnwindIntentV1;
  readonly bindings: UnwindBindingsV1;
  readonly constraints: PreparedPairedSharesUnwindV1["constraints"];
  readonly authorizations: PreparedPairedSharesUnwindV1["authorizations"];
  readonly signatureArtifacts: readonly [
    AuthorizationSignatureArtifactV1,
    AuthorizationSignatureArtifactV1,
  ];
  readonly calls: readonly [
    FrozenActionCallV1,
    FrozenActionCallV1,
    FrozenActionCallV1,
  ];
  readonly bundlerData: string;
  readonly payloadDigest: Keccak256Digest;
  readonly execution: {
    readonly kind: "bundler-call";
    readonly sender: string;
    readonly to: string;
    readonly value: "0";
    readonly data: string;
    readonly chainId: string;
  };
  readonly executionDigest: Sha256Digest;
  readonly expectedEffects: {
    readonly cptConsumed: string;
    readonly cstConsumed: string;
    readonly minimumCollateralToReceiver: string;
    readonly adapterBalancesReturnToStart: true;
  };
  readonly finalizedDigest: Sha256Digest;
}

export type FundingProofV1 =
  | {
      readonly mode: "token-allowance" | "permit2-allowance";
      readonly token: string;
      readonly amount: string;
      readonly authorizationDigest: Sha256Digest;
    }
  | {
      readonly mode: "permit2-signature";
      readonly token: string;
      readonly amount: string;
      readonly nonce: string;
      readonly deadline: string;
      readonly signature: string;
      readonly authorizationDigest: Sha256Digest;
    };

export interface ExactSpendContextV1 {
  readonly deploymentId: string;
  readonly generation: string;
  readonly manifestDigest: Sha256Digest;
  readonly chainId: string;
  readonly poolId: string;
  readonly account: AccountV1;
  readonly bundler3: string;
  readonly corkAdapter: string;
  readonly receiver: string;
  readonly deadline: string;
  readonly currentTime: string;
  readonly phase: "pre-expiry" | "post-expiry";
  readonly paused: boolean;
  readonly adapterWhitelisted: true;
  readonly funding: readonly FundingProofV1[];
  readonly adapterStartingBalancesDigest: Sha256Digest;
}

export interface ExactSpendContextInputV1 {
  readonly evidenceRoots: GenerationEvidenceRootsInputV1;
  readonly poolId: string;
  readonly account: AccountV1;
  readonly receiver: string;
  readonly deadline: string;
  readonly currentTime: string;
  readonly funding: readonly FundingProofV1[];
  readonly adapterStartingBalancesDigest: Sha256Digest;
}

export interface PreparedExactSpendActionV1 {
  readonly schemaVersion: "cork.exact-spend-action/v1";
  readonly profile:
    | "mint-collateral-in"
    | "mint-paired-shares-out"
    | "repurchase-collateral-in-for-swap"
    | "unwind-collateral-out"
    | "redeem-principal-token-in";
  readonly context: ExactSpendContextV1;
  readonly profileBindings: readonly {
    readonly field: string;
    readonly value: JsonValue;
  }[];
  readonly fundingCalls: readonly FrozenActionCallV1[];
  readonly protectedCall: FrozenActionCallV1;
  readonly bundlerData: string;
  readonly payloadDigest: Keccak256Digest;
  readonly expectedEffects: readonly string[];
  readonly residualPreservation: {
    readonly adapterBalancesReturnToStart: true;
    readonly actionCreatedAllowancesReturnToZero: true;
  };
  readonly reconciliationProjection: readonly string[];
  readonly actionDigest: Sha256Digest;
}

export interface ExactSpendFundingVerificationInputV1 {
  readonly profile: PreparedExactSpendActionV1["profile"];
  readonly account: AccountV1;
  readonly corkAdapter: string;
  readonly proof: FundingProofV1;
}

export interface ExactSpendProfileStateVerificationInputV1 {
  readonly profile: PreparedExactSpendActionV1["profile"];
  readonly context: ExactSpendContextV1;
  readonly profileBindings: PreparedExactSpendActionV1["profileBindings"];
  readonly protectedCall: FrozenActionCallV1;
}

export interface ExactSpendFinalizationVerifierV1 {
  verifyFunding(input: ExactSpendFundingVerificationInputV1): boolean;
  verifyProfileState(input: ExactSpendProfileStateVerificationInputV1): boolean;
}

export interface ExactSpendFinalizationInputV1 {
  readonly prepared: PreparedExactSpendActionV1;
  readonly evidenceRoots: GenerationEvidenceRootsInputV1;
  readonly finalizedAt: string;
  readonly accountWrapper?: AccountWrapperV1;
}

export interface FinalizedExactSpendActionV1 {
  readonly schemaVersion: "cork.finalized-exact-spend-action/v1";
  readonly profile: PreparedExactSpendActionV1["profile"];
  readonly preparedDigest: Sha256Digest;
  readonly finalizedAt: string;
  readonly prepared: PreparedExactSpendActionV1;
  readonly execution: FrozenExecutionV1;
  readonly expectedEffects: readonly string[];
  readonly residualPreservation: PreparedExactSpendActionV1["residualPreservation"];
  readonly reconciliationProjection: readonly string[];
  readonly finalizedDigest: Sha256Digest;
}

export interface ExactSpendSimulationInputV1 {
  readonly finalized: FinalizedExactSpendActionV1;
  readonly producerBuild: CoreBuildV1;
  readonly providerIds: readonly string[];
  readonly block?: {
    readonly blockNumber: string;
    readonly blockHash: string;
  };
  readonly simulatedAt: string;
  readonly outcome: SimulationOutcomeV1;
}

export interface ExactSpendChainEvidenceV1 {
  readonly schemaVersion: "cork.exact-spend-chain-evidence/v1";
  readonly transactionHash: string;
  readonly chainId: string;
  readonly sender: string;
  readonly target: string;
  readonly value: "0";
  readonly payloadDigest: Keccak256Digest;
  readonly executionDigest: Sha256Digest;
  readonly receiptStatus: "not-found" | "pending" | "success" | "revert";
  readonly canonical: boolean;
  readonly finalized: boolean;
  readonly adapterStartingBalancesDigest: Sha256Digest;
  readonly adapterEndingBalancesDigest: Sha256Digest;
  readonly actionCreatedAllowancesAtEnd: "0";
  readonly assertions: readonly {
    readonly field: string;
    readonly satisfied: boolean;
  }[];
}

export type ExactSpendReconciliationStatusV1 =
  | "not-found"
  | "pending"
  | "executed-success"
  | "executed-revert"
  | "reorged"
  | "conflict";

export interface ExactSpendReconciliationInputV1 {
  readonly finalized: FinalizedExactSpendActionV1;
  readonly evidenceRoots: GenerationEvidenceRootsInputV1;
  readonly observations: readonly unknown[];
}

export interface ReconciledExactSpendActionV1 {
  readonly schemaVersion: "cork.exact-spend-reconciliation/v1";
  readonly profile: PreparedExactSpendActionV1["profile"];
  readonly finalizedDigest: Sha256Digest;
  readonly transactionHash?: string;
  readonly status: ExactSpendReconciliationStatusV1;
  readonly retryable: boolean;
  readonly canonicalBlock?: {
    readonly blockNumber: string;
    readonly blockHash: string;
    readonly parentBlockHash: string;
    readonly providerIds: readonly string[];
  };
  readonly evidence?: ExactSpendChainEvidenceV1;
  readonly effectsVerified: boolean;
  readonly residualsPreserved: boolean;
  readonly reconciliationDigest: Sha256Digest;
}

export interface CappedInputUnavailableV1 {
  readonly schemaVersion: "cork.capped-input-unavailable/v1";
  readonly capabilityId: (typeof CAPPED_INPUT_CAPABILITY_IDS)[number];
  readonly implemented: false;
  readonly activated: false;
  readonly healthy: false;
  readonly callable: false;
  readonly error: {
    readonly code: "CAPPED_INPUT_PROTOCOL_UNAVAILABLE";
    readonly message: "The exact capped-input onchain protocol is unavailable.";
    readonly retryable: false;
  };
}

const ADDRESS = /^0x[0-9a-f]{40}$/u;
const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;

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
  allowEmpty = true,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !BYTES.test(value) ||
    (!allowEmpty && value === "0x")
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
  if (value < 0n || value > MAX_UINT256) {
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

function bytes32Word(value: string): Uint8Array {
  assertBytes32(value, "bytes32");
  return hexToBytes(value);
}

function selector(signature: string): Uint8Array {
  return keccak256Bytes(new TextEncoder().encode(signature)).slice(0, 4);
}

function selectorHex(signature: string): string {
  return `0x${bytesToHex(selector(signature))}`;
}

function bytesTail(value: string): Uint8Array {
  assertBytes(value, "dynamic bytes");
  const bytes = hexToBytes(value);
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  return concatBytes([uintWord(BigInt(bytes.length)), padded]);
}

function encodeStaticCall(
  signature: string,
  words: readonly Uint8Array[],
): string {
  return `0x${bytesToHex(concatBytes([selector(signature), ...words]))}`;
}

function encodePermitTransferCall(input: {
  readonly token: string;
  readonly permittedAmount: string;
  readonly nonce: string;
  readonly deadline: string;
  readonly signature: string;
  readonly receiver: string;
  readonly amount: string;
}): string {
  assertAddress(input.token, "permit token");
  assertUint256Decimal(input.permittedAmount, "permittedAmount");
  assertUint256Decimal(input.nonce, "nonce");
  assertUint256Decimal(input.deadline, "deadline");
  assertBytes(input.signature, "signature", false);
  assertAddress(input.receiver, "receiver");
  assertUint256Decimal(input.amount, "amount");
  const dynamic = bytesTail(input.signature);
  const head = [
    addressWord(input.token),
    uintWord(BigInt(input.permittedAmount)),
    uintWord(BigInt(input.nonce)),
    uintWord(BigInt(input.deadline)),
    uintWord(7n * 32n),
    addressWord(input.receiver),
    uintWord(BigInt(input.amount)),
  ];
  return `0x${bytesToHex(
    concatBytes([
      selector(
        "permit2TransferFromWithPermit(((address,uint256),uint256,uint256),bytes,address,uint256)",
      ),
      ...head,
      dynamic,
    ]),
  )}`;
}

function encodeFundingCall(
  proof: FundingProofV1,
  corkAdapter: string,
): {
  readonly functionName: string;
  readonly calldata: string;
  readonly arguments: readonly JsonValue[];
} {
  if (proof.mode === "permit2-signature") {
    return {
      functionName: "permit2TransferFromWithPermit",
      calldata: encodePermitTransferCall({
        token: proof.token,
        permittedAmount: proof.amount,
        nonce: proof.nonce,
        deadline: proof.deadline,
        signature: proof.signature,
        receiver: corkAdapter,
        amount: proof.amount,
      }),
      arguments: [
        proof.token,
        proof.amount,
        proof.nonce,
        proof.deadline,
        proof.signature,
        corkAdapter,
        proof.amount,
      ],
    };
  }
  const functionName =
    proof.mode === "permit2-allowance"
      ? "permit2TransferFrom"
      : "erc20TransferFrom";
  const calldata = encodeStaticCall(
    `${functionName}(address,address,uint256)`,
    [
      addressWord(proof.token),
      addressWord(corkAdapter),
      uintWord(BigInt(proof.amount)),
    ],
  );
  return {
    functionName,
    calldata,
    arguments: [proof.token, corkAdapter, proof.amount],
  };
}

function frozenCall(
  index: number,
  to: string,
  functionName: string,
  signature: string,
  args: readonly JsonValue[],
  calldata: string,
): FrozenActionCallV1 {
  return {
    index: String(index),
    to,
    value: "0",
    functionName,
    functionSelector: selectorHex(signature),
    arguments: args,
    calldata,
    calldataDigest: keccak256Digest(hexToBytes(calldata)),
    skipRevert: false,
    callbackHash: ZERO_BYTES32,
  };
}

function encodeBundlerMulticall(calls: readonly FrozenActionCallV1[]): string {
  const encodedCalls = calls.map((call) => {
    const dynamic = bytesTail(call.calldata);
    return concatBytes([
      addressWord(call.to),
      uintWord(0n),
      uintWord(5n * 32n),
      uintWord(0n),
      bytes32Word(call.callbackHash),
      dynamic,
    ]);
  });
  let offset = BigInt(calls.length * 32);
  const offsets = encodedCalls.map((encoded) => {
    const word = uintWord(offset);
    offset += BigInt(encoded.length);
    return word;
  });
  const array = concatBytes([
    uintWord(BigInt(calls.length)),
    ...offsets,
    ...encodedCalls,
  ]);
  return `0x${bytesToHex(
    concatBytes([
      selector("multicall((address,uint256,bytes,bool,bytes32)[])"),
      uintWord(32n),
      array,
    ]),
  )}`;
}

function validateIntent(value: unknown): UnwindIntentV1 {
  assertClosedObject(value, "unwind intent", [
    "schemaVersion",
    "action",
    "clientRequestId",
    "account",
    "chainId",
    "deploymentId",
    "poolId",
    "requestedSharesIn",
    "receiver",
    "minCollateralAssetsOut",
    "deadline",
  ]);
  if (
    value.schemaVersion !== "cork.operation/v1" ||
    value.action !== "phoenix.unwind-mint"
  ) {
    throw new TypeError("unwind intent schema or action is not supported");
  }
  assertNonEmptyString(value.clientRequestId, "clientRequestId");
  if (value.clientRequestId.length > 128) {
    throw new RangeError("clientRequestId exceeds 128 characters");
  }
  assertAccount(value.account, "account");
  assertUint256Decimal(value.chainId, "chainId");
  assertNonEmptyString(value.deploymentId, "deploymentId");
  if (value.deploymentId.length > 64) {
    throw new RangeError("deploymentId exceeds 64 characters");
  }
  assertBytes32(value.poolId, "poolId");
  assertUint256Decimal(value.requestedSharesIn, "requestedSharesIn");
  assertAddress(value.receiver, "receiver");
  assertUint256Decimal(value.minCollateralAssetsOut, "minCollateralAssetsOut");
  assertUint256Decimal(value.deadline, "deadline");
  if (
    value.requestedSharesIn === "0" ||
    value.requestedSharesIn === MAX_UINT256.toString() ||
    value.minCollateralAssetsOut === "0" ||
    BigInt(value.deadline) > MAX_UINT64
  ) {
    throw new TypeError("unwind amounts or deadline are invalid");
  }
  return {
    schemaVersion: "cork.operation/v1",
    action: "phoenix.unwind-mint",
    clientRequestId: value.clientRequestId,
    account: { kind: value.account.kind, address: value.account.address },
    chainId: value.chainId,
    deploymentId: value.deploymentId,
    poolId: value.poolId,
    requestedSharesIn: value.requestedSharesIn,
    receiver: value.receiver,
    minCollateralAssetsOut: value.minCollateralAssetsOut,
    deadline: value.deadline,
  };
}

function validateUnwindBindings(
  value: unknown,
  intent: UnwindIntentV1,
  verifier: BrowserSignatureVerifierV1,
): UnwindBindingsV1 {
  assertClosedObject(value, "unwind bindings", [
    "evidenceRoots",
    "liveCollateralDecimals",
    "preparedAt",
    "adapterStartingBalancesDigest",
  ]);
  const { roots, manifest } = verifyDeploymentManifest(
    value.evidenceRoots as GenerationEvidenceRootsInputV1,
    verifier,
  );
  if (
    manifest.status !== "active" ||
    roots.policy.payload.status !== "active"
  ) {
    throw new TypeError("unwind requires active deployment evidence");
  }
  if (
    intent.deploymentId !== manifest.deploymentId ||
    intent.chainId !== manifest.chainId
  ) {
    throw new TypeError("intent and deployment manifest do not match");
  }
  const pool = findDeploymentPool(manifest, intent.poolId);
  const permit2 = findDeploymentContract(manifest, "Permit2");
  const bundler3 = findDeploymentContract(manifest, "Bundler3");
  const corkAdapter = findDeploymentContract(manifest, "CorkAdapter");
  const poolManager = findDeploymentContract(manifest, "CorkPoolManager");
  assertUint256Decimal(value.preparedAt, "bindings.preparedAt");
  if (
    pool.poolManager !== poolManager.address ||
    pool.pauseState !== "unpaused" ||
    !pool.adapterWhitelisted ||
    BigInt(value.preparedAt) >= BigInt(pool.expiryTimestamp)
  ) {
    throw new TypeError(
      "unwind pool relationship, pause, whitelist, or phase is invalid",
    );
  }
  assertUint256Decimal(
    value.liveCollateralDecimals,
    "bindings.liveCollateralDecimals",
  );
  if (
    BigInt(pool.cachedCollateralDecimals) > 18n ||
    pool.cachedCollateralDecimals !== value.liveCollateralDecimals
  ) {
    throw new TypeError("verified and live collateral decimals must match");
  }
  assertSha256Digest(
    value.adapterStartingBalancesDigest,
    "bindings.adapterStartingBalancesDigest",
  );
  return {
    deploymentId: manifest.deploymentId,
    generation: manifest.generation,
    status: "active",
    manifestDigest: manifest.manifestDigest,
    chainId: manifest.chainId,
    permit2: permit2.address,
    bundler3: bundler3.address,
    corkAdapter: corkAdapter.address,
    cptAddress: pool.cptAddress,
    cstAddress: pool.cstAddress,
    poolCollateralDecimals: pool.cachedCollateralDecimals,
    liveCollateralDecimals: value.liveCollateralDecimals,
    collateralPrecisionEvidenceDigest: pool.relationshipDigest,
    preparedAt: value.preparedAt,
    adapterStartingBalancesDigest: value.adapterStartingBalancesDigest,
  };
}

function adjacentNonces(
  operationId: OperationIdV1,
  intentDigest: Sha256Digest,
): readonly [string, string] {
  const seed = keccak256Bytes(
    new TextEncoder().encode(
      canonicalizeJson({
        domain: "cork.operation/v1/permit2-nonce",
        operationId,
        intentDigest,
      }),
    ),
  );
  let value = 0n;
  for (const byte of seed) value = (value << 8n) | BigInt(byte);
  const cpt = value & ~1n;
  return [cpt.toString(), (cpt + 1n).toString()];
}

function authorization(
  role: "cpt" | "cst",
  token: string,
  amount: string,
  nonce: string,
  intent: UnwindIntentV1,
  bindings: UnwindBindingsV1,
): PermitAuthorizationRequestV1 {
  const typedData = {
    domain: {
      name: "Permit2" as const,
      chainId: intent.chainId,
      verifyingContract: bindings.permit2,
    },
    primaryType: "PermitTransferFrom" as const,
    permitted: { token, amount },
    spender: bindings.corkAdapter,
    nonce,
    deadline: intent.deadline,
  };
  return {
    id: role === "cpt" ? "permit-cpt" : "permit-cst",
    tokenRole: role,
    signer: intent.account.address,
    validationMode:
      intent.account.kind === "safe"
        ? "safe-contract-signature"
        : "externally-owned-account-typed-data",
    typedData,
    typedDataDigest: sha256CanonicalJson(typedData as unknown as JsonValue),
    nonce,
    wordPosition: (BigInt(nonce) >> 8n).toString(),
    bitPosition: (BigInt(nonce) & 255n).toString(),
    insertion: {
      callIndex: role === "cpt" ? "0" : "1",
      abiField: "signature",
    },
  };
}

function template(
  index: number,
  to: string,
  functionName: string,
  signature: string,
  args: readonly JsonValue[],
  unresolvedFields: readonly string[],
): ActionCallTemplateV1 {
  return {
    index: String(index),
    to,
    value: "0",
    functionName,
    functionSelector: selectorHex(signature),
    arguments: args,
    unresolvedFields,
    skipRevert: false,
    callbackHash: ZERO_BYTES32,
  };
}

export function preparePairedSharesUnwind(
  input: {
    readonly intent: UnwindIntentV1;
    readonly bindings: UnwindBindingEvidenceInputV1;
  },
  evidenceVerifier: BrowserSignatureVerifierV1,
): PreparedPairedSharesUnwindV1 {
  assertClosedObject(input, "prepare unwind input", ["intent", "bindings"]);
  const intent = validateIntent(input.intent);
  const bindings = validateUnwindBindings(
    input.bindings,
    intent,
    evidenceVerifier,
  );
  if (
    intent.receiver === bindings.corkAdapter ||
    intent.receiver === `0x${"00".repeat(20)}`
  ) {
    throw new TypeError(
      "receiver must be non-zero and distinct from CorkAdapter",
    );
  }
  const window = BigInt(intent.deadline) - BigInt(bindings.preparedAt);
  const minimum = intent.account.kind === "safe" ? 900n : 120n;
  const maximum = intent.account.kind === "safe" ? 86_400n : 900n;
  if (window < minimum || window > maximum) {
    throw new TypeError("deadline is outside the account-specific window");
  }
  const shareQuantum = 10n ** (18n - BigInt(bindings.poolCollateralDecimals));
  const requested = BigInt(intent.requestedSharesIn);
  const effective = requested - (requested % shareQuantum);
  if (effective === 0n) {
    throw new TypeError("precision rounding produces zero effective shares");
  }
  const intentDigest = sha256CanonicalJson(intent as unknown as JsonValue);
  const operationId = deriveOperationId({
    account: intent.account,
    deploymentId: intent.deploymentId,
    chainId: intent.chainId,
    clientRequestId: intent.clientRequestId,
    intentDigest,
  });
  const [cptNonce, cstNonce] = adjacentNonces(operationId, intentDigest);
  const cpt = authorization(
    "cpt",
    bindings.cptAddress,
    effective.toString(),
    cptNonce,
    intent,
    bindings,
  );
  const cst = authorization(
    "cst",
    bindings.cstAddress,
    effective.toString(),
    cstNonce,
    intent,
    bindings,
  );
  const permitSignature =
    "permit2TransferFromWithPermit(((address,uint256),uint256,uint256),bytes,address,uint256)";
  const unwindSignature =
    "safeUnwindMint((bytes32,uint256,address,address,uint256,uint256))";
  const callTemplates = [
    template(
      0,
      bindings.corkAdapter,
      "permit2TransferFromWithPermit",
      permitSignature,
      [
        bindings.cptAddress,
        effective.toString(),
        cptNonce,
        intent.deadline,
        bindings.corkAdapter,
        effective.toString(),
      ],
      ["signature"],
    ),
    template(
      1,
      bindings.corkAdapter,
      "permit2TransferFromWithPermit",
      permitSignature,
      [
        bindings.cstAddress,
        effective.toString(),
        cstNonce,
        intent.deadline,
        bindings.corkAdapter,
        effective.toString(),
      ],
      ["signature"],
    ),
    template(
      2,
      bindings.corkAdapter,
      "safeUnwindMint",
      unwindSignature,
      [
        intent.poolId,
        effective.toString(),
        bindings.corkAdapter,
        intent.receiver,
        intent.minCollateralAssetsOut,
        intent.deadline,
      ],
      [],
    ),
  ] as const;
  const withoutDigest: Omit<PreparedPairedSharesUnwindV1, "preparedDigest"> = {
    schemaVersion: "cork.prepared-unwind/v1",
    operationId,
    intentDigest,
    intent,
    bindings,
    constraints: {
      requestedSharesIn: intent.requestedSharesIn,
      effectiveSharesIn: effective.toString(),
      shareQuantum: shareQuantum.toString(),
      minCollateralAssetsOut: intent.minCollateralAssetsOut,
      receiver: intent.receiver,
      transactionValue: "0",
      callCount: "3",
    },
    authorizations: [cpt, cst],
    callTemplates,
  };
  return deepFreeze({
    ...withoutDigest,
    preparedDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as PreparedPairedSharesUnwindV1;
}

export function finalizePairedSharesUnwind(
  input: {
    readonly prepared: PreparedPairedSharesUnwindV1;
    readonly evidenceRoots: GenerationEvidenceRootsInputV1;
    readonly signatures: readonly AuthorizationSignatureArtifactV1[];
    readonly finalizedAt: string;
  },
  verifier: AuthorizationSignatureVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedPairedSharesUnwindV1 {
  assertClosedObject(input, "finalize unwind input", [
    "prepared",
    "evidenceRoots",
    "signatures",
    "finalizedAt",
  ]);
  assertUint256Decimal(input.finalizedAt, "finalizedAt");
  if (
    verifier === null ||
    typeof verifier !== "object" ||
    typeof verifier.verify !== "function"
  ) {
    throw new TypeError("an injected authorization verifier is required");
  }
  const reconstructed = preparePairedSharesUnwind(
    {
      intent: input.prepared.intent,
      bindings: {
        evidenceRoots: input.evidenceRoots,
        liveCollateralDecimals: input.prepared.bindings.liveCollateralDecimals,
        preparedAt: input.prepared.bindings.preparedAt,
        adapterStartingBalancesDigest:
          input.prepared.bindings.adapterStartingBalancesDigest,
      },
    },
    evidenceVerifier,
  );
  if (
    canonicalizeJson(reconstructed as unknown as JsonValue) !==
    canonicalizeJson(input.prepared as unknown as JsonValue)
  ) {
    throw new TypeError("prepared unwind does not match reconstruction");
  }
  if (!Array.isArray(input.signatures) || input.signatures.length !== 2) {
    throw new TypeError("exactly two ordered signature artifacts are required");
  }
  const signatures = input.signatures.map((artifact, index) => {
    assertClosedObject(artifact, `signatures[${index}]`, ["id", "signature"]);
    const expectedId = index === 0 ? "permit-cpt" : "permit-cst";
    if (artifact.id !== expectedId) {
      throw new TypeError("signature artifacts are unordered or substituted");
    }
    assertBytes(artifact.signature, `signatures[${index}].signature`, false);
    const requirement = reconstructed.authorizations[index];
    if (
      requirement === undefined ||
      verifier.verify({
        requirement,
        signature: artifact.signature,
      }) !== true
    ) {
      throw new TypeError("authorization signature verification failed");
    }
    return { id: expectedId, signature: artifact.signature };
  }) as unknown as readonly [
    AuthorizationSignatureArtifactV1,
    AuthorizationSignatureArtifactV1,
  ];
  if (signatures[0].signature === signatures[1].signature) {
    throw new TypeError("the two role signatures must be distinct");
  }
  const effective = reconstructed.constraints.effectiveSharesIn;
  const cptData = encodePermitTransferCall({
    token: reconstructed.bindings.cptAddress,
    permittedAmount: effective,
    nonce: reconstructed.authorizations[0].nonce,
    deadline: reconstructed.intent.deadline,
    signature: signatures[0].signature,
    receiver: reconstructed.bindings.corkAdapter,
    amount: effective,
  });
  const cstData = encodePermitTransferCall({
    token: reconstructed.bindings.cstAddress,
    permittedAmount: effective,
    nonce: reconstructed.authorizations[1].nonce,
    deadline: reconstructed.intent.deadline,
    signature: signatures[1].signature,
    receiver: reconstructed.bindings.corkAdapter,
    amount: effective,
  });
  const unwindSignature =
    "safeUnwindMint((bytes32,uint256,address,address,uint256,uint256))";
  const unwindArgs: readonly JsonValue[] = [
    reconstructed.intent.poolId,
    effective,
    reconstructed.bindings.corkAdapter,
    reconstructed.intent.receiver,
    reconstructed.intent.minCollateralAssetsOut,
    reconstructed.intent.deadline,
  ];
  const unwindData = encodeStaticCall(unwindSignature, [
    bytes32Word(reconstructed.intent.poolId),
    uintWord(BigInt(effective)),
    addressWord(reconstructed.bindings.corkAdapter),
    addressWord(reconstructed.intent.receiver),
    uintWord(BigInt(reconstructed.intent.minCollateralAssetsOut)),
    uintWord(BigInt(reconstructed.intent.deadline)),
  ]);
  const permitSignature =
    "permit2TransferFromWithPermit(((address,uint256),uint256,uint256),bytes,address,uint256)";
  const calls = [
    frozenCall(
      0,
      reconstructed.bindings.corkAdapter,
      "permit2TransferFromWithPermit",
      permitSignature,
      [
        reconstructed.bindings.cptAddress,
        effective,
        reconstructed.authorizations[0].nonce,
        reconstructed.intent.deadline,
        signatures[0].signature,
        reconstructed.bindings.corkAdapter,
        effective,
      ],
      cptData,
    ),
    frozenCall(
      1,
      reconstructed.bindings.corkAdapter,
      "permit2TransferFromWithPermit",
      permitSignature,
      [
        reconstructed.bindings.cstAddress,
        effective,
        reconstructed.authorizations[1].nonce,
        reconstructed.intent.deadline,
        signatures[1].signature,
        reconstructed.bindings.corkAdapter,
        effective,
      ],
      cstData,
    ),
    frozenCall(
      2,
      reconstructed.bindings.corkAdapter,
      "safeUnwindMint",
      unwindSignature,
      unwindArgs,
      unwindData,
    ),
  ] as const;
  const bundlerData = encodeBundlerMulticall(calls);
  const payloadDigest = keccak256Digest(hexToBytes(bundlerData));
  const execution = {
    kind: "bundler-call" as const,
    sender: reconstructed.intent.account.address,
    to: reconstructed.bindings.bundler3,
    value: "0" as const,
    data: bundlerData,
    chainId: reconstructed.intent.chainId,
  };
  const executionDigest = sha256CanonicalJson({
    sender: execution.sender,
    chainId: execution.chainId,
    target: execution.to,
    value: execution.value,
    accountKind: reconstructed.intent.account.kind,
    payloadDigest,
  });
  const withoutDigest: Omit<FinalizedPairedSharesUnwindV1, "finalizedDigest"> =
    {
      schemaVersion: "cork.finalized-unwind/v1",
      operationId: reconstructed.operationId,
      intentDigest: reconstructed.intentDigest,
      preparedDigest: reconstructed.preparedDigest,
      finalizedAt: input.finalizedAt,
      intent: reconstructed.intent,
      bindings: reconstructed.bindings,
      constraints: reconstructed.constraints,
      authorizations: reconstructed.authorizations,
      signatureArtifacts: signatures,
      calls,
      bundlerData,
      payloadDigest,
      execution,
      executionDigest,
      expectedEffects: {
        cptConsumed: effective,
        cstConsumed: effective,
        minimumCollateralToReceiver:
          reconstructed.intent.minCollateralAssetsOut,
        adapterBalancesReturnToStart: true,
      },
    };
  return deepFreeze({
    ...withoutDigest,
    finalizedDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as FinalizedPairedSharesUnwindV1;
}

function validateFundingProof(value: unknown, label: string): FundingProofV1 {
  if (value !== null && typeof value === "object" && "mode" in value) {
    const record = value as Record<string, unknown>;
    if (
      record.mode === "token-allowance" ||
      record.mode === "permit2-allowance"
    ) {
      assertClosedObject(record, label, [
        "mode",
        "token",
        "amount",
        "authorizationDigest",
      ]);
      assertAddress(record.token, `${label}.token`);
      assertUint256Decimal(record.amount, `${label}.amount`);
      if (record.amount === "0" || record.amount === MAX_UINT256.toString()) {
        throw new TypeError(`${label}.amount must be exact and non-maximum`);
      }
      assertSha256Digest(
        record.authorizationDigest,
        `${label}.authorizationDigest`,
      );
      return {
        mode: record.mode,
        token: record.token,
        amount: record.amount,
        authorizationDigest: record.authorizationDigest,
      };
    }
    if (record.mode === "permit2-signature") {
      assertClosedObject(record, label, [
        "mode",
        "token",
        "amount",
        "nonce",
        "deadline",
        "signature",
        "authorizationDigest",
      ]);
      assertAddress(record.token, `${label}.token`);
      assertUint256Decimal(record.amount, `${label}.amount`);
      assertUint256Decimal(record.nonce, `${label}.nonce`);
      assertUint256Decimal(record.deadline, `${label}.deadline`);
      assertBytes(record.signature, `${label}.signature`, false);
      assertSha256Digest(
        record.authorizationDigest,
        `${label}.authorizationDigest`,
      );
      if (record.amount === "0" || record.amount === MAX_UINT256.toString()) {
        throw new TypeError(`${label}.amount must be exact and non-maximum`);
      }
      return {
        mode: "permit2-signature",
        token: record.token,
        amount: record.amount,
        nonce: record.nonce,
        deadline: record.deadline,
        signature: record.signature,
        authorizationDigest: record.authorizationDigest,
      };
    }
  }
  throw new TypeError(`${label}.mode is not supported`);
}

function validateContext(
  value: unknown,
  verifier: BrowserSignatureVerifierV1,
): {
  readonly context: ExactSpendContextV1;
  readonly pool: DeploymentPoolBindingV1;
} {
  assertClosedObject(value, "exact-spend context", [
    "evidenceRoots",
    "poolId",
    "account",
    "receiver",
    "deadline",
    "currentTime",
    "funding",
    "adapterStartingBalancesDigest",
  ]);
  assertBytes32(value.poolId, "context.poolId");
  const { roots, manifest } = verifyDeploymentManifest(
    value.evidenceRoots as GenerationEvidenceRootsInputV1,
    verifier,
  );
  if (
    manifest.status !== "active" ||
    roots.policy.payload.status !== "active"
  ) {
    throw new TypeError("exact-spend action requires active evidence roots");
  }
  const pool = findDeploymentPool(manifest, value.poolId);
  const bundler3 = findDeploymentContract(manifest, "Bundler3");
  const corkAdapter = findDeploymentContract(manifest, "CorkAdapter");
  const poolManager = findDeploymentContract(manifest, "CorkPoolManager");
  if (
    pool.poolManager !== poolManager.address ||
    pool.pauseState !== "unpaused" ||
    pool.adapterWhitelisted !== true
  ) {
    throw new TypeError(
      "exact-spend pool relationship, pause, or whitelist is invalid",
    );
  }
  assertAccount(value.account, "context.account");
  assertAddress(value.receiver, "context.receiver");
  if (
    value.receiver === corkAdapter.address ||
    value.receiver === `0x${"00".repeat(20)}`
  ) {
    throw new TypeError("context receiver is invalid");
  }
  assertUint256Decimal(value.deadline, "context.deadline");
  assertUint256Decimal(value.currentTime, "context.currentTime");
  if (BigInt(value.deadline) <= BigInt(value.currentTime)) {
    throw new TypeError("action deadline must be in the future");
  }
  if (!Array.isArray(value.funding) || value.funding.length === 0) {
    throw new TypeError("at least one exact funding proof is required");
  }
  const funding = value.funding.map((proof, index) =>
    validateFundingProof(proof, `context.funding[${index}]`),
  );
  assertSha256Digest(
    value.adapterStartingBalancesDigest,
    "context.adapterStartingBalancesDigest",
  );
  return {
    context: {
      deploymentId: manifest.deploymentId,
      generation: manifest.generation,
      manifestDigest: manifest.manifestDigest,
      chainId: manifest.chainId,
      poolId: pool.poolId,
      account: {
        kind: value.account.kind,
        address: value.account.address,
      },
      bundler3: bundler3.address,
      corkAdapter: corkAdapter.address,
      receiver: value.receiver,
      deadline: value.deadline,
      currentTime: value.currentTime,
      phase:
        BigInt(value.currentTime) < BigInt(pool.expiryTimestamp)
          ? "pre-expiry"
          : "post-expiry",
      paused: false,
      adapterWhitelisted: true,
      funding,
      adapterStartingBalancesDigest: value.adapterStartingBalancesDigest,
    },
    pool,
  };
}

function requireExactAmount(
  proof: FundingProofV1,
  expected: string,
  label: string,
): void {
  assertUint256Decimal(expected, label);
  if (
    expected === "0" ||
    expected === MAX_UINT256.toString() ||
    proof.amount !== expected
  ) {
    throw new TypeError(
      `${label} must equal the exact profile-derived funding`,
    );
  }
}

function prepareNamedProfile(
  input: {
    readonly profile: PreparedExactSpendActionV1["profile"];
    readonly context: ExactSpendContextInputV1;
    readonly profileBindings: readonly {
      readonly field: string;
      readonly value: JsonValue;
    }[];
    readonly protectedFunction: string;
    readonly protectedSignature: string;
    readonly protectedArguments: (
      context: ExactSpendContextV1,
    ) => readonly JsonValue[];
    readonly protectedWords: (
      context: ExactSpendContextV1,
    ) => readonly Uint8Array[];
    readonly expectedFundingAmounts: readonly string[];
    readonly expectedFundingRoles: readonly ("collateral" | "cpt" | "cst")[];
    readonly requiredPhase: "pre-expiry" | "post-expiry";
    readonly expectedEffects: readonly string[];
    readonly reconciliationProjection: readonly string[];
  },
  verifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  const validated = validateContext(input.context, verifier);
  const context = validated.context;
  if (context.paused || context.phase !== input.requiredPhase) {
    throw new TypeError("profile phase or pause binding is invalid");
  }
  if (
    context.funding.length !== input.expectedFundingAmounts.length ||
    context.funding.length !== input.expectedFundingRoles.length
  ) {
    throw new TypeError("profile received the wrong funding proof count");
  }
  const fundingCalls = context.funding.map((proof, index) => {
    const role = input.expectedFundingRoles[index];
    const expectedToken =
      role === "collateral"
        ? validated.pool.collateralAsset
        : role === "cpt"
          ? validated.pool.cptAddress
          : validated.pool.cstAddress;
    if (proof.token !== expectedToken) {
      throw new TypeError(
        "funding token is not bound by the deployment manifest",
      );
    }
    requireExactAmount(
      proof,
      input.expectedFundingAmounts[index] ?? "0",
      `funding[${index}]`,
    );
    const encoded = encodeFundingCall(proof, context.corkAdapter);
    const signature =
      proof.mode === "permit2-signature"
        ? "permit2TransferFromWithPermit(((address,uint256),uint256,uint256),bytes,address,uint256)"
        : `${encoded.functionName}(address,address,uint256)`;
    return frozenCall(
      index,
      context.corkAdapter,
      encoded.functionName,
      signature,
      encoded.arguments,
      encoded.calldata,
    );
  });
  const protectedCalldata = encodeStaticCall(
    input.protectedSignature,
    input.protectedWords(context),
  );
  const protectedCall = frozenCall(
    fundingCalls.length,
    context.corkAdapter,
    input.protectedFunction,
    input.protectedSignature,
    input.protectedArguments(context),
    protectedCalldata,
  );
  const bundlerData = encodeBundlerMulticall([...fundingCalls, protectedCall]);
  const withoutDigest: Omit<PreparedExactSpendActionV1, "actionDigest"> = {
    schemaVersion: "cork.exact-spend-action/v1",
    profile: input.profile,
    context,
    profileBindings: input.profileBindings,
    fundingCalls,
    protectedCall,
    bundlerData,
    payloadDigest: keccak256Digest(hexToBytes(bundlerData)),
    expectedEffects: input.expectedEffects,
    residualPreservation: {
      adapterBalancesReturnToStart: true,
      actionCreatedAllowancesReturnToZero: true,
    },
    reconciliationProjection: input.reconciliationProjection,
  };
  return deepFreeze({
    ...withoutDigest,
    actionDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as PreparedExactSpendActionV1;
}

function binding(field: string, value: JsonValue) {
  return { field, value };
}

export function prepareMintCollateralIn(
  input: {
    readonly context: ExactSpendContextInputV1;
    readonly collateralAssetsIn: string;
    readonly minCptAndCstSharesOut: string;
    readonly currentFee: "0";
  },
  verifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  assertClosedObject(input, "mint collateral-in input", [
    "context",
    "collateralAssetsIn",
    "minCptAndCstSharesOut",
    "currentFee",
  ]);
  assertUint256Decimal(input.collateralAssetsIn, "collateralAssetsIn");
  assertUint256Decimal(input.minCptAndCstSharesOut, "minCptAndCstSharesOut");
  if (input.currentFee !== "0" || input.minCptAndCstSharesOut === "0") {
    throw new TypeError("mint collateral-in must be fee-free and non-zero");
  }
  return prepareNamedProfile(
    {
      profile: "mint-collateral-in",
      context: input.context,
      profileBindings: [
        binding("collateralAssetsIn", input.collateralAssetsIn),
        binding("currentFee", input.currentFee),
        binding("minCptAndCstSharesOut", input.minCptAndCstSharesOut),
      ],
      protectedFunction: "safeDeposit",
      protectedSignature:
        "safeDeposit((bytes32,uint256,address,uint256,uint256))",
      protectedArguments: (context) => [
        context.poolId,
        input.collateralAssetsIn,
        context.receiver,
        input.minCptAndCstSharesOut,
        context.deadline,
      ],
      protectedWords: (context) => [
        bytes32Word(context.poolId),
        uintWord(BigInt(input.collateralAssetsIn)),
        addressWord(context.receiver),
        uintWord(BigInt(input.minCptAndCstSharesOut)),
        uintWord(BigInt(context.deadline)),
      ],
      expectedFundingAmounts: [input.collateralAssetsIn],
      expectedFundingRoles: ["collateral"],
      requiredPhase: "pre-expiry",
      expectedEffects: [
        "equal-cpt-cst-to-receiver",
        "canonical-liquidity-event",
      ],
      reconciliationProjection: [
        "receiver-cpt-delta",
        "receiver-cst-delta",
        "liquidity-event",
        "adapter-residuals",
      ],
    },
    verifier,
  );
}

export function prepareMintPairedSharesOut(
  input: {
    readonly context: ExactSpendContextInputV1;
    readonly cptAndCstSharesOut: string;
    readonly previewCollateralAssetsIn: string;
    readonly maxCollateralAssetsIn: string;
    readonly currentFee: "0";
  },
  verifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  assertClosedObject(input, "mint paired-shares-out input", [
    "context",
    "cptAndCstSharesOut",
    "previewCollateralAssetsIn",
    "maxCollateralAssetsIn",
    "currentFee",
  ]);
  for (const [label, value] of [
    ["cptAndCstSharesOut", input.cptAndCstSharesOut],
    ["previewCollateralAssetsIn", input.previewCollateralAssetsIn],
    ["maxCollateralAssetsIn", input.maxCollateralAssetsIn],
  ] as const) {
    assertUint256Decimal(value, label);
    if (value === "0" || value === MAX_UINT256.toString()) {
      throw new TypeError(`${label} must be non-zero and non-maximum`);
    }
  }
  if (
    input.currentFee !== "0" ||
    BigInt(input.previewCollateralAssetsIn) >
      BigInt(input.maxCollateralAssetsIn)
  ) {
    throw new TypeError("preview funding exceeds the exact mint maximum");
  }
  return prepareNamedProfile(
    {
      profile: "mint-paired-shares-out",
      context: input.context,
      profileBindings: [
        binding("cptAndCstSharesOut", input.cptAndCstSharesOut),
        binding("currentFee", input.currentFee),
        binding("previewCollateralAssetsIn", input.previewCollateralAssetsIn),
        binding("maxCollateralAssetsIn", input.maxCollateralAssetsIn),
      ],
      protectedFunction: "safeMint",
      protectedSignature: "safeMint((bytes32,uint256,address,uint256,uint256))",
      protectedArguments: (context) => [
        context.poolId,
        input.cptAndCstSharesOut,
        context.receiver,
        input.maxCollateralAssetsIn,
        context.deadline,
      ],
      protectedWords: (context) => [
        bytes32Word(context.poolId),
        uintWord(BigInt(input.cptAndCstSharesOut)),
        addressWord(context.receiver),
        uintWord(BigInt(input.maxCollateralAssetsIn)),
        uintWord(BigInt(context.deadline)),
      ],
      expectedFundingAmounts: [input.previewCollateralAssetsIn],
      expectedFundingRoles: ["collateral"],
      requiredPhase: "pre-expiry",
      expectedEffects: [
        "exact-equal-shares-to-receiver",
        "preview-bounded-funding",
      ],
      reconciliationProjection: [
        "preview-equality",
        "receiver-cpt-delta",
        "receiver-cst-delta",
        "adapter-residuals",
      ],
    },
    verifier,
  );
}

export function prepareRepurchaseCollateralInForSwap(
  input: {
    readonly context: ExactSpendContextInputV1;
    readonly collateralAssetsIn: string;
    readonly minReferenceAssetsOut: string;
    readonly minCstSharesOut: string;
    readonly liveRate: string;
    readonly currentFee: string;
    readonly requiredLockedPosition: string;
    readonly availableLockedPosition: string;
  },
  verifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  assertClosedObject(input, "repurchase collateral-in input", [
    "context",
    "collateralAssetsIn",
    "minReferenceAssetsOut",
    "minCstSharesOut",
    "liveRate",
    "currentFee",
    "requiredLockedPosition",
    "availableLockedPosition",
  ]);
  for (const [label, value] of Object.entries(input).filter(
    ([label]) => label !== "context",
  )) {
    assertUint256Decimal(value, label);
  }
  if (
    input.collateralAssetsIn === "0" ||
    input.liveRate === "0" ||
    input.currentFee === "0" ||
    BigInt(input.availableLockedPosition) < BigInt(input.requiredLockedPosition)
  ) {
    throw new TypeError(
      "repurchase rate, fee, funding, or capacity is invalid",
    );
  }
  return prepareNamedProfile(
    {
      profile: "repurchase-collateral-in-for-swap",
      context: input.context,
      profileBindings: [
        binding("availableLockedPosition", input.availableLockedPosition),
        binding("collateralAssetsIn", input.collateralAssetsIn),
        binding("currentFee", input.currentFee),
        binding("liveRate", input.liveRate),
        binding("minCstSharesOut", input.minCstSharesOut),
        binding("minReferenceAssetsOut", input.minReferenceAssetsOut),
        binding("requiredLockedPosition", input.requiredLockedPosition),
      ],
      protectedFunction: "safeUnwindSwap",
      protectedSignature:
        "safeUnwindSwap((bytes32,uint256,address,uint256,uint256,uint256))",
      protectedArguments: (context) => [
        context.poolId,
        input.collateralAssetsIn,
        context.receiver,
        input.minReferenceAssetsOut,
        input.minCstSharesOut,
        context.deadline,
      ],
      protectedWords: (context) => [
        bytes32Word(context.poolId),
        uintWord(BigInt(input.collateralAssetsIn)),
        addressWord(context.receiver),
        uintWord(BigInt(input.minReferenceAssetsOut)),
        uintWord(BigInt(input.minCstSharesOut)),
        uintWord(BigInt(context.deadline)),
      ],
      expectedFundingAmounts: [input.collateralAssetsIn],
      expectedFundingRoles: ["collateral"],
      requiredPhase: "pre-expiry",
      expectedEffects: ["reference-and-cst-to-receiver", "pool-swap-is-unwind"],
      reconciliationProjection: [
        "live-rate",
        "fee",
        "locked-position-capacity",
        "pool-swap-event",
        "adapter-residuals",
      ],
    },
    verifier,
  );
}

export function prepareUnwindCollateralOut(
  input: {
    readonly context: ExactSpendContextInputV1;
    readonly collateralAssetsOut: string;
    readonly previewCptAndCstSharesIn: string;
    readonly maxCptAndCstSharesIn: string;
    readonly shareQuantum: string;
  },
  verifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  assertClosedObject(input, "unwind collateral-out input", [
    "context",
    "collateralAssetsOut",
    "previewCptAndCstSharesIn",
    "maxCptAndCstSharesIn",
    "shareQuantum",
  ]);
  for (const [label, value] of Object.entries(input).filter(
    ([label]) => label !== "context",
  )) {
    assertUint256Decimal(value, label);
    if (value === "0" || value === MAX_UINT256.toString()) {
      throw new TypeError(`${label} must be non-zero and non-maximum`);
    }
  }
  if (
    BigInt(input.previewCptAndCstSharesIn) >
      BigInt(input.maxCptAndCstSharesIn) ||
    BigInt(input.previewCptAndCstSharesIn) % BigInt(input.shareQuantum) !== 0n
  ) {
    throw new TypeError("unwind preview exceeds maximum or verified precision");
  }
  return prepareNamedProfile(
    {
      profile: "unwind-collateral-out",
      context: input.context,
      profileBindings: [
        binding("collateralAssetsOut", input.collateralAssetsOut),
        binding("maxCptAndCstSharesIn", input.maxCptAndCstSharesIn),
        binding("previewCptAndCstSharesIn", input.previewCptAndCstSharesIn),
        binding("shareQuantum", input.shareQuantum),
      ],
      protectedFunction: "safeUnwindDeposit",
      protectedSignature:
        "safeUnwindDeposit((bytes32,uint256,address,address,uint256,uint256))",
      protectedArguments: (context) => [
        context.poolId,
        input.collateralAssetsOut,
        context.corkAdapter,
        context.receiver,
        input.maxCptAndCstSharesIn,
        context.deadline,
      ],
      protectedWords: (context) => [
        bytes32Word(context.poolId),
        uintWord(BigInt(input.collateralAssetsOut)),
        addressWord(context.corkAdapter),
        addressWord(context.receiver),
        uintWord(BigInt(input.maxCptAndCstSharesIn)),
        uintWord(BigInt(context.deadline)),
      ],
      expectedFundingAmounts: [
        input.previewCptAndCstSharesIn,
        input.previewCptAndCstSharesIn,
      ],
      expectedFundingRoles: ["cpt", "cst"],
      requiredPhase: "pre-expiry",
      expectedEffects: [
        "exact-collateral-to-receiver",
        "paired-share-consumption",
      ],
      reconciliationProjection: [
        "owner-is-cork-adapter",
        "verified-cached-precision",
        "paired-share-deltas",
        "adapter-residuals",
      ],
    },
    verifier,
  );
}

export function prepareRedeemPrincipalTokenIn(
  input: {
    readonly context: ExactSpendContextInputV1;
    readonly cptSharesIn: string;
    readonly minReferenceAssetsOut: string;
    readonly minCollateralAssetsOut: string;
    readonly liquidityState: "first-call" | "archived";
  },
  verifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  assertClosedObject(input, "redeem principal-token-in input", [
    "context",
    "cptSharesIn",
    "minReferenceAssetsOut",
    "minCollateralAssetsOut",
    "liquidityState",
  ]);
  for (const [label, value] of [
    ["cptSharesIn", input.cptSharesIn],
    ["minReferenceAssetsOut", input.minReferenceAssetsOut],
    ["minCollateralAssetsOut", input.minCollateralAssetsOut],
  ] as const) {
    assertUint256Decimal(value, label);
  }
  if (
    input.cptSharesIn === "0" ||
    input.cptSharesIn === MAX_UINT256.toString() ||
    (input.minReferenceAssetsOut === "0" &&
      input.minCollateralAssetsOut === "0") ||
    (input.liquidityState !== "first-call" &&
      input.liquidityState !== "archived")
  ) {
    throw new TypeError(
      "redeem amount, minimums, or liquidity state is invalid",
    );
  }
  return prepareNamedProfile(
    {
      profile: "redeem-principal-token-in",
      context: input.context,
      profileBindings: [
        binding("cptSharesIn", input.cptSharesIn),
        binding("liquidityState", input.liquidityState),
        binding("minCollateralAssetsOut", input.minCollateralAssetsOut),
        binding("minReferenceAssetsOut", input.minReferenceAssetsOut),
      ],
      protectedFunction: "safeRedeem",
      protectedSignature:
        "safeRedeem((bytes32,uint256,address,address,uint256,uint256,uint256))",
      protectedArguments: (context) => [
        context.poolId,
        input.cptSharesIn,
        context.corkAdapter,
        context.receiver,
        input.minReferenceAssetsOut,
        input.minCollateralAssetsOut,
        context.deadline,
      ],
      protectedWords: (context) => [
        bytes32Word(context.poolId),
        uintWord(BigInt(input.cptSharesIn)),
        addressWord(context.corkAdapter),
        addressWord(context.receiver),
        uintWord(BigInt(input.minReferenceAssetsOut)),
        uintWord(BigInt(input.minCollateralAssetsOut)),
        uintWord(BigInt(context.deadline)),
      ],
      expectedFundingAmounts: [input.cptSharesIn],
      expectedFundingRoles: ["cpt"],
      requiredPhase: "post-expiry",
      expectedEffects: [
        "reference-and-collateral-to-receiver",
        "cpt-consumption",
      ],
      reconciliationProjection: [
        "first-call-liquidity-separation",
        "archived-state",
        "receiver-deltas",
        "adapter-residuals",
      ],
    },
    verifier,
  );
}

function profileBindingValue(
  prepared: PreparedExactSpendActionV1,
  field: string,
): JsonValue {
  const matches = prepared.profileBindings.filter(
    (candidate) => candidate.field === field,
  );
  if (matches.length !== 1) {
    throw new TypeError(
      `prepared profile binding ${field} is absent or duplicated`,
    );
  }
  return matches[0]!.value;
}

function profileBindingString(
  prepared: PreparedExactSpendActionV1,
  field: string,
): string {
  const value = profileBindingValue(prepared, field);
  if (typeof value !== "string") {
    throw new TypeError(`prepared profile binding ${field} must be a string`);
  }
  return value;
}

function reconstructPreparedExactSpendAction(
  prepared: PreparedExactSpendActionV1,
  evidenceRoots: GenerationEvidenceRootsInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): PreparedExactSpendActionV1 {
  const context: ExactSpendContextInputV1 = {
    evidenceRoots,
    poolId: prepared.context.poolId,
    account: prepared.context.account,
    receiver: prepared.context.receiver,
    deadline: prepared.context.deadline,
    currentTime: prepared.context.currentTime,
    funding: prepared.context.funding,
    adapterStartingBalancesDigest:
      prepared.context.adapterStartingBalancesDigest,
  };
  switch (prepared.profile) {
    case "mint-collateral-in":
      return prepareMintCollateralIn(
        {
          context,
          collateralAssetsIn: profileBindingString(
            prepared,
            "collateralAssetsIn",
          ),
          minCptAndCstSharesOut: profileBindingString(
            prepared,
            "minCptAndCstSharesOut",
          ),
          currentFee: profileBindingString(prepared, "currentFee") as "0",
        },
        evidenceVerifier,
      );
    case "mint-paired-shares-out":
      return prepareMintPairedSharesOut(
        {
          context,
          cptAndCstSharesOut: profileBindingString(
            prepared,
            "cptAndCstSharesOut",
          ),
          previewCollateralAssetsIn: profileBindingString(
            prepared,
            "previewCollateralAssetsIn",
          ),
          maxCollateralAssetsIn: profileBindingString(
            prepared,
            "maxCollateralAssetsIn",
          ),
          currentFee: profileBindingString(prepared, "currentFee") as "0",
        },
        evidenceVerifier,
      );
    case "repurchase-collateral-in-for-swap":
      return prepareRepurchaseCollateralInForSwap(
        {
          context,
          collateralAssetsIn: profileBindingString(
            prepared,
            "collateralAssetsIn",
          ),
          minReferenceAssetsOut: profileBindingString(
            prepared,
            "minReferenceAssetsOut",
          ),
          minCstSharesOut: profileBindingString(prepared, "minCstSharesOut"),
          liveRate: profileBindingString(prepared, "liveRate"),
          currentFee: profileBindingString(prepared, "currentFee"),
          requiredLockedPosition: profileBindingString(
            prepared,
            "requiredLockedPosition",
          ),
          availableLockedPosition: profileBindingString(
            prepared,
            "availableLockedPosition",
          ),
        },
        evidenceVerifier,
      );
    case "unwind-collateral-out":
      return prepareUnwindCollateralOut(
        {
          context,
          collateralAssetsOut: profileBindingString(
            prepared,
            "collateralAssetsOut",
          ),
          previewCptAndCstSharesIn: profileBindingString(
            prepared,
            "previewCptAndCstSharesIn",
          ),
          maxCptAndCstSharesIn: profileBindingString(
            prepared,
            "maxCptAndCstSharesIn",
          ),
          shareQuantum: profileBindingString(prepared, "shareQuantum"),
        },
        evidenceVerifier,
      );
    case "redeem-principal-token-in":
      return prepareRedeemPrincipalTokenIn(
        {
          context,
          cptSharesIn: profileBindingString(prepared, "cptSharesIn"),
          minReferenceAssetsOut: profileBindingString(
            prepared,
            "minReferenceAssetsOut",
          ),
          minCollateralAssetsOut: profileBindingString(
            prepared,
            "minCollateralAssetsOut",
          ),
          liquidityState: profileBindingString(prepared, "liquidityState") as
            | "first-call"
            | "archived",
        },
        evidenceVerifier,
      );
    default:
      throw new TypeError("exact-spend profile is unsupported");
  }
}

function resolveAccountWrapper(
  prepared: PreparedExactSpendActionV1,
  supplied: AccountWrapperV1 | undefined,
): AccountWrapperV1 {
  if (prepared.context.account.kind === "externally-owned-account") {
    const expected = {
      kind: "externally-owned-account" as const,
      from: prepared.context.account.address,
    };
    if (
      supplied !== undefined &&
      canonicalizeJson(supplied as unknown as JsonValue) !==
        canonicalizeJson(expected)
    ) {
      throw new TypeError("externally-owned-account wrapper is substituted");
    }
    return expected;
  }
  if (
    supplied === undefined ||
    supplied.kind !== "safe" ||
    supplied.safeAddress !== prepared.context.account.address
  ) {
    throw new TypeError(
      "Safe exact-spend finalization requires the caller-owned Safe wrapper identity",
    );
  }
  assertUint256Decimal(supplied.nonce, "accountWrapper.nonce");
  assertBytes32(supplied.safeTxHash, "accountWrapper.safeTxHash");
  return supplied;
}

function finalizeExactSpendAction(
  expectedProfile: PreparedExactSpendActionV1["profile"],
  input: ExactSpendFinalizationInputV1,
  verifier: ExactSpendFinalizationVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedExactSpendActionV1 {
  assertClosedObject(
    input,
    "exact-spend finalization input",
    ["prepared", "evidenceRoots", "finalizedAt"],
    ["accountWrapper"],
  );
  if (
    verifier === null ||
    typeof verifier !== "object" ||
    typeof verifier.verifyFunding !== "function" ||
    typeof verifier.verifyProfileState !== "function"
  ) {
    throw new TypeError(
      "an injected exact-spend finalization verifier is required",
    );
  }
  assertUint256Decimal(input.finalizedAt, "finalizedAt");
  if (input.prepared.profile !== expectedProfile) {
    throw new TypeError("exact-spend finalizer profile does not match");
  }
  const reconstructed = reconstructPreparedExactSpendAction(
    input.prepared,
    input.evidenceRoots,
    evidenceVerifier,
  );
  if (
    canonicalizeJson(reconstructed as unknown as JsonValue) !==
    canonicalizeJson(input.prepared as unknown as JsonValue)
  ) {
    throw new TypeError("PREPARED_ARTIFACT_MISMATCH");
  }
  if (
    BigInt(input.finalizedAt) < BigInt(reconstructed.context.currentTime) ||
    BigInt(input.finalizedAt) >
      BigInt(reconstructed.context.currentTime) + 60n ||
    BigInt(input.finalizedAt) >= BigInt(reconstructed.context.deadline)
  ) {
    throw new TypeError(
      "exact-spend finalization is outside its freshness window",
    );
  }
  for (const proof of reconstructed.context.funding) {
    if (
      verifier.verifyFunding({
        profile: reconstructed.profile,
        account: reconstructed.context.account,
        corkAdapter: reconstructed.context.corkAdapter,
        proof,
      }) !== true
    ) {
      throw new TypeError("exact-spend funding verification failed");
    }
  }
  if (
    verifier.verifyProfileState({
      profile: reconstructed.profile,
      context: reconstructed.context,
      profileBindings: reconstructed.profileBindings,
      protectedCall: reconstructed.protectedCall,
    }) !== true
  ) {
    throw new TypeError("exact-spend profile state verification failed");
  }
  const { roots } = verifyDeploymentManifest(
    input.evidenceRoots,
    evidenceVerifier,
  );
  const accountWrapper = resolveAccountWrapper(
    reconstructed,
    input.accountWrapper,
  );
  const execution = createFrozenExecution({
    schemaVersion: "cork.frozen-execution/v1",
    sender: reconstructed.context.account.address,
    target: reconstructed.context.bundler3,
    value: "0",
    calldata: reconstructed.bundlerData,
    deploymentGeneration: {
      deploymentId: reconstructed.context.deploymentId,
      generation: reconstructed.context.generation,
      payloadDigest: roots.deployment.payloadDigest,
    },
    currentBindings: [
      { field: "action-digest", value: reconstructed.actionDigest },
      {
        field: "adapter-starting-balances-digest",
        value: reconstructed.context.adapterStartingBalancesDigest,
      },
      { field: "manifest-digest", value: reconstructed.context.manifestDigest },
      { field: "profile", value: reconstructed.profile },
    ],
    accountWrapper,
  });
  if (execution.payloadDigest !== reconstructed.payloadDigest) {
    throw new TypeError(
      "finalized execution payload changed after reconstruction",
    );
  }
  const withoutDigest: Omit<FinalizedExactSpendActionV1, "finalizedDigest"> = {
    schemaVersion: "cork.finalized-exact-spend-action/v1",
    profile: reconstructed.profile,
    preparedDigest: reconstructed.actionDigest,
    finalizedAt: input.finalizedAt,
    prepared: reconstructed,
    execution,
    expectedEffects: reconstructed.expectedEffects,
    residualPreservation: reconstructed.residualPreservation,
    reconciliationProjection: reconstructed.reconciliationProjection,
  };
  return deepFreeze({
    ...withoutDigest,
    finalizedDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as FinalizedExactSpendActionV1;
}

function validateFinalizedExactSpendAction(
  value: FinalizedExactSpendActionV1,
): FinalizedExactSpendActionV1 {
  assertClosedObject(value, "finalized exact-spend action", [
    "schemaVersion",
    "profile",
    "preparedDigest",
    "finalizedAt",
    "prepared",
    "execution",
    "expectedEffects",
    "residualPreservation",
    "reconciliationProjection",
    "finalizedDigest",
  ]);
  if (
    value.schemaVersion !== "cork.finalized-exact-spend-action/v1" ||
    value.profile !== value.prepared.profile ||
    value.preparedDigest !== value.prepared.actionDigest
  ) {
    throw new TypeError("finalized exact-spend identity is invalid");
  }
  assertSha256Digest(value.prepared.actionDigest, "prepared.actionDigest");
  const preparedWithoutDigest = { ...value.prepared } as Record<
    string,
    unknown
  >;
  delete preparedWithoutDigest["actionDigest"];
  if (
    sha256CanonicalJson(preparedWithoutDigest as JsonValue) !==
    value.prepared.actionDigest
  ) {
    throw new TypeError("prepared exact-spend digest does not match");
  }
  assertUint256Decimal(value.finalizedAt, "finalizedAt");
  assertSha256Digest(value.finalizedDigest, "finalizedDigest");
  const execution = validateFrozenExecution(value.execution);
  if (
    execution.payloadDigest !== value.prepared.payloadDigest ||
    execution.calldata !== value.prepared.bundlerData
  ) {
    throw new TypeError(
      "finalized exact-spend execution does not match preparation",
    );
  }
  const withoutDigest = { ...value } as Record<string, unknown>;
  delete withoutDigest["finalizedDigest"];
  if (
    sha256CanonicalJson(withoutDigest as JsonValue) !== value.finalizedDigest
  ) {
    throw new TypeError("finalized exact-spend digest does not match");
  }
  return value;
}

function simulateExactSpendAction(
  expectedProfile: PreparedExactSpendActionV1["profile"],
  input: ExactSpendSimulationInputV1,
): SimulationAttestationV1 {
  assertClosedObject(
    input,
    "exact-spend simulation input",
    ["finalized", "producerBuild", "providerIds", "simulatedAt", "outcome"],
    ["block"],
  );
  const finalized = validateFinalizedExactSpendAction(input.finalized);
  if (finalized.profile !== expectedProfile) {
    throw new TypeError("exact-spend simulator profile does not match");
  }
  return createSimulationAttestation({
    producerBuild: input.producerBuild,
    providerIds: input.providerIds,
    ...(input.block === undefined ? {} : { block: input.block }),
    simulatedAt: input.simulatedAt,
    execution: finalized.execution,
    outcome: input.outcome,
  });
}

function validateChainEvidence(value: unknown): ExactSpendChainEvidenceV1 {
  assertClosedObject(value, "exact-spend chain evidence", [
    "schemaVersion",
    "transactionHash",
    "chainId",
    "sender",
    "target",
    "value",
    "payloadDigest",
    "executionDigest",
    "receiptStatus",
    "canonical",
    "finalized",
    "adapterStartingBalancesDigest",
    "adapterEndingBalancesDigest",
    "actionCreatedAllowancesAtEnd",
    "assertions",
  ]);
  if (value.schemaVersion !== "cork.exact-spend-chain-evidence/v1") {
    throw new TypeError("exact-spend chain evidence schema is unsupported");
  }
  assertBytes32(value.transactionHash, "transactionHash");
  assertUint256Decimal(value.chainId, "chainId");
  assertAddress(value.sender, "sender");
  assertAddress(value.target, "target");
  if (value.value !== "0")
    throw new TypeError("chain evidence value must be zero");
  assertKeccak256Digest(value.payloadDigest, "payloadDigest");
  assertSha256Digest(value.executionDigest, "executionDigest");
  if (
    value.receiptStatus !== "not-found" &&
    value.receiptStatus !== "pending" &&
    value.receiptStatus !== "success" &&
    value.receiptStatus !== "revert"
  ) {
    throw new TypeError("chain evidence receipt status is unsupported");
  }
  if (
    typeof value.canonical !== "boolean" ||
    typeof value.finalized !== "boolean"
  ) {
    throw new TypeError("chain evidence finality flags must be boolean");
  }
  assertSha256Digest(
    value.adapterStartingBalancesDigest,
    "adapterStartingBalancesDigest",
  );
  assertSha256Digest(
    value.adapterEndingBalancesDigest,
    "adapterEndingBalancesDigest",
  );
  if (value.actionCreatedAllowancesAtEnd !== "0") {
    throw new TypeError("action-created allowances must be zero");
  }
  if (!Array.isArray(value.assertions)) {
    throw new TypeError("chain evidence assertions must be an array");
  }
  const assertions = value.assertions.map((assertion, index) => {
    assertClosedObject(assertion, `assertions[${index}]`, [
      "field",
      "satisfied",
    ]);
    assertNonEmptyString(assertion.field, `assertions[${index}].field`);
    if (typeof assertion.satisfied !== "boolean") {
      throw new TypeError(`assertions[${index}].satisfied must be boolean`);
    }
    return { field: assertion.field, satisfied: assertion.satisfied };
  });
  return {
    schemaVersion: "cork.exact-spend-chain-evidence/v1",
    transactionHash: value.transactionHash,
    chainId: value.chainId,
    sender: value.sender,
    target: value.target,
    value: "0",
    payloadDigest: value.payloadDigest as Keccak256Digest,
    executionDigest: value.executionDigest,
    receiptStatus: value.receiptStatus,
    canonical: value.canonical,
    finalized: value.finalized,
    adapterStartingBalancesDigest: value.adapterStartingBalancesDigest,
    adapterEndingBalancesDigest: value.adapterEndingBalancesDigest,
    actionCreatedAllowancesAtEnd: "0",
    assertions,
  };
}

function reconciliationResult(input: {
  readonly finalized: FinalizedExactSpendActionV1;
  readonly status: ExactSpendReconciliationStatusV1;
  readonly retryable: boolean;
  readonly binding?: {
    readonly blockNumber: string;
    readonly blockHash: string;
    readonly parentBlockHash: string;
    readonly providerIds: readonly string[];
  };
  readonly evidence?: ExactSpendChainEvidenceV1;
  readonly effectsVerified: boolean;
  readonly residualsPreserved: boolean;
}): ReconciledExactSpendActionV1 {
  const base = {
    schemaVersion: "cork.exact-spend-reconciliation/v1" as const,
    profile: input.finalized.profile,
    finalizedDigest: input.finalized.finalizedDigest,
    ...(input.evidence === undefined
      ? {}
      : { transactionHash: input.evidence.transactionHash }),
    status: input.status,
    retryable: input.retryable,
    ...(input.binding === undefined ? {} : { canonicalBlock: input.binding }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    effectsVerified: input.effectsVerified,
    residualsPreserved: input.residualsPreserved,
  };
  return deepFreeze({
    ...base,
    reconciliationDigest: sha256CanonicalJson(base as unknown as JsonValue),
  }) as ReconciledExactSpendActionV1;
}

function reconcileExactSpendAction(
  expectedProfile: PreparedExactSpendActionV1["profile"],
  input: ExactSpendReconciliationInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): ReconciledExactSpendActionV1 {
  assertClosedObject(input, "exact-spend reconciliation input", [
    "finalized",
    "evidenceRoots",
    "observations",
  ]);
  const finalized = validateFinalizedExactSpendAction(input.finalized);
  if (finalized.profile !== expectedProfile) {
    throw new TypeError("exact-spend reconciler profile does not match");
  }
  const reconstructed = reconstructPreparedExactSpendAction(
    finalized.prepared,
    input.evidenceRoots,
    evidenceVerifier,
  );
  if (
    canonicalizeJson(reconstructed as unknown as JsonValue) !==
      canonicalizeJson(finalized.prepared as unknown as JsonValue) ||
    finalized.execution.calldata !== reconstructed.bundlerData ||
    finalized.execution.payloadDigest !== reconstructed.payloadDigest
  ) {
    throw new TypeError("PREPARED_ARTIFACT_MISMATCH");
  }
  const quorum = establishPureQuorum(input.observations);
  if (quorum.outcome !== "authoritative") {
    return reconciliationResult({
      finalized,
      status: "conflict",
      retryable: false,
      effectsVerified: false,
      residualsPreserved: false,
    });
  }
  let evidence: ExactSpendChainEvidenceV1;
  try {
    evidence = validateChainEvidence(quorum.value);
  } catch {
    return reconciliationResult({
      finalized,
      status: "conflict",
      retryable: false,
      binding: quorum.binding,
      effectsVerified: false,
      residualsPreserved: false,
    });
  }
  const identityMatches =
    evidence.chainId === finalized.prepared.context.chainId &&
    evidence.sender === finalized.execution.sender &&
    evidence.target === finalized.execution.target &&
    evidence.value === finalized.execution.value &&
    evidence.payloadDigest === finalized.execution.payloadDigest &&
    evidence.executionDigest === finalized.execution.executionDigest;
  if (!identityMatches) {
    return reconciliationResult({
      finalized,
      status: "conflict",
      retryable: false,
      binding: quorum.binding,
      evidence,
      effectsVerified: false,
      residualsPreserved: false,
    });
  }
  const residualsPreserved =
    evidence.adapterStartingBalancesDigest ===
      finalized.prepared.context.adapterStartingBalancesDigest &&
    evidence.adapterEndingBalancesDigest ===
      evidence.adapterStartingBalancesDigest &&
    evidence.actionCreatedAllowancesAtEnd === "0";
  const effectsVerified =
    evidence.assertions.length === finalized.reconciliationProjection.length &&
    evidence.assertions.every(
      (assertion, index) =>
        assertion.field === finalized.reconciliationProjection[index] &&
        assertion.satisfied,
    );
  let status: ExactSpendReconciliationStatusV1;
  let retryable: boolean;
  if (!evidence.canonical) {
    status = "reorged";
    retryable = true;
  } else if (evidence.receiptStatus === "not-found") {
    status = "not-found";
    retryable = true;
  } else if (evidence.receiptStatus === "pending" || !evidence.finalized) {
    status = "pending";
    retryable = true;
  } else if (evidence.receiptStatus === "revert") {
    status = residualsPreserved ? "executed-revert" : "conflict";
    retryable = false;
  } else if (effectsVerified && residualsPreserved) {
    status = "executed-success";
    retryable = false;
  } else {
    status = "conflict";
    retryable = false;
  }
  return reconciliationResult({
    finalized,
    status,
    retryable,
    binding: quorum.binding,
    evidence,
    effectsVerified: status === "executed-success" ? effectsVerified : false,
    residualsPreserved,
  });
}

export function finalizeMintCollateralIn(
  input: ExactSpendFinalizationInputV1,
  verifier: ExactSpendFinalizationVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedExactSpendActionV1 {
  return finalizeExactSpendAction(
    "mint-collateral-in",
    input,
    verifier,
    evidenceVerifier,
  );
}

export function finalizeMintPairedSharesOut(
  input: ExactSpendFinalizationInputV1,
  verifier: ExactSpendFinalizationVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedExactSpendActionV1 {
  return finalizeExactSpendAction(
    "mint-paired-shares-out",
    input,
    verifier,
    evidenceVerifier,
  );
}

export function finalizeRepurchaseCollateralInForSwap(
  input: ExactSpendFinalizationInputV1,
  verifier: ExactSpendFinalizationVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedExactSpendActionV1 {
  return finalizeExactSpendAction(
    "repurchase-collateral-in-for-swap",
    input,
    verifier,
    evidenceVerifier,
  );
}

export function finalizeUnwindCollateralOut(
  input: ExactSpendFinalizationInputV1,
  verifier: ExactSpendFinalizationVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedExactSpendActionV1 {
  return finalizeExactSpendAction(
    "unwind-collateral-out",
    input,
    verifier,
    evidenceVerifier,
  );
}

export function finalizeRedeemPrincipalTokenIn(
  input: ExactSpendFinalizationInputV1,
  verifier: ExactSpendFinalizationVerifierV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): FinalizedExactSpendActionV1 {
  return finalizeExactSpendAction(
    "redeem-principal-token-in",
    input,
    verifier,
    evidenceVerifier,
  );
}

export function simulateMintCollateralIn(
  input: ExactSpendSimulationInputV1,
): SimulationAttestationV1 {
  return simulateExactSpendAction("mint-collateral-in", input);
}

export function simulateMintPairedSharesOut(
  input: ExactSpendSimulationInputV1,
): SimulationAttestationV1 {
  return simulateExactSpendAction("mint-paired-shares-out", input);
}

export function simulateRepurchaseCollateralInForSwap(
  input: ExactSpendSimulationInputV1,
): SimulationAttestationV1 {
  return simulateExactSpendAction("repurchase-collateral-in-for-swap", input);
}

export function simulateUnwindCollateralOut(
  input: ExactSpendSimulationInputV1,
): SimulationAttestationV1 {
  return simulateExactSpendAction("unwind-collateral-out", input);
}

export function simulateRedeemPrincipalTokenIn(
  input: ExactSpendSimulationInputV1,
): SimulationAttestationV1 {
  return simulateExactSpendAction("redeem-principal-token-in", input);
}

export function reconcileMintCollateralIn(
  input: ExactSpendReconciliationInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): ReconciledExactSpendActionV1 {
  return reconcileExactSpendAction(
    "mint-collateral-in",
    input,
    evidenceVerifier,
  );
}

export function reconcileMintPairedSharesOut(
  input: ExactSpendReconciliationInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): ReconciledExactSpendActionV1 {
  return reconcileExactSpendAction(
    "mint-paired-shares-out",
    input,
    evidenceVerifier,
  );
}

export function reconcileRepurchaseCollateralInForSwap(
  input: ExactSpendReconciliationInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): ReconciledExactSpendActionV1 {
  return reconcileExactSpendAction(
    "repurchase-collateral-in-for-swap",
    input,
    evidenceVerifier,
  );
}

export function reconcileUnwindCollateralOut(
  input: ExactSpendReconciliationInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): ReconciledExactSpendActionV1 {
  return reconcileExactSpendAction(
    "unwind-collateral-out",
    input,
    evidenceVerifier,
  );
}

export function reconcileRedeemPrincipalTokenIn(
  input: ExactSpendReconciliationInputV1,
  evidenceVerifier: BrowserSignatureVerifierV1,
): ReconciledExactSpendActionV1 {
  return reconcileExactSpendAction(
    "redeem-principal-token-in",
    input,
    evidenceVerifier,
  );
}

export function createCappedInputUnavailableActions(): readonly CappedInputUnavailableV1[] {
  return deepFreeze(
    CAPPED_INPUT_CAPABILITY_IDS.map((capabilityId) => ({
      schemaVersion: "cork.capped-input-unavailable/v1" as const,
      capabilityId,
      implemented: false as const,
      activated: false as const,
      healthy: false as const,
      callable: false as const,
      error: {
        code: "CAPPED_INPUT_PROTOCOL_UNAVAILABLE" as const,
        message:
          "The exact capped-input onchain protocol is unavailable." as const,
        retryable: false as const,
      },
    })),
  ) as readonly CappedInputUnavailableV1[];
}
