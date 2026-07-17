import {
  assertClosedObject,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  keccak256Bytes,
  sha256CanonicalJson,
  type JsonValue,
  type Sha256Digest,
} from "./kernel.js";
import { type PermitAuthorizationRequestV1 } from "./actions.js";

export interface SafeConfigurationV1 {
  readonly safeAddress: string;
  readonly singletonAddress: string;
  readonly singletonCodeHash: string;
  readonly safeVersion: string;
  readonly owners: readonly [string, string, string];
  readonly threshold: "2";
  readonly fallbackHandlerAddress: string;
  readonly fallbackHandlerCodeHash: string;
  readonly guardAddress: string;
  readonly enabledModules: readonly [];
  readonly nonce: string;
}

export interface ApprovedSafePolicyV1 {
  readonly schemaVersion: "cork.safe-policy/v1";
  readonly singletonAddress: string;
  readonly singletonCodeHash: string;
  readonly safeVersion: string;
  readonly fallbackHandlerAddress: string;
  readonly fallbackHandlerCodeHash: string;
  readonly policyDigest: Sha256Digest;
}

export interface SafeCallProposalV1 {
  readonly schemaVersion: "cork.safe-call-proposal/v1";
  readonly safeConfiguration: SafeConfigurationV1;
  readonly authorityDigest: Sha256Digest;
  readonly to: string;
  readonly value: "0";
  readonly data: string;
  readonly operation: "call";
  readonly safeTxGas: "0";
  readonly baseGas: "0";
  readonly gasPrice: "0";
  readonly gasToken: string;
  readonly refundReceiver: string;
  readonly nonce: string;
  readonly safeTxHash: string;
  readonly transactionAuthorization: "caller-owned-not-collected";
  readonly submission: "not-submitted";
  readonly proposalDigest: Sha256Digest;
}

export interface Eip1271VerificationInputV1 {
  readonly safeAddress: string;
  readonly digest: Sha256Digest;
  readonly signatureBlob: string;
}

export interface Eip1271VerificationSeamV1 {
  verify(input: Eip1271VerificationInputV1): string;
}

export interface SafeMessageSignatureArtifactV1 {
  readonly id: "permit-cpt" | "permit-cst";
  readonly signatureBlob: string;
}

export interface SafePermitAuthorizationV1 {
  readonly schemaVersion: "cork.safe-permit-authorization/v1";
  readonly safeConfiguration: SafeConfigurationV1;
  readonly authorityDigest: Sha256Digest;
  readonly messages: readonly [
    {
      readonly id: "permit-cpt";
      readonly permitDigest: Sha256Digest;
      readonly signatureBlob: string;
      readonly validation: "eip-1271-magic-0x1626ba7e";
    },
    {
      readonly id: "permit-cst";
      readonly permitDigest: Sha256Digest;
      readonly signatureBlob: string;
      readonly validation: "eip-1271-magic-0x1626ba7e";
    },
  ];
  readonly transactionAuthorization: "caller-owned-not-collected";
  readonly authorizationDigest: Sha256Digest;
}

export interface SafeExecutionWrapperV1 {
  readonly schemaVersion: "cork.safe-execution-wrapper/v1";
  readonly safeConfiguration: SafeConfigurationV1;
  readonly authorityDigest: Sha256Digest;
  readonly permitAuthorization: SafePermitAuthorizationV1;
  readonly to: string;
  readonly value: "0";
  readonly data: string;
  readonly operation: "call";
  readonly safeTxGas: "0";
  readonly baseGas: "0";
  readonly gasPrice: "0";
  readonly gasToken: string;
  readonly refundReceiver: string;
  readonly nonce: string;
  readonly safeTxHash: string;
  readonly transactionAuthorization: "caller-owned-not-collected";
  readonly wrapperDigest: Sha256Digest;
}

const ADDRESS = /^0x[0-9a-f]{40}$/u;
const BYTES = /^0x(?:[0-9a-f]{2})+$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const MAGIC_VALUE = "0x1626ba7e";

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

function assertBytes(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !BYTES.test(value)) {
    throw new TypeError(`${label} must be non-empty canonical lowercase bytes`);
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
  const output = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    output[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return output;
}

function addressWord(value: string): Uint8Array {
  assertAddress(value, "Safe hash address");
  const output = new Uint8Array(32);
  output.set(hexToBytes(value), 12);
  return output;
}

function typeHash(value: string): Uint8Array {
  return keccak256Bytes(new TextEncoder().encode(value));
}

function validatePolicy(value: unknown): ApprovedSafePolicyV1 {
  assertClosedObject(value, "Safe policy", [
    "schemaVersion",
    "singletonAddress",
    "singletonCodeHash",
    "safeVersion",
    "fallbackHandlerAddress",
    "fallbackHandlerCodeHash",
    "policyDigest",
  ]);
  if (value.schemaVersion !== "cork.safe-policy/v1") {
    throw new TypeError("Safe policy schema version is not supported");
  }
  assertAddress(value.singletonAddress, "Safe policy.singletonAddress");
  assertBytes32(value.singletonCodeHash, "Safe policy.singletonCodeHash");
  assertNonEmptyString(value.safeVersion, "Safe policy.safeVersion");
  assertAddress(
    value.fallbackHandlerAddress,
    "Safe policy.fallbackHandlerAddress",
  );
  assertBytes32(
    value.fallbackHandlerCodeHash,
    "Safe policy.fallbackHandlerCodeHash",
  );
  assertSha256Digest(value.policyDigest, "Safe policy.policyDigest");
  return {
    schemaVersion: "cork.safe-policy/v1",
    singletonAddress: value.singletonAddress,
    singletonCodeHash: value.singletonCodeHash,
    safeVersion: value.safeVersion,
    fallbackHandlerAddress: value.fallbackHandlerAddress,
    fallbackHandlerCodeHash: value.fallbackHandlerCodeHash,
    policyDigest: value.policyDigest,
  };
}

export function safeAuthorityDigest(
  configuration: SafeConfigurationV1,
): Sha256Digest {
  return sha256CanonicalJson({
    safeAddress: configuration.safeAddress,
    singletonAddress: configuration.singletonAddress,
    singletonCodeHash: configuration.singletonCodeHash,
    safeVersion: configuration.safeVersion,
    owners: configuration.owners,
    threshold: configuration.threshold,
    fallbackHandlerAddress: configuration.fallbackHandlerAddress,
    fallbackHandlerCodeHash: configuration.fallbackHandlerCodeHash,
    guardAddress: configuration.guardAddress,
    enabledModules: configuration.enabledModules,
  });
}

export function validateSafeConfiguration(
  value: unknown,
  policyInput: ApprovedSafePolicyV1,
): SafeConfigurationV1 {
  const policy = validatePolicy(policyInput);
  assertClosedObject(value, "Safe configuration", [
    "safeAddress",
    "singletonAddress",
    "singletonCodeHash",
    "safeVersion",
    "owners",
    "threshold",
    "fallbackHandlerAddress",
    "fallbackHandlerCodeHash",
    "guardAddress",
    "enabledModules",
    "nonce",
  ]);
  assertAddress(value.safeAddress, "safeAddress");
  assertAddress(value.singletonAddress, "singletonAddress");
  assertBytes32(value.singletonCodeHash, "singletonCodeHash");
  assertNonEmptyString(value.safeVersion, "safeVersion");
  assertAddress(value.fallbackHandlerAddress, "fallbackHandlerAddress");
  assertBytes32(value.fallbackHandlerCodeHash, "fallbackHandlerCodeHash");
  assertAddress(value.guardAddress, "guardAddress");
  assertUint256Decimal(value.nonce, "nonce");
  if (
    value.singletonAddress !== policy.singletonAddress ||
    value.singletonCodeHash !== policy.singletonCodeHash ||
    value.safeVersion !== policy.safeVersion ||
    value.fallbackHandlerAddress !== policy.fallbackHandlerAddress ||
    value.fallbackHandlerCodeHash !== policy.fallbackHandlerCodeHash
  ) {
    throw new TypeError("Safe singleton, version, or handler is not approved");
  }
  if (value.threshold !== "2" || value.guardAddress !== ZERO_ADDRESS) {
    throw new TypeError("Safe must have threshold two and zero guard");
  }
  if (
    !Array.isArray(value.enabledModules) ||
    value.enabledModules.length !== 0
  ) {
    throw new TypeError("Safe modules are not supported");
  }
  if (!Array.isArray(value.owners) || value.owners.length !== 3) {
    throw new TypeError("Safe must have exactly three owners");
  }
  const owners = value.owners.map((owner, index) => {
    assertAddress(owner, `owners[${index}]`);
    return owner;
  }) as [string, string, string];
  if (
    new Set(owners).size !== 3 ||
    [...owners].sort().some((owner, index) => owner !== owners[index])
  ) {
    throw new TypeError("Safe owners must be unique and sorted");
  }
  return deepFreeze({
    safeAddress: value.safeAddress,
    singletonAddress: value.singletonAddress,
    singletonCodeHash: value.singletonCodeHash,
    safeVersion: value.safeVersion,
    owners,
    threshold: "2",
    fallbackHandlerAddress: value.fallbackHandlerAddress,
    fallbackHandlerCodeHash: value.fallbackHandlerCodeHash,
    guardAddress: ZERO_ADDRESS,
    enabledModules: [],
    nonce: value.nonce,
  }) as SafeConfigurationV1;
}

function validateRequirements(
  value: unknown,
): readonly [PermitAuthorizationRequestV1, PermitAuthorizationRequestV1] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError("exactly two Permit2 requirements are required");
  }
  const requirements = value as readonly PermitAuthorizationRequestV1[];
  if (
    requirements[0]?.id !== "permit-cpt" ||
    requirements[1]?.id !== "permit-cst" ||
    requirements[0].validationMode !== "safe-contract-signature" ||
    requirements[1].validationMode !== "safe-contract-signature" ||
    requirements[0].typedDataDigest === requirements[1].typedDataDigest
  ) {
    throw new TypeError("Safe Permit2 requirements are substituted or merged");
  }
  for (const [index, requirement] of requirements.entries()) {
    assertClosedObject(requirement, `requirements[${index}]`, [
      "id",
      "tokenRole",
      "signer",
      "validationMode",
      "typedData",
      "typedDataDigest",
      "nonce",
      "wordPosition",
      "bitPosition",
      "insertion",
    ]);
    assertSha256Digest(
      requirement.typedDataDigest,
      `requirements[${index}].typedDataDigest`,
    );
  }
  return requirements as readonly [
    PermitAuthorizationRequestV1,
    PermitAuthorizationRequestV1,
  ];
}

export function authorizeSafePermitMessages(
  input: {
    readonly configuration: SafeConfigurationV1;
    readonly policy: ApprovedSafePolicyV1;
    readonly requirements: readonly [
      PermitAuthorizationRequestV1,
      PermitAuthorizationRequestV1,
    ];
    readonly signatureArtifacts: readonly SafeMessageSignatureArtifactV1[];
  },
  verifier: Eip1271VerificationSeamV1,
): SafePermitAuthorizationV1 {
  assertClosedObject(input, "Safe permit authorization input", [
    "configuration",
    "policy",
    "requirements",
    "signatureArtifacts",
  ]);
  const configuration = validateSafeConfiguration(
    input.configuration,
    input.policy,
  );
  const requirements = validateRequirements(input.requirements);
  if (
    requirements.some(
      (requirement) => requirement.signer !== configuration.safeAddress,
    )
  ) {
    throw new TypeError("Permit2 requirements are bound to a different Safe");
  }
  if (
    verifier === null ||
    typeof verifier !== "object" ||
    typeof verifier.verify !== "function"
  ) {
    throw new TypeError("an injected EIP-1271 verifier is required");
  }
  if (
    !Array.isArray(input.signatureArtifacts) ||
    input.signatureArtifacts.length !== 2
  ) {
    throw new TypeError("exactly two Safe message blobs are required");
  }
  const artifacts = input.signatureArtifacts.map((artifact, index) => {
    assertClosedObject(artifact, `signatureArtifacts[${index}]`, [
      "id",
      "signatureBlob",
    ]);
    const id = index === 0 ? "permit-cpt" : "permit-cst";
    if (artifact.id !== id) {
      throw new TypeError("Safe message blobs must remain role-separated");
    }
    assertBytes(
      artifact.signatureBlob,
      `signatureArtifacts[${index}].signatureBlob`,
    );
    if (
      verifier.verify({
        safeAddress: configuration.safeAddress,
        digest: requirements[index]!.typedDataDigest,
        signatureBlob: artifact.signatureBlob,
      }) !== MAGIC_VALUE
    ) {
      throw new TypeError("Safe message signature failed EIP-1271 validation");
    }
    return { id, signatureBlob: artifact.signatureBlob };
  }) as unknown as readonly [
    SafeMessageSignatureArtifactV1,
    SafeMessageSignatureArtifactV1,
  ];
  if (artifacts[0].signatureBlob === artifacts[1].signatureBlob) {
    throw new TypeError("Safe message blobs must be distinct");
  }
  const authorityDigest = safeAuthorityDigest(configuration);
  const messages = [
    {
      id: "permit-cpt" as const,
      permitDigest: requirements[0].typedDataDigest,
      signatureBlob: artifacts[0].signatureBlob,
      validation: "eip-1271-magic-0x1626ba7e" as const,
    },
    {
      id: "permit-cst" as const,
      permitDigest: requirements[1].typedDataDigest,
      signatureBlob: artifacts[1].signatureBlob,
      validation: "eip-1271-magic-0x1626ba7e" as const,
    },
  ] as const;
  const withoutDigest: Omit<SafePermitAuthorizationV1, "authorizationDigest"> =
    {
      schemaVersion: "cork.safe-permit-authorization/v1",
      safeConfiguration: configuration,
      authorityDigest,
      messages,
      transactionAuthorization: "caller-owned-not-collected",
    };
  return deepFreeze({
    ...withoutDigest,
    authorizationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as SafePermitAuthorizationV1;
}

function safeTxHash(input: {
  readonly safeAddress: string;
  readonly chainId: string;
  readonly to: string;
  readonly data: string;
  readonly nonce: string;
}): string {
  const domainSeparator = keccak256Bytes(
    concatBytes([
      typeHash("EIP712Domain(uint256 chainId,address verifyingContract)"),
      uintWord(BigInt(input.chainId)),
      addressWord(input.safeAddress),
    ]),
  );
  const transactionStruct = keccak256Bytes(
    concatBytes([
      typeHash(
        "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)",
      ),
      addressWord(input.to),
      uintWord(0n),
      keccak256Bytes(hexToBytes(input.data)),
      uintWord(0n),
      uintWord(0n),
      uintWord(0n),
      uintWord(0n),
      addressWord(ZERO_ADDRESS),
      addressWord(ZERO_ADDRESS),
      uintWord(BigInt(input.nonce)),
    ]),
  );
  const digest = keccak256Bytes(
    concatBytes([
      new Uint8Array([0x19, 0x01]),
      domainSeparator,
      transactionStruct,
    ]),
  );
  return `0x${bytesToHex(digest)}`;
}

export function createSafeCallProposal(input: {
  readonly configuration: SafeConfigurationV1;
  readonly policy: ApprovedSafePolicyV1;
  readonly chainId: string;
  readonly to: string;
  readonly data: string;
}): SafeCallProposalV1 {
  assertClosedObject(input, "Safe call proposal input", [
    "configuration",
    "policy",
    "chainId",
    "to",
    "data",
  ]);
  const configuration = validateSafeConfiguration(
    input.configuration,
    input.policy,
  );
  assertUint256Decimal(input.chainId, "chainId");
  assertAddress(input.to, "to");
  assertBytes(input.data, "data");
  const withoutDigest: Omit<SafeCallProposalV1, "proposalDigest"> = {
    schemaVersion: "cork.safe-call-proposal/v1",
    safeConfiguration: configuration,
    authorityDigest: safeAuthorityDigest(configuration),
    to: input.to,
    value: "0",
    data: input.data,
    operation: "call",
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce: configuration.nonce,
    safeTxHash: safeTxHash({
      safeAddress: configuration.safeAddress,
      chainId: input.chainId,
      to: input.to,
      data: input.data,
      nonce: configuration.nonce,
    }),
    transactionAuthorization: "caller-owned-not-collected",
    submission: "not-submitted",
  };
  return deepFreeze({
    ...withoutDigest,
    proposalDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as SafeCallProposalV1;
}

function validatePermitAuthorization(
  value: unknown,
  configuration: SafeConfigurationV1,
  verifier: Eip1271VerificationSeamV1,
): SafePermitAuthorizationV1 {
  assertClosedObject(value, "Safe permit authorization", [
    "schemaVersion",
    "safeConfiguration",
    "authorityDigest",
    "messages",
    "transactionAuthorization",
    "authorizationDigest",
  ]);
  if (
    value.schemaVersion !== "cork.safe-permit-authorization/v1" ||
    value.transactionAuthorization !== "caller-owned-not-collected"
  ) {
    throw new TypeError("Safe permit authorization schema is not supported");
  }
  assertSha256Digest(value.authorityDigest, "authorization.authorityDigest");
  assertSha256Digest(
    value.authorizationDigest,
    "authorization.authorizationDigest",
  );
  if (
    value.authorityDigest !== safeAuthorityDigest(configuration) ||
    canonicalizeJson(value.safeConfiguration as unknown as JsonValue) !==
      canonicalizeJson(configuration as unknown as JsonValue)
  ) {
    throw new TypeError("Safe permit authorization configuration is stale");
  }
  if (!Array.isArray(value.messages) || value.messages.length !== 2) {
    throw new TypeError("Safe permit authorization requires two messages");
  }
  const messages = value.messages.map((message, index) => {
    assertClosedObject(message, `authorization.messages[${index}]`, [
      "id",
      "permitDigest",
      "signatureBlob",
      "validation",
    ]);
    const id = index === 0 ? "permit-cpt" : "permit-cst";
    if (
      message.id !== id ||
      message.validation !== "eip-1271-magic-0x1626ba7e"
    ) {
      throw new TypeError("Safe messages are unordered or relabeled");
    }
    assertSha256Digest(
      message.permitDigest,
      `authorization.messages[${index}].permitDigest`,
    );
    assertBytes(
      message.signatureBlob,
      `authorization.messages[${index}].signatureBlob`,
    );
    if (
      verifier.verify({
        safeAddress: configuration.safeAddress,
        digest: message.permitDigest,
        signatureBlob: message.signatureBlob,
      }) !== MAGIC_VALUE
    ) {
      throw new TypeError("Safe message revalidation failed");
    }
    return {
      id,
      permitDigest: message.permitDigest,
      signatureBlob: message.signatureBlob,
      validation: "eip-1271-magic-0x1626ba7e" as const,
    };
  }) as unknown as SafePermitAuthorizationV1["messages"];
  if (
    messages[0].permitDigest === messages[1].permitDigest ||
    messages[0].signatureBlob === messages[1].signatureBlob
  ) {
    throw new TypeError("Safe message roles must remain distinct");
  }
  const withoutDigest: Omit<SafePermitAuthorizationV1, "authorizationDigest"> =
    {
      schemaVersion: "cork.safe-permit-authorization/v1",
      safeConfiguration: configuration,
      authorityDigest: value.authorityDigest,
      messages,
      transactionAuthorization: "caller-owned-not-collected",
    };
  const authorizationDigest = sha256CanonicalJson(
    withoutDigest as unknown as JsonValue,
  );
  if (authorizationDigest !== value.authorizationDigest) {
    throw new TypeError("Safe permit authorization digest does not match");
  }
  return deepFreeze({
    ...withoutDigest,
    authorizationDigest,
  }) as SafePermitAuthorizationV1;
}

function rebuildAuthorization(
  authorization: SafePermitAuthorizationV1,
  configuration: SafeConfigurationV1,
): SafePermitAuthorizationV1 {
  if (authorization.authorityDigest !== safeAuthorityDigest(configuration)) {
    throw new TypeError(
      "Safe authority changed; restart both Permit2 message stages",
    );
  }
  const withoutDigest: Omit<SafePermitAuthorizationV1, "authorizationDigest"> =
    {
      schemaVersion: "cork.safe-permit-authorization/v1",
      safeConfiguration: configuration,
      authorityDigest: authorization.authorityDigest,
      messages: authorization.messages,
      transactionAuthorization: "caller-owned-not-collected",
    };
  return deepFreeze({
    ...withoutDigest,
    authorizationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as SafePermitAuthorizationV1;
}

function buildWrapper(input: {
  readonly configuration: SafeConfigurationV1;
  readonly authorization: SafePermitAuthorizationV1;
  readonly chainId: string;
  readonly bundler3: string;
  readonly bundlerData: string;
}): SafeExecutionWrapperV1 {
  assertUint256Decimal(input.chainId, "chainId");
  assertAddress(input.bundler3, "bundler3");
  assertBytes(input.bundlerData, "bundlerData");
  const authorization = rebuildAuthorization(
    input.authorization,
    input.configuration,
  );
  const hash = safeTxHash({
    safeAddress: input.configuration.safeAddress,
    chainId: input.chainId,
    to: input.bundler3,
    data: input.bundlerData,
    nonce: input.configuration.nonce,
  });
  const withoutDigest: Omit<SafeExecutionWrapperV1, "wrapperDigest"> = {
    schemaVersion: "cork.safe-execution-wrapper/v1",
    safeConfiguration: input.configuration,
    authorityDigest: authorization.authorityDigest,
    permitAuthorization: authorization,
    to: input.bundler3,
    value: "0",
    data: input.bundlerData,
    operation: "call",
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce: input.configuration.nonce,
    safeTxHash: hash,
    transactionAuthorization: "caller-owned-not-collected",
  };
  return deepFreeze({
    ...withoutDigest,
    wrapperDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as SafeExecutionWrapperV1;
}

export function createSafeExecutionWrapper(
  input: {
    readonly configuration: SafeConfigurationV1;
    readonly policy: ApprovedSafePolicyV1;
    readonly authorization: SafePermitAuthorizationV1;
    readonly chainId: string;
    readonly bundler3: string;
    readonly bundlerData: string;
  },
  verifier: Eip1271VerificationSeamV1,
): SafeExecutionWrapperV1 {
  assertClosedObject(input, "Safe wrapper input", [
    "configuration",
    "policy",
    "authorization",
    "chainId",
    "bundler3",
    "bundlerData",
  ]);
  const configuration = validateSafeConfiguration(
    input.configuration,
    input.policy,
  );
  const authorization = validatePermitAuthorization(
    input.authorization,
    configuration,
    verifier,
  );
  return buildWrapper({
    configuration,
    authorization,
    chainId: input.chainId,
    bundler3: input.bundler3,
    bundlerData: input.bundlerData,
  });
}

export function rebuildSafeWrapperForNonce(
  previous: SafeExecutionWrapperV1,
  input: {
    readonly configuration: SafeConfigurationV1;
    readonly policy: ApprovedSafePolicyV1;
    readonly chainId: string;
  },
  verifier: Eip1271VerificationSeamV1,
): SafeExecutionWrapperV1 {
  assertClosedObject(input, "Safe nonce rebuild input", [
    "configuration",
    "policy",
    "chainId",
  ]);
  const configuration = validateSafeConfiguration(
    input.configuration,
    input.policy,
  );
  if (
    safeAuthorityDigest(previous.safeConfiguration) !==
      safeAuthorityDigest(configuration) ||
    previous.authorityDigest !== safeAuthorityDigest(configuration)
  ) {
    throw new TypeError(
      "Safe authority changed; a nonce-only rebuild is not permitted",
    );
  }
  assertBytes32(previous.safeTxHash, "previous.safeTxHash");
  const previousConfiguration = validateSafeConfiguration(
    previous.safeConfiguration,
    input.policy,
  );
  const previousAuthorization = validatePermitAuthorization(
    previous.permitAuthorization,
    previousConfiguration,
    verifier,
  );
  const reconstructedPrevious = buildWrapper({
    configuration: previousConfiguration,
    authorization: previousAuthorization,
    chainId: input.chainId,
    bundler3: previous.to,
    bundlerData: previous.data,
  });
  if (
    canonicalizeJson(reconstructedPrevious as unknown as JsonValue) !==
    canonicalizeJson(previous as unknown as JsonValue)
  ) {
    throw new TypeError("previous Safe wrapper does not match reconstruction");
  }
  return buildWrapper({
    configuration,
    authorization: previousAuthorization,
    chainId: input.chainId,
    bundler3: previous.to,
    bundlerData: previous.data,
  });
}
