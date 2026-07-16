import {
  assertClosedObject,
  assertCoreBuild,
  assertKeccak256Digest,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  keccak256Digest,
  sha256CanonicalJson,
  type CoreBuildV1,
  type JsonValue,
  type Keccak256Digest,
  type Sha256Digest,
} from "./kernel.js";

export type AccountWrapperV1 =
  | {
      readonly kind: "externally-owned-account";
      readonly from: string;
    }
  | {
      readonly kind: "safe";
      readonly safeAddress: string;
      readonly nonce: string;
      readonly safeTxHash: string;
    };

export interface FrozenBindingV1 {
  readonly field: string;
  readonly value: JsonValue;
}

export interface FrozenExecutionV1 {
  readonly schemaVersion: "cork.frozen-execution/v1";
  readonly sender: string;
  readonly target: string;
  readonly value: string;
  readonly calldata: string;
  readonly payloadDigest: Keccak256Digest;
  readonly executionDigest: Sha256Digest;
  readonly deploymentGeneration: {
    readonly deploymentId: string;
    readonly generation: string;
    readonly payloadDigest: Sha256Digest;
  };
  readonly currentBindings: readonly FrozenBindingV1[];
  readonly accountWrapper: AccountWrapperV1;
}

export type SimulationOutcomeV1 =
  | {
      readonly status: "success";
      readonly traceDigest: Sha256Digest;
      readonly gasUsed: string;
      readonly callResultDigests: readonly Sha256Digest[];
      readonly deltasDigest: Sha256Digest;
      readonly assertionDigests: readonly Sha256Digest[];
    }
  | {
      readonly status: "revert";
      readonly revertData: string;
      readonly decodedReason?: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: {
        readonly code: string;
        readonly message: string;
      };
      readonly remediation: {
        readonly action: string;
        readonly message: string;
      };
    };

export interface SimulationAttestationV1 {
  readonly schemaVersion: "cork.simulation-attestation/v1";
  readonly producerBuild: CoreBuildV1;
  readonly providerIds: readonly string[];
  readonly block?: {
    readonly blockNumber: string;
    readonly blockHash: string;
  };
  readonly simulatedAt: string;
  readonly execution: FrozenExecutionV1;
  readonly outcome: SimulationOutcomeV1;
  readonly attestationDigest: Sha256Digest;
}

export interface CreateSimulationAttestationInputV1 {
  readonly producerBuild: CoreBuildV1;
  readonly providerIds: readonly string[];
  readonly block?: {
    readonly blockNumber: string;
    readonly blockHash: string;
  };
  readonly simulatedAt: string;
  readonly execution: FrozenExecutionV1;
  readonly outcome: SimulationOutcomeV1;
}

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

function assertBytes(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !BYTES.test(value)) {
    throw new TypeError(`${label} must be canonical lowercase bytes`);
  }
}

function assertBytes32(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    throw new TypeError(`${label} must be a lowercase bytes32 value`);
  }
}

function hexBytes(value: string): Uint8Array {
  const output = new Uint8Array((value.length - 2) / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(
      value.slice(2 + index * 2, 4 + index * 2),
      16,
    );
  }
  return output;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function validateAccountWrapper(value: unknown): AccountWrapperV1 {
  if (value !== null && typeof value === "object" && "kind" in value) {
    const record = value as Record<string, unknown>;
    const kind = record.kind;
    if (kind === "externally-owned-account") {
      assertClosedObject(record, "accountWrapper", ["kind", "from"]);
      assertAddress(record.from, "accountWrapper.from");
      return { kind, from: record.from };
    }
    if (kind === "safe") {
      assertClosedObject(record, "accountWrapper", [
        "kind",
        "safeAddress",
        "nonce",
        "safeTxHash",
      ]);
      assertAddress(record.safeAddress, "accountWrapper.safeAddress");
      assertUint256Decimal(record.nonce, "accountWrapper.nonce");
      assertBytes32(record.safeTxHash, "accountWrapper.safeTxHash");
      return {
        kind,
        safeAddress: record.safeAddress,
        nonce: record.nonce,
        safeTxHash: record.safeTxHash,
      };
    }
  }
  throw new TypeError("accountWrapper.kind is not supported");
}

function validateBindings(value: unknown): readonly FrozenBindingV1[] {
  if (!Array.isArray(value)) {
    throw new TypeError("currentBindings must be an array");
  }
  const fields = new Set<string>();
  const bindings = value.map((binding, index) => {
    assertClosedObject(binding, `currentBindings[${index}]`, [
      "field",
      "value",
    ]);
    assertNonEmptyString(binding.field, `currentBindings[${index}].field`);
    if (fields.has(binding.field)) {
      throw new TypeError("current binding fields must be unique");
    }
    fields.add(binding.field);
    canonicalizeJson(binding.value as JsonValue);
    return {
      field: binding.field,
      value: cloneJson(binding.value as JsonValue),
    };
  });
  const ordered = [...bindings].sort((left, right) =>
    left.field.localeCompare(right.field),
  );
  if (
    ordered.some((binding, index) => binding.field !== bindings[index]?.field)
  ) {
    throw new TypeError("current bindings must be ordered by field");
  }
  return bindings;
}

function executionDigestProjection(
  execution: Omit<FrozenExecutionV1, "executionDigest">,
): JsonValue {
  return {
    schemaVersion: execution.schemaVersion,
    sender: execution.sender,
    target: execution.target,
    value: execution.value,
    calldata: execution.calldata,
    payloadDigest: execution.payloadDigest,
    deploymentGeneration:
      execution.deploymentGeneration as unknown as JsonValue,
    currentBindings: execution.currentBindings as unknown as JsonValue,
    accountWrapper: execution.accountWrapper as unknown as JsonValue,
  };
}

export function validateFrozenExecution(value: unknown): FrozenExecutionV1 {
  assertClosedObject(value, "frozen execution", [
    "schemaVersion",
    "sender",
    "target",
    "value",
    "calldata",
    "payloadDigest",
    "executionDigest",
    "deploymentGeneration",
    "currentBindings",
    "accountWrapper",
  ]);
  if (value.schemaVersion !== "cork.frozen-execution/v1") {
    throw new TypeError("frozen execution schema version is not supported");
  }
  assertAddress(value.sender, "frozen execution.sender");
  assertAddress(value.target, "frozen execution.target");
  assertUint256Decimal(value.value, "frozen execution.value");
  assertBytes(value.calldata, "frozen execution.calldata");
  assertKeccak256Digest(value.payloadDigest, "frozen execution.payloadDigest");
  const computedPayloadDigest = keccak256Digest(hexBytes(value.calldata));
  if (value.payloadDigest !== computedPayloadDigest) {
    throw new TypeError("payload digest does not match exact calldata");
  }
  assertSha256Digest(value.executionDigest, "frozen execution.executionDigest");
  assertClosedObject(value.deploymentGeneration, "deploymentGeneration", [
    "deploymentId",
    "generation",
    "payloadDigest",
  ]);
  assertNonEmptyString(
    value.deploymentGeneration.deploymentId,
    "deploymentGeneration.deploymentId",
  );
  assertUint256Decimal(
    value.deploymentGeneration.generation,
    "deploymentGeneration.generation",
  );
  assertSha256Digest(
    value.deploymentGeneration.payloadDigest,
    "deploymentGeneration.payloadDigest",
  );
  const currentBindings = validateBindings(value.currentBindings);
  const accountWrapper = validateAccountWrapper(value.accountWrapper);
  const withoutDigest: Omit<FrozenExecutionV1, "executionDigest"> = {
    schemaVersion: "cork.frozen-execution/v1",
    sender: value.sender,
    target: value.target,
    value: value.value,
    calldata: value.calldata,
    payloadDigest: value.payloadDigest,
    deploymentGeneration: {
      deploymentId: value.deploymentGeneration.deploymentId,
      generation: value.deploymentGeneration.generation,
      payloadDigest: value.deploymentGeneration.payloadDigest,
    },
    currentBindings,
    accountWrapper,
  };
  const computedExecutionDigest = sha256CanonicalJson(
    executionDigestProjection(withoutDigest),
  );
  if (value.executionDigest !== computedExecutionDigest) {
    throw new TypeError(
      "execution digest does not match unchanged execution bindings",
    );
  }
  return deepFreeze({
    ...withoutDigest,
    executionDigest: value.executionDigest,
  }) as FrozenExecutionV1;
}

export function createFrozenExecution(
  input: Omit<FrozenExecutionV1, "payloadDigest" | "executionDigest">,
): FrozenExecutionV1 {
  assertClosedObject(input, "frozen execution input", [
    "schemaVersion",
    "sender",
    "target",
    "value",
    "calldata",
    "deploymentGeneration",
    "currentBindings",
    "accountWrapper",
  ]);
  assertBytes(input.calldata, "frozen execution input.calldata");
  const payloadDigest = keccak256Digest(hexBytes(input.calldata));
  const candidate = {
    ...input,
    payloadDigest,
  } as Omit<FrozenExecutionV1, "executionDigest">;
  const executionDigest = sha256CanonicalJson(
    executionDigestProjection(candidate),
  );
  return validateFrozenExecution({ ...candidate, executionDigest });
}

function validateDigestArray(
  value: unknown,
  label: string,
): readonly Sha256Digest[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value.map((digest, index) => {
    assertSha256Digest(digest, `${label}[${index}]`);
    return digest;
  });
}

function validateOutcome(value: unknown): SimulationOutcomeV1 {
  if (value !== null && typeof value === "object" && "status" in value) {
    const record = value as Record<string, unknown>;
    const status = record.status;
    if (status === "success") {
      assertClosedObject(record, "outcome", [
        "status",
        "traceDigest",
        "gasUsed",
        "callResultDigests",
        "deltasDigest",
        "assertionDigests",
      ]);
      assertSha256Digest(record.traceDigest, "outcome.traceDigest");
      assertUint256Decimal(record.gasUsed, "outcome.gasUsed");
      const callResultDigests = validateDigestArray(
        record.callResultDigests,
        "outcome.callResultDigests",
      );
      assertSha256Digest(record.deltasDigest, "outcome.deltasDigest");
      const assertionDigests = validateDigestArray(
        record.assertionDigests,
        "outcome.assertionDigests",
      );
      return {
        status,
        traceDigest: record.traceDigest,
        gasUsed: record.gasUsed,
        callResultDigests,
        deltasDigest: record.deltasDigest,
        assertionDigests,
      };
    }
    if (status === "revert") {
      assertClosedObject(
        record,
        "outcome",
        ["status", "revertData"],
        ["decodedReason"],
      );
      assertBytes(record.revertData, "outcome.revertData");
      if (record.decodedReason !== undefined) {
        assertNonEmptyString(record.decodedReason, "outcome.decodedReason");
      }
      return {
        status,
        revertData: record.revertData,
        ...(record.decodedReason === undefined
          ? {}
          : { decodedReason: record.decodedReason }),
      };
    }
    if (status === "unavailable") {
      assertClosedObject(record, "outcome", [
        "status",
        "reason",
        "remediation",
      ]);
      assertClosedObject(record.reason, "outcome.reason", ["code", "message"]);
      assertNonEmptyString(record.reason.code, "outcome.reason.code");
      assertNonEmptyString(record.reason.message, "outcome.reason.message");
      assertClosedObject(record.remediation, "outcome.remediation", [
        "action",
        "message",
      ]);
      assertNonEmptyString(
        record.remediation.action,
        "outcome.remediation.action",
      );
      assertNonEmptyString(
        record.remediation.message,
        "outcome.remediation.message",
      );
      return {
        status,
        reason: {
          code: record.reason.code,
          message: record.reason.message,
        },
        remediation: {
          action: record.remediation.action,
          message: record.remediation.message,
        },
      };
    }
  }
  throw new TypeError("simulation outcome status is not supported");
}

function validateProviderIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("providerIds must be a non-empty array");
  }
  const seen = new Set<string>();
  return value.map((providerId, index) => {
    assertNonEmptyString(providerId, `providerIds[${index}]`);
    if (seen.has(providerId)) {
      throw new TypeError("providerIds must be unique and ordered");
    }
    seen.add(providerId);
    return providerId;
  });
}

function validateBlock(value: unknown): SimulationAttestationV1["block"] {
  assertClosedObject(value, "simulation block", ["blockNumber", "blockHash"]);
  assertUint256Decimal(value.blockNumber, "simulation block.blockNumber");
  assertBytes32(value.blockHash, "simulation block.blockHash");
  return { blockNumber: value.blockNumber, blockHash: value.blockHash };
}

function attestationProjection(
  input: Omit<SimulationAttestationV1, "attestationDigest">,
): JsonValue {
  return input as unknown as JsonValue;
}

export function createSimulationAttestation(
  input: CreateSimulationAttestationInputV1,
): SimulationAttestationV1 {
  assertClosedObject(
    input,
    "simulation input",
    ["producerBuild", "providerIds", "simulatedAt", "execution", "outcome"],
    ["block"],
  );
  assertCoreBuild(input.producerBuild, "producerBuild");
  const providerIds = validateProviderIds(input.providerIds);
  const block =
    input.block === undefined ? undefined : validateBlock(input.block);
  assertUint256Decimal(input.simulatedAt, "simulatedAt");
  const execution = validateFrozenExecution(input.execution);
  const outcome = validateOutcome(input.outcome);
  const withoutDigest: Omit<SimulationAttestationV1, "attestationDigest"> = {
    schemaVersion: "cork.simulation-attestation/v1",
    producerBuild: {
      packageVersion: input.producerBuild.packageVersion,
      sourceCommit: input.producerBuild.sourceCommit,
      schemaDigest: input.producerBuild.schemaDigest,
    },
    providerIds,
    ...(block === undefined ? {} : { block }),
    simulatedAt: input.simulatedAt,
    execution,
    outcome,
  };
  const attestationDigest = sha256CanonicalJson(
    attestationProjection(withoutDigest),
  );
  return deepFreeze({
    ...withoutDigest,
    attestationDigest,
  }) as SimulationAttestationV1;
}

export function validateSimulationAttestation(
  value: unknown,
): SimulationAttestationV1 {
  assertClosedObject(
    value,
    "simulation attestation",
    [
      "schemaVersion",
      "producerBuild",
      "providerIds",
      "simulatedAt",
      "execution",
      "outcome",
      "attestationDigest",
    ],
    ["block"],
  );
  if (value.schemaVersion !== "cork.simulation-attestation/v1") {
    throw new TypeError(
      "simulation attestation schema version is not supported",
    );
  }
  assertSha256Digest(value.attestationDigest, "attestationDigest");
  const rebuilt = createSimulationAttestation({
    producerBuild: value.producerBuild as CoreBuildV1,
    providerIds: value.providerIds as readonly string[],
    ...(value.block === undefined
      ? {}
      : {
          block: value.block as {
            readonly blockNumber: string;
            readonly blockHash: string;
          },
        }),
    simulatedAt: value.simulatedAt as string,
    execution: value.execution as FrozenExecutionV1,
    outcome: value.outcome as SimulationOutcomeV1,
  });
  if (rebuilt.attestationDigest !== value.attestationDigest) {
    throw new TypeError("simulation attestation digest does not match");
  }
  return rebuilt;
}

export function refreshSimulationAttestation(
  previousInput: unknown,
  input: CreateSimulationAttestationInputV1,
): SimulationAttestationV1 {
  const previous = validateSimulationAttestation(previousInput);
  const execution = validateFrozenExecution(input.execution);
  if (
    canonicalizeJson(previous.execution as unknown as JsonValue) !==
    canonicalizeJson(execution as unknown as JsonValue)
  ) {
    throw new TypeError(
      "simulation refresh requires identical frozen bytes and identities",
    );
  }
  return createSimulationAttestation({ ...input, execution });
}
