export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const OPERATION_STATES = [
  "read-result",
  "invalid",
  "unavailable",
  "prerequisite",
  "prepared",
  "finalized",
  "executable",
  "permit2-revocation",
  "submitted",
  "reconciled",
] as const;

export type OperationStateV1 = (typeof OPERATION_STATES)[number];
export type AccountKindV1 = "externally-owned-account" | "safe";
export type Sha256Digest = `sha256:${string}`;
export type Keccak256Digest = `keccak256:${string}`;
export type OperationIdV1 = `op_${string}`;

export interface CoreBuildV1 {
  readonly packageVersion: string;
  readonly sourceCommit: string;
  readonly schemaDigest: Sha256Digest;
}

export interface AccountV1 {
  readonly kind: AccountKindV1;
  readonly address: string;
}

export interface WarningV1 {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface InvalidIssueV1 {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly expected: string;
  readonly actual: string;
  readonly retryable: false;
}

export interface UnavailableReasonV1 {
  readonly code: string;
  readonly message: string;
  readonly dependency: string;
  readonly retryable: boolean;
  readonly retryAfter?: string;
}

interface OperationEnvelopeV1 {
  readonly schemaVersion: "cork.operation/v1";
  readonly state: OperationStateV1;
  readonly coreBuild: CoreBuildV1;
  readonly createdAt: string;
  readonly warnings?: readonly WarningV1[];
}

interface IdentityEnvelopeV1 extends OperationEnvelopeV1 {
  readonly operationId: OperationIdV1;
  readonly intentDigest: Sha256Digest;
  readonly account: AccountV1;
  readonly chainId: string;
  readonly deploymentId: string;
}

export interface ReadResultV1 extends OperationEnvelopeV1 {
  readonly state: "read-result";
  readonly resultDigest: Sha256Digest;
}

export interface InvalidOperationV1 extends OperationEnvelopeV1 {
  readonly state: "invalid";
  readonly receivedInputDigest: Sha256Digest;
  readonly issues: readonly InvalidIssueV1[];
}

export interface UnavailableOperationV1 extends OperationEnvelopeV1 {
  readonly state: "unavailable";
  readonly receivedInputDigest?: Sha256Digest;
  readonly affectedArtifactDigest?: Sha256Digest;
  readonly reason: UnavailableReasonV1;
  readonly operationId?: OperationIdV1;
  readonly intentDigest?: Sha256Digest;
  readonly account?: AccountV1;
  readonly chainId?: string;
  readonly deploymentId?: string;
}

export interface PrerequisiteOperationV1 extends IdentityEnvelopeV1 {
  readonly state: "prerequisite";
  readonly artifactDigest: Sha256Digest;
}

export interface PreparedOperationV1 extends IdentityEnvelopeV1 {
  readonly state: "prepared";
  readonly artifactDigest: Sha256Digest;
}

export interface FinalizedOperationV1 extends IdentityEnvelopeV1 {
  readonly state: "finalized";
  readonly artifactDigest: Sha256Digest;
  readonly executionDigest: Keccak256Digest;
}

export interface ExecutableOperationV1 extends IdentityEnvelopeV1 {
  readonly state: "executable";
  readonly artifactDigest: Sha256Digest;
  readonly executionDigest: Keccak256Digest;
  readonly certificateDigest: Sha256Digest;
}

export interface Permit2RevocationOperationV1 extends IdentityEnvelopeV1 {
  readonly state: "permit2-revocation";
  readonly artifactDigest: Sha256Digest;
  readonly executionDigest: Keccak256Digest;
}

export interface SubmittedOperationV1 extends OperationEnvelopeV1 {
  readonly state: "submitted";
  readonly submissionDigest: Sha256Digest;
}

export interface ReconciledOperationV1 extends OperationEnvelopeV1 {
  readonly state: "reconciled";
  readonly reconciliationDigest: Sha256Digest;
}

export type OperationResultV1 =
  | ReadResultV1
  | InvalidOperationV1
  | UnavailableOperationV1
  | PrerequisiteOperationV1
  | PreparedOperationV1
  | FinalizedOperationV1
  | ExecutableOperationV1
  | Permit2RevocationOperationV1
  | SubmittedOperationV1
  | ReconciledOperationV1;

export interface OperationIdentityInputV1 {
  readonly intent: JsonValue;
  readonly account: AccountV1;
  readonly deploymentId: string;
  readonly chainId: string;
  readonly clientRequestId: string;
}

interface BuilderBase {
  readonly state: OperationStateV1;
  readonly coreBuild: CoreBuildV1;
  readonly createdAt: string;
  readonly warnings?: readonly WarningV1[];
}

type BoundBuilderBase = BuilderBase & {
  readonly identity: OperationIdentityInputV1;
};

export type OperationResultBuilderInput =
  | (BuilderBase & {
      readonly state: "read-result";
      readonly resultDigest: Sha256Digest;
    })
  | (BuilderBase & {
      readonly state: "invalid";
      readonly receivedInput: JsonValue;
      readonly issues: readonly InvalidIssueV1[];
    })
  | (BuilderBase & {
      readonly state: "unavailable";
      readonly receivedInput?: JsonValue;
      readonly identity?: OperationIdentityInputV1;
      readonly affectedArtifactDigest?: Sha256Digest;
      readonly reason: UnavailableReasonV1;
    })
  | (BoundBuilderBase & {
      readonly state: "prerequisite" | "prepared";
      readonly artifactDigest: Sha256Digest;
    })
  | (BoundBuilderBase & {
      readonly state: "finalized" | "permit2-revocation";
      readonly artifactDigest: Sha256Digest;
      readonly executionDigest: Keccak256Digest;
    })
  | (BoundBuilderBase & {
      readonly state: "executable";
      readonly artifactDigest: Sha256Digest;
      readonly executionDigest: Keccak256Digest;
      readonly certificateDigest: Sha256Digest;
    })
  | (BuilderBase & {
      readonly state: "submitted";
      readonly submissionDigest: Sha256Digest;
    })
  | (BuilderBase & {
      readonly state: "reconciled";
      readonly reconciliationDigest: Sha256Digest;
    });

const UINT_DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const ADDRESS = /^0x[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const KECCAK256 = /^keccak256:[0-9a-f]{64}$/u;
const OPERATION_ID = /^op_[0-9a-f]{32}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const SEMVER =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const MAX_UINT256 = (1n << 256n) - 1n;
const DERIVED_INTENT_FIELDS = new Set([
  "state",
  "operationId",
  "intentDigest",
  "coreBuild",
  "createdAt",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDataProperties(value: object, label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError(`${label} contains a symbol key`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new TypeError(`${label}.${key} must be a data property`);
    }
  }
}

export function assertClosedObject(
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  assertDataProperties(value, label);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (Reflect.ownKeys(value).length !== keys.length) {
    throw new TypeError(`${label} contains a non-enumerable property`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`${label}.${key} is required`);
    }
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new TypeError(`${label}.${key} is not allowed`);
    }
  }
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  assertUnicodeScalarString(value, label);
}

export function assertUnicodeScalarString(
  value: string,
  label = "string",
): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(`${label} contains a lone high surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`${label} contains a lone low surrogate`);
    }
  }
}

function quoteCanonicalString(value: string): string {
  assertUnicodeScalarString(value);
  let output = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    switch (code) {
      case 0x08:
        output += "\\b";
        break;
      case 0x09:
        output += "\\t";
        break;
      case 0x0a:
        output += "\\n";
        break;
      case 0x0c:
        output += "\\f";
        break;
      case 0x0d:
        output += "\\r";
        break;
      case 0x22:
        output += '\\"';
        break;
      case 0x5c:
        output += "\\\\";
        break;
      default:
        if (code <= 0x1f) {
          output += `\\u${code.toString(16).padStart(4, "0")}`;
        } else if (code >= 0xd800 && code <= 0xdbff) {
          output += value.slice(index, index + 2);
          index += 1;
        } else {
          output += value[index];
        }
    }
  }
  return `${output}"`;
}

function assertCanonicalArrayShape(
  value: readonly unknown[],
  label: string,
): void {
  assertDataProperties(value, label);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} contains a symbol key`);
  }
  const expectedKeys = new Set(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    expectedKeys.add(key);
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`${label} must not be sparse`);
    }
  }
  for (const key of ownKeys) {
    if (!expectedKeys.has(key as string)) {
      throw new TypeError(`${label}.${String(key)} is not a JSON array index`);
    }
  }
}

function canonicalizeInternal(
  value: unknown,
  stack: Set<object>,
  label: string,
): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return quoteCanonicalString(value);
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(`${label} must be a finite number`);
      }
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new TypeError(`${label} cannot be serialized`);
      }
      return serialized;
    }
    case "object": {
      if (stack.has(value)) {
        throw new TypeError(`${label} contains a cycle`);
      }
      stack.add(value);
      try {
        if (Array.isArray(value)) {
          assertCanonicalArrayShape(value, label);
          return `[${value
            .map((item, index) =>
              canonicalizeInternal(item, stack, `${label}[${index}]`),
            )
            .join(",")}]`;
        }
        if (!isPlainObject(value)) {
          throw new TypeError(`${label} must contain only plain JSON objects`);
        }
        assertDataProperties(value, label);
        const keys = Object.keys(value);
        if (Reflect.ownKeys(value).length !== keys.length) {
          throw new TypeError(`${label} contains a non-enumerable property`);
        }
        keys.sort();
        const entries = keys.map((key) => {
          assertUnicodeScalarString(key, `${label} key`);
          return `${quoteCanonicalString(key)}:${canonicalizeInternal(
            value[key],
            stack,
            `${label}.${key}`,
          )}`;
        });
        return `{${entries.join(",")}}`;
      } finally {
        stack.delete(value);
      }
    }
    default:
      throw new TypeError(`${label} contains unsupported ${typeof value}`);
  }
}

export function canonicalizeJson(value: JsonValue): string {
  return canonicalizeInternal(value, new Set(), "$");
}

function assertBytes(
  value: unknown,
  label: string,
): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_ROUND = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight32(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

export function sha256Bytes(input: Uint8Array): Uint8Array {
  assertBytes(input, "input");
  const bitLength = BigInt(input.length) * 8n;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 1 - index] = Number(
      (bitLength >> BigInt(index * 8)) & 0xffn,
    );
  }

  const hash = new Uint32Array(SHA256_INITIAL);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] =
        ((padded[base] ?? 0) << 24) |
        ((padded[base + 1] ?? 0) << 16) |
        ((padded[base + 2] ?? 0) << 8) |
        (padded[base + 3] ?? 0);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15] ?? 0;
      const previous2 = words[index - 2] ?? 0;
      const sigma0 =
        rotateRight32(previous15, 7) ^
        rotateRight32(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight32(previous2, 17) ^
        rotateRight32(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        ((words[index - 16] ?? 0) +
          sigma0 +
          (words[index - 7] ?? 0) +
          sigma1) >>>
        0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 =
        (h +
          sum1 +
          choose +
          (SHA256_ROUND[index] ?? 0) +
          (words[index] ?? 0)) >>>
        0;
      const sum0 =
        rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < hash.length; index += 1) {
    const word = hash[index] ?? 0;
    output[index * 4] = word >>> 24;
    output[index * 4 + 1] = word >>> 16;
    output[index * 4 + 2] = word >>> 8;
    output[index * 4 + 3] = word;
  }
  return output;
}

export function sha256CanonicalJson(value: JsonValue): Sha256Digest {
  const bytes = new TextEncoder().encode(canonicalizeJson(value));
  return `sha256:${bytesToHex(sha256Bytes(bytes))}`;
}

const MASK_64 = (1n << 64n) - 1n;
const KECCAK_RATE_BYTES = 136;
const KECCAK_ROTATION = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
] as const;
const KECCAK_ROUND = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
] as const;

function rotateLeft64(value: bigint, shift: number): bigint {
  if (shift === 0) return value & MASK_64;
  const amount = BigInt(shift);
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function keccakPermutation(state: bigint[]): void {
  for (const roundConstant of KECCAK_ROUND) {
    const column = new Array<bigint>(5).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      column[x] =
        (state[x] ?? 0n) ^
        (state[x + 5] ?? 0n) ^
        (state[x + 10] ?? 0n) ^
        (state[x + 15] ?? 0n) ^
        (state[x + 20] ?? 0n);
    }
    const delta = new Array<bigint>(5).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      delta[x] =
        (column[(x + 4) % 5] ?? 0n) ^
        rotateLeft64(column[(x + 1) % 5] ?? 0n, 1);
    }
    for (let index = 0; index < 25; index += 1) {
      state[index] =
        ((state[index] ?? 0n) ^ (delta[index % 5] ?? 0n)) & MASK_64;
    }

    const rotated = new Array<bigint>(25).fill(0n);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const source = x + 5 * y;
        const targetX = y;
        const targetY = (2 * x + 3 * y) % 5;
        rotated[targetX + 5 * targetY] = rotateLeft64(
          state[source] ?? 0n,
          KECCAK_ROTATION[source] ?? 0,
        );
      }
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const current = rotated[x + 5 * y] ?? 0n;
        const next = rotated[((x + 1) % 5) + 5 * y] ?? 0n;
        const nextNext = rotated[((x + 2) % 5) + 5 * y] ?? 0n;
        state[x + 5 * y] = (current ^ (~next & MASK_64 & nextNext)) & MASK_64;
      }
    }
    state[0] = ((state[0] ?? 0n) ^ roundConstant) & MASK_64;
  }
}

export function keccak256Bytes(input: Uint8Array): Uint8Array {
  assertBytes(input, "input");
  const paddedLength =
    Math.floor(input.length / KECCAK_RATE_BYTES + 1) * KECCAK_RATE_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = (padded[input.length] ?? 0) ^ 0x01;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) ^ 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += KECCAK_RATE_BYTES) {
    for (let lane = 0; lane < KECCAK_RATE_BYTES / 8; lane += 1) {
      let value = 0n;
      for (let byte = 0; byte < 8; byte += 1) {
        value |=
          BigInt(padded[offset + lane * 8 + byte] ?? 0) << BigInt(byte * 8);
      }
      state[lane] = ((state[lane] ?? 0n) ^ value) & MASK_64;
    }
    keccakPermutation(state);
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(
      ((state[Math.floor(index / 8)] ?? 0n) >> BigInt((index % 8) * 8)) & 0xffn,
    );
  }
  return output;
}

export function keccak256Digest(input: Uint8Array): Keccak256Digest {
  return `keccak256:${bytesToHex(keccak256Bytes(input))}`;
}

export function assertSha256Digest(
  value: unknown,
  label = "digest",
): asserts value is Sha256Digest {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${label} must be a lowercase sha256 digest`);
  }
}

export function assertKeccak256Digest(
  value: unknown,
  label = "digest",
): asserts value is Keccak256Digest {
  if (typeof value !== "string" || !KECCAK256.test(value)) {
    throw new TypeError(`${label} must be a lowercase keccak256 digest`);
  }
}

export function assertUint256Decimal(
  value: unknown,
  label = "unsigned integer",
): asserts value is string {
  if (typeof value !== "string" || !UINT_DECIMAL.test(value)) {
    throw new TypeError(`${label} must be a canonical unsigned decimal string`);
  }
  if (BigInt(value) > MAX_UINT256) {
    throw new RangeError(`${label} exceeds uint256`);
  }
}

export function assertAccount(
  value: unknown,
  label = "account",
): asserts value is AccountV1 {
  assertClosedObject(value, label, ["kind", "address"]);
  if (value.kind !== "externally-owned-account" && value.kind !== "safe") {
    throw new TypeError(`${label}.kind is not supported`);
  }
  if (typeof value.address !== "string" || !ADDRESS.test(value.address)) {
    throw new TypeError(`${label}.address must be a lowercase address`);
  }
}

export function assertCoreBuild(
  value: unknown,
  label = "coreBuild",
): asserts value is CoreBuildV1 {
  assertClosedObject(value, label, [
    "packageVersion",
    "sourceCommit",
    "schemaDigest",
  ]);
  if (
    typeof value.packageVersion !== "string" ||
    !SEMVER.test(value.packageVersion)
  ) {
    throw new TypeError(
      `${label}.packageVersion must be an exact semantic version`,
    );
  }
  if (
    typeof value.sourceCommit !== "string" ||
    !SOURCE_COMMIT.test(value.sourceCommit)
  ) {
    throw new TypeError(
      `${label}.sourceCommit must be 40 lowercase hexadecimal characters`,
    );
  }
  assertSha256Digest(value.schemaDigest, `${label}.schemaDigest`);
}

function encodeUint256(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_UINT256)
    throw new RangeError("uint256 out of range");
  const output = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    output[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return output;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function encodeStringTail(value: string): Uint8Array {
  assertUnicodeScalarString(value);
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil(bytes.length / 32) * 32;
  const payload = new Uint8Array(paddedLength);
  payload.set(bytes);
  return concatBytes([encodeUint256(BigInt(bytes.length)), payload]);
}

function encodeAddress(value: string): Uint8Array {
  if (!ADDRESS.test(value)) throw new TypeError("address must be lowercase");
  const output = new Uint8Array(32);
  output.set(hexToBytes(value.slice(2)), 12);
  return output;
}

function encodeOperationIdentityAbi(input: {
  readonly account: AccountV1;
  readonly deploymentId: string;
  readonly chainId: string;
  readonly clientRequestId: string;
  readonly intentDigest: Sha256Digest;
}): Uint8Array {
  const dynamicValues = [
    "cork.operation/v1/operation-id",
    input.account.kind,
    input.deploymentId,
    input.clientRequestId,
  ].map(encodeStringTail);
  const headLength = 7 * 32;
  let dynamicOffset = headLength;
  const head: Uint8Array[] = [];
  head.push(encodeUint256(BigInt(dynamicOffset)));
  dynamicOffset += dynamicValues[0]?.length ?? 0;
  head.push(encodeUint256(BigInt(dynamicOffset)));
  dynamicOffset += dynamicValues[1]?.length ?? 0;
  head.push(encodeAddress(input.account.address));
  head.push(encodeUint256(BigInt(dynamicOffset)));
  dynamicOffset += dynamicValues[2]?.length ?? 0;
  head.push(encodeUint256(BigInt(input.chainId)));
  head.push(encodeUint256(BigInt(dynamicOffset)));
  head.push(hexToBytes(input.intentDigest.slice("sha256:".length)));
  return concatBytes([...head, ...dynamicValues]);
}

export function deriveOperationId(input: {
  readonly account: AccountV1;
  readonly deploymentId: string;
  readonly chainId: string;
  readonly clientRequestId: string;
  readonly intentDigest: Sha256Digest;
}): OperationIdV1 {
  assertClosedObject(input, "operation identity", [
    "account",
    "deploymentId",
    "chainId",
    "clientRequestId",
    "intentDigest",
  ]);
  assertAccount(input.account);
  assertNonEmptyString(input.deploymentId, "deploymentId");
  assertUint256Decimal(input.chainId, "chainId");
  assertNonEmptyString(input.clientRequestId, "clientRequestId");
  assertSha256Digest(input.intentDigest, "intentDigest");
  const digest = keccak256Bytes(encodeOperationIdentityAbi(input));
  return `op_${bytesToHex(digest.slice(0, 16))}`;
}

function validateWarnings(value: unknown): readonly WarningV1[] {
  if (!Array.isArray(value)) throw new TypeError("warnings must be an array");
  return value.map((warning, index) => {
    assertClosedObject(
      warning,
      `warnings[${index}]`,
      ["code", "message"],
      ["path"],
    );
    assertNonEmptyString(warning.code, `warnings[${index}].code`);
    assertNonEmptyString(warning.message, `warnings[${index}].message`);
    if (warning.path !== undefined) {
      assertNonEmptyString(warning.path, `warnings[${index}].path`);
    }
    return {
      code: warning.code,
      message: warning.message,
      ...(warning.path === undefined ? {} : { path: warning.path }),
    };
  });
}

function validateIssues(value: unknown): readonly InvalidIssueV1[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("issues must be a non-empty array");
  }
  return value.map((issue, index) => {
    assertClosedObject(issue, `issues[${index}]`, [
      "code",
      "path",
      "message",
      "expected",
      "actual",
      "retryable",
    ]);
    const code = issue.code;
    const path = issue.path;
    const message = issue.message;
    const expected = issue.expected;
    const actual = issue.actual;
    assertNonEmptyString(code, `issues[${index}].code`);
    assertNonEmptyString(path, `issues[${index}].path`);
    assertNonEmptyString(message, `issues[${index}].message`);
    assertNonEmptyString(expected, `issues[${index}].expected`);
    assertNonEmptyString(actual, `issues[${index}].actual`);
    if (issue.retryable !== false) {
      throw new TypeError(`issues[${index}].retryable must be false`);
    }
    return {
      code,
      path,
      message,
      expected,
      actual,
      retryable: false,
    };
  });
}

function validateReason(value: unknown): UnavailableReasonV1 {
  assertClosedObject(
    value,
    "reason",
    ["code", "message", "dependency", "retryable"],
    ["retryAfter"],
  );
  assertNonEmptyString(value.code, "reason.code");
  assertNonEmptyString(value.message, "reason.message");
  assertNonEmptyString(value.dependency, "reason.dependency");
  if (typeof value.retryable !== "boolean") {
    throw new TypeError("reason.retryable must be a boolean");
  }
  if (value.retryAfter !== undefined) {
    assertUint256Decimal(value.retryAfter, "reason.retryAfter");
  }
  return {
    code: value.code,
    message: value.message,
    dependency: value.dependency,
    retryable: value.retryable,
    ...(value.retryAfter === undefined ? {} : { retryAfter: value.retryAfter }),
  };
}

function validateIdentity(input: unknown): {
  readonly operationId: OperationIdV1;
  readonly intentDigest: Sha256Digest;
  readonly account: AccountV1;
  readonly chainId: string;
  readonly deploymentId: string;
} {
  assertClosedObject(input, "identity", [
    "intent",
    "account",
    "deploymentId",
    "chainId",
    "clientRequestId",
  ]);
  if (!isPlainObject(input.intent)) {
    throw new TypeError("identity.intent must be a plain JSON object");
  }
  for (const field of DERIVED_INTENT_FIELDS) {
    if (Object.hasOwn(input.intent, field)) {
      throw new TypeError(`identity.intent.${field} is a derived field`);
    }
  }
  canonicalizeJson(input.intent as JsonValue);
  assertAccount(input.account);
  assertNonEmptyString(input.deploymentId, "identity.deploymentId");
  assertUint256Decimal(input.chainId, "identity.chainId");
  assertNonEmptyString(input.clientRequestId, "identity.clientRequestId");
  const intentDigest = sha256CanonicalJson(input.intent as JsonValue);
  const account = { kind: input.account.kind, address: input.account.address };
  return {
    intentDigest,
    account,
    chainId: input.chainId,
    deploymentId: input.deploymentId,
    operationId: deriveOperationId({
      account,
      deploymentId: input.deploymentId,
      chainId: input.chainId,
      clientRequestId: input.clientRequestId,
      intentDigest,
    }),
  };
}

function deepFreezeInternal(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreezeInternal(descriptor.value, seen);
    }
  }
  Object.freeze(value);
}

export function deepFreeze<T>(value: T): Readonly<T> {
  deepFreezeInternal(value, new WeakSet());
  return value;
}

function baseResult(input: OperationResultBuilderInput): OperationEnvelopeV1 {
  assertCoreBuild(input.coreBuild);
  assertUint256Decimal(input.createdAt, "createdAt");
  const warnings =
    input.warnings === undefined ? undefined : validateWarnings(input.warnings);
  return {
    schemaVersion: "cork.operation/v1",
    state: input.state,
    coreBuild: {
      packageVersion: input.coreBuild.packageVersion,
      sourceCommit: input.coreBuild.sourceCommit,
      schemaDigest: input.coreBuild.schemaDigest,
    },
    createdAt: input.createdAt,
    ...(warnings === undefined ? {} : { warnings }),
  };
}

export function createOperationResult(
  input: OperationResultBuilderInput,
): OperationResultV1 {
  const commonOptional = ["warnings"] as const;
  let result: OperationResultV1;
  switch (input.state) {
    case "read-result":
      assertClosedObject(
        input,
        "builder",
        ["state", "coreBuild", "createdAt", "resultDigest"],
        commonOptional,
      );
      assertSha256Digest(input.resultDigest, "resultDigest");
      result = {
        ...baseResult(input),
        state: input.state,
        resultDigest: input.resultDigest,
      };
      break;
    case "invalid":
      assertClosedObject(
        input,
        "builder",
        ["state", "coreBuild", "createdAt", "receivedInput", "issues"],
        commonOptional,
      );
      result = {
        ...baseResult(input),
        state: input.state,
        receivedInputDigest: sha256CanonicalJson(input.receivedInput),
        issues: validateIssues(input.issues),
      };
      break;
    case "unavailable": {
      assertClosedObject(
        input,
        "builder",
        ["state", "coreBuild", "createdAt", "reason"],
        [
          ...commonOptional,
          "receivedInput",
          "identity",
          "affectedArtifactDigest",
        ],
      );
      if (input.affectedArtifactDigest !== undefined) {
        assertSha256Digest(
          input.affectedArtifactDigest,
          "affectedArtifactDigest",
        );
      }
      const identity =
        input.identity === undefined
          ? undefined
          : validateIdentity(input.identity);
      result = {
        ...baseResult(input),
        state: input.state,
        ...(input.receivedInput === undefined
          ? {}
          : { receivedInputDigest: sha256CanonicalJson(input.receivedInput) }),
        ...(input.affectedArtifactDigest === undefined
          ? {}
          : { affectedArtifactDigest: input.affectedArtifactDigest }),
        ...identity,
        reason: validateReason(input.reason),
      };
      break;
    }
    case "prerequisite":
    case "prepared": {
      assertClosedObject(
        input,
        "builder",
        ["state", "coreBuild", "createdAt", "identity", "artifactDigest"],
        commonOptional,
      );
      assertSha256Digest(input.artifactDigest, "artifactDigest");
      result = {
        ...baseResult(input),
        ...validateIdentity(input.identity),
        state: input.state,
        artifactDigest: input.artifactDigest,
      };
      break;
    }
    case "finalized":
    case "permit2-revocation": {
      assertClosedObject(
        input,
        "builder",
        [
          "state",
          "coreBuild",
          "createdAt",
          "identity",
          "artifactDigest",
          "executionDigest",
        ],
        commonOptional,
      );
      assertSha256Digest(input.artifactDigest, "artifactDigest");
      assertKeccak256Digest(input.executionDigest, "executionDigest");
      result = {
        ...baseResult(input),
        ...validateIdentity(input.identity),
        state: input.state,
        artifactDigest: input.artifactDigest,
        executionDigest: input.executionDigest,
      };
      break;
    }
    case "executable":
      assertClosedObject(
        input,
        "builder",
        [
          "state",
          "coreBuild",
          "createdAt",
          "identity",
          "artifactDigest",
          "executionDigest",
          "certificateDigest",
        ],
        commonOptional,
      );
      assertSha256Digest(input.artifactDigest, "artifactDigest");
      assertKeccak256Digest(input.executionDigest, "executionDigest");
      assertSha256Digest(input.certificateDigest, "certificateDigest");
      result = {
        ...baseResult(input),
        ...validateIdentity(input.identity),
        state: input.state,
        artifactDigest: input.artifactDigest,
        executionDigest: input.executionDigest,
        certificateDigest: input.certificateDigest,
      };
      break;
    case "submitted":
      assertClosedObject(
        input,
        "builder",
        ["state", "coreBuild", "createdAt", "submissionDigest"],
        commonOptional,
      );
      assertSha256Digest(input.submissionDigest, "submissionDigest");
      result = {
        ...baseResult(input),
        state: input.state,
        submissionDigest: input.submissionDigest,
      };
      break;
    case "reconciled":
      assertClosedObject(
        input,
        "builder",
        ["state", "coreBuild", "createdAt", "reconciliationDigest"],
        commonOptional,
      );
      assertSha256Digest(input.reconciliationDigest, "reconciliationDigest");
      result = {
        ...baseResult(input),
        state: input.state,
        reconciliationDigest: input.reconciliationDigest,
      };
      break;
  }
  return deepFreeze(result) as OperationResultV1;
}

function validateCommonResult(value: Record<string, unknown>): void {
  if (value.schemaVersion !== "cork.operation/v1") {
    throw new TypeError("schemaVersion must be cork.operation/v1");
  }
  if (
    typeof value.state !== "string" ||
    !OPERATION_STATES.includes(value.state as OperationStateV1)
  ) {
    throw new TypeError("state must be a closed operation state");
  }
  assertCoreBuild(value.coreBuild);
  assertUint256Decimal(value.createdAt, "createdAt");
  if (value.warnings !== undefined) validateWarnings(value.warnings);
}

function validateBoundResult(value: Record<string, unknown>): void {
  if (
    typeof value.operationId !== "string" ||
    !OPERATION_ID.test(value.operationId)
  ) {
    throw new TypeError("operationId must contain the first 16 digest bytes");
  }
  assertSha256Digest(value.intentDigest, "intentDigest");
  assertAccount(value.account);
  assertUint256Decimal(value.chainId, "chainId");
  assertNonEmptyString(value.deploymentId, "deploymentId");
}

export function validateOperationResult(value: unknown): OperationResultV1 {
  if (!isPlainObject(value))
    throw new TypeError("operation result must be an object");
  const commonRequired = ["schemaVersion", "state", "coreBuild", "createdAt"];
  const commonOptional = ["warnings"];
  const bound = [
    "operationId",
    "intentDigest",
    "account",
    "chainId",
    "deploymentId",
  ];
  switch (value.state) {
    case "read-result":
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, "resultDigest"],
        commonOptional,
      );
      assertSha256Digest(value.resultDigest, "resultDigest");
      break;
    case "invalid":
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, "receivedInputDigest", "issues"],
        commonOptional,
      );
      assertSha256Digest(value.receivedInputDigest, "receivedInputDigest");
      validateIssues(value.issues);
      break;
    case "unavailable": {
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, "reason"],
        [
          ...commonOptional,
          "receivedInputDigest",
          "affectedArtifactDigest",
          ...bound,
        ],
      );
      if (value.receivedInputDigest !== undefined) {
        assertSha256Digest(value.receivedInputDigest, "receivedInputDigest");
      }
      if (value.affectedArtifactDigest !== undefined) {
        assertSha256Digest(
          value.affectedArtifactDigest,
          "affectedArtifactDigest",
        );
      }
      const presentBindings = bound.filter((key) => value[key] !== undefined);
      if (
        presentBindings.length !== 0 &&
        presentBindings.length !== bound.length
      ) {
        throw new TypeError(
          "unavailable identity bindings must be all present or all absent",
        );
      }
      if (presentBindings.length === bound.length) validateBoundResult(value);
      validateReason(value.reason);
      break;
    }
    case "prerequisite":
    case "prepared":
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, ...bound, "artifactDigest"],
        commonOptional,
      );
      validateBoundResult(value);
      assertSha256Digest(value.artifactDigest, "artifactDigest");
      break;
    case "finalized":
    case "permit2-revocation":
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, ...bound, "artifactDigest", "executionDigest"],
        commonOptional,
      );
      validateBoundResult(value);
      assertSha256Digest(value.artifactDigest, "artifactDigest");
      assertKeccak256Digest(value.executionDigest, "executionDigest");
      break;
    case "executable":
      assertClosedObject(
        value,
        "operation result",
        [
          ...commonRequired,
          ...bound,
          "artifactDigest",
          "executionDigest",
          "certificateDigest",
        ],
        commonOptional,
      );
      validateBoundResult(value);
      assertSha256Digest(value.artifactDigest, "artifactDigest");
      assertKeccak256Digest(value.executionDigest, "executionDigest");
      assertSha256Digest(value.certificateDigest, "certificateDigest");
      break;
    case "submitted":
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, "submissionDigest"],
        commonOptional,
      );
      assertSha256Digest(value.submissionDigest, "submissionDigest");
      break;
    case "reconciled":
      assertClosedObject(
        value,
        "operation result",
        [...commonRequired, "reconciliationDigest"],
        commonOptional,
      );
      assertSha256Digest(value.reconciliationDigest, "reconciliationDigest");
      break;
    default:
      throw new TypeError("state must be a closed operation state");
  }
  validateCommonResult(value);
  const clone = JSON.parse(
    canonicalizeJson(value as JsonValue),
  ) as OperationResultV1;
  return deepFreeze(clone) as OperationResultV1;
}
