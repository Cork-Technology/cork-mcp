import {
  assertClosedObject,
  assertSha256Digest,
  assertUint256Decimal,
  canonicalizeJson,
  deepFreeze,
  sha256CanonicalJson,
  type JsonValue,
  type Sha256Digest,
} from "./kernel.js";

export interface IndependentlyPinnedBlockV1 {
  readonly kind: "independently-pinned";
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly parentBlockHash: string;
}

interface RawObservationBaseV1 {
  readonly schemaVersion: "cork.raw-observation/v1";
  readonly providerId: string;
  readonly administrationId: string;
  readonly sourceId: string;
  readonly requestDigest: Sha256Digest;
  readonly sourceCommit: string;
  readonly sourceSchemaDigest: Sha256Digest;
  readonly observedAt: string;
  readonly block?: IndependentlyPinnedBlockV1;
}

export interface RawObservationSuccessV1 extends RawObservationBaseV1 {
  readonly kind: "success";
  readonly value: JsonValue;
}

export interface RawObservationFailureV1 extends RawObservationBaseV1 {
  readonly kind: "failure";
  readonly failure: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export type RawObservationV1 =
  | RawObservationSuccessV1
  | RawObservationFailureV1;

export interface QuorumBindingV1 {
  readonly sourceId: string;
  readonly requestDigest: Sha256Digest;
  readonly sourceCommit: string;
  readonly sourceSchemaDigest: Sha256Digest;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly parentBlockHash: string;
  readonly observedAt: string;
  readonly providerIds: readonly string[];
  readonly administrationIds: readonly string[];
}

export type QuorumResultV1 =
  | {
      readonly schemaVersion: "cork.quorum/v1";
      readonly outcome: "authoritative";
      readonly binding: QuorumBindingV1;
      readonly value: JsonValue;
      readonly quorumDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.quorum/v1";
      readonly outcome: "unavailable";
      readonly code:
        | "INVALID_OBSERVATION"
        | "OBSERVATION_FAILURE"
        | "INDEPENDENCE_REQUIRED"
        | "BINDING_MISMATCH"
        | "VALUE_MISMATCH";
    };

type QuorumUnavailableCodeV1 = Extract<
  QuorumResultV1,
  { readonly outcome: "unavailable" }
>["code"];

export type FreshnessCheckV1 =
  | {
      readonly kind: "exact-binding";
      readonly field: string;
      readonly bound: JsonValue;
      readonly current: JsonValue;
    }
  | {
      readonly kind: "sufficient-threshold";
      readonly field: string;
      readonly minimum: string;
      readonly current: string;
    }
  | {
      readonly kind: "fixed-bit";
      readonly field: string;
      readonly bitPosition: string;
      readonly expectedSet: boolean;
      readonly currentBitmapWord: string;
    }
  | {
      readonly kind: "exact-authority";
      readonly field: string;
      readonly bound: JsonValue;
      readonly current: JsonValue;
    };

export interface FreshnessInputV1 {
  readonly binding: QuorumBindingV1;
  readonly currentHead: string;
  readonly currentTime: string;
  readonly checks: readonly FreshnessCheckV1[];
}

export interface FreshnessFailureV1 {
  readonly field: string;
  readonly code:
    | "OBSERVATION_AHEAD_OF_CURRENT"
    | "OBSERVATION_TOO_MANY_HEADS_BEHIND"
    | "OBSERVATION_TOO_OLD"
    | "EXACT_BINDING_CHANGED"
    | "THRESHOLD_NOT_MET"
    | "FIXED_BIT_CHANGED"
    | "AUTHORITY_CHANGED";
}

export interface FreshnessResultV1 {
  readonly schemaVersion: "cork.freshness/v1";
  readonly outcome: "fresh" | "stale";
  readonly failures: readonly FreshnessFailureV1[];
  readonly freshnessDigest: Sha256Digest;
}

const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const BLOCK_HASH = /^0x[0-9a-f]{64}$/u;

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

function assertBlockHash(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !BLOCK_HASH.test(value)) {
    throw new TypeError(`${label} must be a lowercase bytes32 value`);
  }
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function validateBlock(
  value: unknown,
  label: string,
): IndependentlyPinnedBlockV1 {
  assertClosedObject(value, label, [
    "kind",
    "blockNumber",
    "blockHash",
    "parentBlockHash",
  ]);
  if (value.kind !== "independently-pinned") {
    throw new TypeError(`${label}.kind must be independently-pinned`);
  }
  assertUint256Decimal(value.blockNumber, `${label}.blockNumber`);
  assertBlockHash(value.blockHash, `${label}.blockHash`);
  assertBlockHash(value.parentBlockHash, `${label}.parentBlockHash`);
  return {
    kind: "independently-pinned",
    blockNumber: value.blockNumber,
    blockHash: value.blockHash,
    parentBlockHash: value.parentBlockHash,
  };
}

function validateBase(
  value: Record<string, unknown>,
  label: string,
): RawObservationBaseV1 {
  if (value.schemaVersion !== "cork.raw-observation/v1") {
    throw new TypeError(`${label}.schemaVersion is not supported`);
  }
  assertNonEmptyString(value.providerId, `${label}.providerId`);
  assertNonEmptyString(value.administrationId, `${label}.administrationId`);
  assertNonEmptyString(value.sourceId, `${label}.sourceId`);
  assertSha256Digest(value.requestDigest, `${label}.requestDigest`);
  assertSourceCommit(value.sourceCommit, `${label}.sourceCommit`);
  assertSha256Digest(value.sourceSchemaDigest, `${label}.sourceSchemaDigest`);
  assertUint256Decimal(value.observedAt, `${label}.observedAt`);
  const block =
    value.block === undefined
      ? undefined
      : validateBlock(value.block, `${label}.block`);
  return {
    schemaVersion: "cork.raw-observation/v1",
    providerId: value.providerId,
    administrationId: value.administrationId,
    sourceId: value.sourceId,
    requestDigest: value.requestDigest,
    sourceCommit: value.sourceCommit,
    sourceSchemaDigest: value.sourceSchemaDigest,
    observedAt: value.observedAt,
    ...(block === undefined ? {} : { block }),
  };
}

export function validateRawObservation(value: unknown): RawObservationV1 {
  if (value !== null && typeof value === "object" && "kind" in value) {
    const record = value as Record<string, unknown>;
    const kind = record.kind;
    if (kind === "success") {
      assertClosedObject(
        record,
        "raw observation",
        [
          "schemaVersion",
          "kind",
          "providerId",
          "administrationId",
          "sourceId",
          "requestDigest",
          "sourceCommit",
          "sourceSchemaDigest",
          "observedAt",
          "value",
        ],
        ["block"],
      );
      canonicalizeJson(record.value as JsonValue);
      const base = validateBase(record, "raw observation");
      return deepFreeze({
        ...base,
        kind: "success",
        value: cloneJson(record.value as JsonValue),
      }) as RawObservationSuccessV1;
    }
    if (kind === "failure") {
      assertClosedObject(
        record,
        "raw observation",
        [
          "schemaVersion",
          "kind",
          "providerId",
          "administrationId",
          "sourceId",
          "requestDigest",
          "sourceCommit",
          "sourceSchemaDigest",
          "observedAt",
          "failure",
        ],
        ["block"],
      );
      assertClosedObject(record.failure, "raw observation.failure", [
        "code",
        "message",
        "retryable",
      ]);
      assertNonEmptyString(record.failure.code, "raw observation.failure.code");
      assertNonEmptyString(
        record.failure.message,
        "raw observation.failure.message",
      );
      if (typeof record.failure.retryable !== "boolean") {
        throw new TypeError(
          "raw observation.failure.retryable must be boolean",
        );
      }
      const base = validateBase(record, "raw observation");
      return deepFreeze({
        ...base,
        kind: "failure",
        failure: {
          code: record.failure.code,
          message: record.failure.message,
          retryable: record.failure.retryable,
        },
      }) as RawObservationFailureV1;
    }
  }
  throw new TypeError("raw observation kind is not supported");
}

function unavailable(code: QuorumUnavailableCodeV1): QuorumResultV1 {
  return deepFreeze({
    schemaVersion: "cork.quorum/v1",
    outcome: "unavailable",
    code,
  }) as QuorumResultV1;
}

function sameBinding(
  left: RawObservationSuccessV1,
  right: RawObservationSuccessV1,
): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.requestDigest === right.requestDigest &&
    left.sourceCommit === right.sourceCommit &&
    left.sourceSchemaDigest === right.sourceSchemaDigest &&
    left.block !== undefined &&
    right.block !== undefined &&
    left.block.blockNumber === right.block.blockNumber &&
    left.block.blockHash === right.block.blockHash &&
    left.block.parentBlockHash === right.block.parentBlockHash
  );
}

export function establishPureQuorum(
  observationsInput: readonly unknown[],
): QuorumResultV1 {
  if (!Array.isArray(observationsInput) || observationsInput.length !== 2) {
    return unavailable("INVALID_OBSERVATION");
  }
  let observations: readonly RawObservationV1[];
  try {
    observations = observationsInput.map(validateRawObservation);
  } catch {
    return unavailable("INVALID_OBSERVATION");
  }
  const left = observations[0];
  const right = observations[1];
  if (left === undefined || right === undefined) {
    return unavailable("INVALID_OBSERVATION");
  }
  if (left.kind === "failure" || right.kind === "failure") {
    return unavailable("OBSERVATION_FAILURE");
  }
  if (
    left.providerId === right.providerId ||
    left.administrationId === right.administrationId
  ) {
    return unavailable("INDEPENDENCE_REQUIRED");
  }
  if (!sameBinding(left, right)) {
    return unavailable("BINDING_MISMATCH");
  }
  if (canonicalizeJson(left.value) !== canonicalizeJson(right.value)) {
    return unavailable("VALUE_MISMATCH");
  }
  const block = left.block;
  if (block === undefined) {
    return unavailable("BINDING_MISMATCH");
  }
  const binding: QuorumBindingV1 = {
    sourceId: left.sourceId,
    requestDigest: left.requestDigest,
    sourceCommit: left.sourceCommit,
    sourceSchemaDigest: left.sourceSchemaDigest,
    blockNumber: block.blockNumber,
    blockHash: block.blockHash,
    parentBlockHash: block.parentBlockHash,
    observedAt:
      BigInt(left.observedAt) >= BigInt(right.observedAt)
        ? left.observedAt
        : right.observedAt,
    providerIds: [left.providerId, right.providerId],
    administrationIds: [left.administrationId, right.administrationId],
  };
  const value = cloneJson(left.value);
  const quorumDigest = sha256CanonicalJson({
    binding: binding as unknown as JsonValue,
    value,
  });
  return deepFreeze({
    schemaVersion: "cork.quorum/v1",
    outcome: "authoritative",
    binding,
    value,
    quorumDigest,
  }) as QuorumResultV1;
}

function validateQuorumBinding(value: unknown): QuorumBindingV1 {
  assertClosedObject(value, "freshness.binding", [
    "sourceId",
    "requestDigest",
    "sourceCommit",
    "sourceSchemaDigest",
    "blockNumber",
    "blockHash",
    "parentBlockHash",
    "observedAt",
    "providerIds",
    "administrationIds",
  ]);
  assertNonEmptyString(value.sourceId, "freshness.binding.sourceId");
  assertSha256Digest(value.requestDigest, "freshness.binding.requestDigest");
  assertSourceCommit(value.sourceCommit, "freshness.binding.sourceCommit");
  assertSha256Digest(
    value.sourceSchemaDigest,
    "freshness.binding.sourceSchemaDigest",
  );
  assertUint256Decimal(value.blockNumber, "freshness.binding.blockNumber");
  assertBlockHash(value.blockHash, "freshness.binding.blockHash");
  assertBlockHash(value.parentBlockHash, "freshness.binding.parentBlockHash");
  assertUint256Decimal(value.observedAt, "freshness.binding.observedAt");
  if (
    !Array.isArray(value.providerIds) ||
    value.providerIds.length !== 2 ||
    !Array.isArray(value.administrationIds) ||
    value.administrationIds.length !== 2
  ) {
    throw new TypeError("freshness binding must contain two identities");
  }
  const providerIds = value.providerIds.map((entry, index) => {
    assertNonEmptyString(entry, `freshness.binding.providerIds[${index}]`);
    return entry;
  });
  const administrationIds = value.administrationIds.map((entry, index) => {
    assertNonEmptyString(
      entry,
      `freshness.binding.administrationIds[${index}]`,
    );
    return entry;
  });
  if (
    providerIds[0] === providerIds[1] ||
    administrationIds[0] === administrationIds[1]
  ) {
    throw new TypeError("freshness binding identities must be independent");
  }
  return {
    sourceId: value.sourceId,
    requestDigest: value.requestDigest,
    sourceCommit: value.sourceCommit,
    sourceSchemaDigest: value.sourceSchemaDigest,
    blockNumber: value.blockNumber,
    blockHash: value.blockHash,
    parentBlockHash: value.parentBlockHash,
    observedAt: value.observedAt,
    providerIds,
    administrationIds,
  };
}

function validateFreshnessCheck(
  value: unknown,
  index: number,
): FreshnessCheckV1 {
  if (value !== null && typeof value === "object" && "kind" in value) {
    const record = value as Record<string, unknown>;
    const kind = record.kind;
    if (kind === "exact-binding" || kind === "exact-authority") {
      assertClosedObject(record, `checks[${index}]`, [
        "kind",
        "field",
        "bound",
        "current",
      ]);
      assertNonEmptyString(record.field, `checks[${index}].field`);
      canonicalizeJson(record.bound as JsonValue);
      canonicalizeJson(record.current as JsonValue);
      return {
        kind,
        field: record.field,
        bound: cloneJson(record.bound as JsonValue),
        current: cloneJson(record.current as JsonValue),
      };
    }
    if (kind === "sufficient-threshold") {
      assertClosedObject(record, `checks[${index}]`, [
        "kind",
        "field",
        "minimum",
        "current",
      ]);
      assertNonEmptyString(record.field, `checks[${index}].field`);
      assertUint256Decimal(record.minimum, `checks[${index}].minimum`);
      assertUint256Decimal(record.current, `checks[${index}].current`);
      return {
        kind,
        field: record.field,
        minimum: record.minimum,
        current: record.current,
      };
    }
    if (kind === "fixed-bit") {
      assertClosedObject(record, `checks[${index}]`, [
        "kind",
        "field",
        "bitPosition",
        "expectedSet",
        "currentBitmapWord",
      ]);
      assertNonEmptyString(record.field, `checks[${index}].field`);
      assertUint256Decimal(record.bitPosition, `checks[${index}].bitPosition`);
      if (BigInt(record.bitPosition) > 255n) {
        throw new RangeError(`checks[${index}].bitPosition exceeds 255`);
      }
      if (typeof record.expectedSet !== "boolean") {
        throw new TypeError(`checks[${index}].expectedSet must be boolean`);
      }
      assertUint256Decimal(
        record.currentBitmapWord,
        `checks[${index}].currentBitmapWord`,
      );
      return {
        kind,
        field: record.field,
        bitPosition: record.bitPosition,
        expectedSet: record.expectedSet,
        currentBitmapWord: record.currentBitmapWord,
      };
    }
  }
  throw new TypeError(`checks[${index}] kind is not supported`);
}

export function evaluateFieldFreshness(
  input: FreshnessInputV1,
): FreshnessResultV1 {
  assertClosedObject(input, "freshness input", [
    "binding",
    "currentHead",
    "currentTime",
    "checks",
  ]);
  const binding = validateQuorumBinding(input.binding);
  assertUint256Decimal(input.currentHead, "currentHead");
  assertUint256Decimal(input.currentTime, "currentTime");
  if (!Array.isArray(input.checks)) {
    throw new TypeError("checks must be an array");
  }
  const checks = input.checks.map(validateFreshnessCheck);
  const failures: FreshnessFailureV1[] = [];
  const currentHead = BigInt(input.currentHead);
  const observationHead = BigInt(binding.blockNumber);
  if (observationHead > currentHead) {
    failures.push({
      field: "binding.blockNumber",
      code: "OBSERVATION_AHEAD_OF_CURRENT",
    });
  } else if (currentHead - observationHead > 2n) {
    failures.push({
      field: "binding.blockNumber",
      code: "OBSERVATION_TOO_MANY_HEADS_BEHIND",
    });
  }
  const currentTime = BigInt(input.currentTime);
  const observedAt = BigInt(binding.observedAt);
  if (observedAt > currentTime) {
    failures.push({
      field: "binding.observedAt",
      code: "OBSERVATION_AHEAD_OF_CURRENT",
    });
  } else if (currentTime - observedAt > 60n) {
    failures.push({
      field: "binding.observedAt",
      code: "OBSERVATION_TOO_OLD",
    });
  }
  for (const check of checks) {
    switch (check.kind) {
      case "exact-binding":
        if (canonicalizeJson(check.bound) !== canonicalizeJson(check.current)) {
          failures.push({
            field: check.field,
            code: "EXACT_BINDING_CHANGED",
          });
        }
        break;
      case "sufficient-threshold":
        if (BigInt(check.current) < BigInt(check.minimum)) {
          failures.push({ field: check.field, code: "THRESHOLD_NOT_MET" });
        }
        break;
      case "fixed-bit": {
        const mask = 1n << BigInt(check.bitPosition);
        const currentSet = (BigInt(check.currentBitmapWord) & mask) !== 0n;
        if (currentSet !== check.expectedSet) {
          failures.push({ field: check.field, code: "FIXED_BIT_CHANGED" });
        }
        break;
      }
      case "exact-authority":
        if (canonicalizeJson(check.bound) !== canonicalizeJson(check.current)) {
          failures.push({ field: check.field, code: "AUTHORITY_CHANGED" });
        }
        break;
    }
  }
  const outcome = failures.length === 0 ? "fresh" : "stale";
  const freshnessDigest = sha256CanonicalJson({
    binding: binding as unknown as JsonValue,
    currentHead: input.currentHead,
    currentTime: input.currentTime,
    checks: checks as unknown as JsonValue,
    outcome,
    failures: failures as unknown as JsonValue,
  });
  return deepFreeze({
    schemaVersion: "cork.freshness/v1",
    outcome,
    failures,
    freshnessDigest,
  }) as FreshnessResultV1;
}
