import {
  assertAccount,
  assertClosedObject,
  assertKeccak256Digest,
  assertSha256Digest,
  assertUint256Decimal,
  deepFreeze,
  keccak256Digest,
  keccak256Bytes,
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
  type GenerationEvidenceRootsInputV1,
} from "./evidence.js";

export const UINT256_MAX_DECIMAL =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

export interface ManifestShareTokenRelationshipV1 {
  readonly schemaVersion: "cork.manifest-share-token/v1";
  readonly claim: "manifest-verified-share-token-relationship";
  readonly deploymentId: string;
  readonly generation: string;
  readonly status: "active" | "retired" | "emergency-disabled";
  readonly chainId: string;
  readonly poolId: string;
  readonly tokenRole: "cpt" | "cst";
  readonly token: string;
  readonly permit2: string;
  readonly evidenceDigest: Sha256Digest;
}

export interface AuthorityTransactionV1 {
  readonly to: string;
  readonly value: "0";
  readonly calldata: string;
  readonly calldataDigest: Keccak256Digest;
}

export type StandingPermit2AuthorityResultV1 =
  | {
      readonly schemaVersion: "cork.authority/v1";
      readonly outcome: "sufficient";
      readonly relationship: ManifestShareTokenRelationshipV1;
      readonly owner: AccountV1;
      readonly observedAllowance: string;
      readonly requiredAllowance: string;
      readonly authorityDigest: Sha256Digest;
    }
  | {
      readonly schemaVersion: "cork.authority/v1";
      readonly outcome: "prerequisite";
      readonly terminatesAttempt: true;
      readonly requirementId: string;
      readonly relationship: ManifestShareTokenRelationshipV1;
      readonly owner: AccountV1;
      readonly observedAllowance: string;
      readonly requiredAllowance: string;
      readonly targetAllowance: typeof UINT256_MAX_DECIMAL;
      readonly transaction: AuthorityTransactionV1;
      readonly delivery: {
        readonly kind: "externally-owned-account" | "safe";
        readonly account: string;
      };
      readonly confirmation: {
        readonly receipt: "exact-canonical";
        readonly freshAllowance: typeof UINT256_MAX_DECIMAL;
      };
      readonly disclosure: {
        readonly presentedBeforeAuthorization: true;
        readonly code: "standing-permit2-allowance";
        readonly scope: "verified-cork-pool-share";
        readonly persistence: "owner-revocation";
        readonly revocationAction: "permit2.revoke";
      };
      readonly authorityDigest: Sha256Digest;
    };

export interface Permit2RevocationV1 {
  readonly schemaVersion: "cork.authority-revocation/v1";
  readonly outcome: "permit2-revocation";
  readonly relationship: ManifestShareTokenRelationshipV1;
  readonly owner: AccountV1;
  readonly transaction: AuthorityTransactionV1;
  readonly delivery: {
    readonly kind: "externally-owned-account" | "safe";
    readonly account: string;
  };
  readonly confirmation: {
    readonly receipt: "exact-canonical";
    readonly freshAllowance: "0";
  };
  readonly revocationDigest: Sha256Digest;
}

const ADDRESS = /^0x[0-9a-f]{40}$/u;
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

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function hexToBytes(hex: string): Uint8Array {
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
  const output = new Uint8Array(32);
  output.set(hexToBytes(value.slice(2)), 12);
  return output;
}

function selector(signature: string): Uint8Array {
  return keccak256Bytes(new TextEncoder().encode(signature)).slice(0, 4);
}

function approveCalldata(spender: string, allowance: string): string {
  assertAddress(spender, "spender");
  assertUint256Decimal(allowance, "allowance");
  return `0x${bytesToHex(
    concatBytes([
      selector("approve(address,uint256)"),
      addressWord(spender),
      uintWord(BigInt(allowance)),
    ]),
  )}`;
}

function transaction(
  token: string,
  permit2: string,
  allowance: string,
): AuthorityTransactionV1 {
  const calldata = approveCalldata(permit2, allowance);
  const calldataDigest = keccak256Digest(hexToBytes(calldata.slice(2)));
  return { to: token, value: "0", calldata, calldataDigest };
}

export function validateManifestShareTokenRelationship(
  value: unknown,
): ManifestShareTokenRelationshipV1 {
  assertClosedObject(value, "share-token relationship", [
    "schemaVersion",
    "claim",
    "deploymentId",
    "generation",
    "status",
    "chainId",
    "poolId",
    "tokenRole",
    "token",
    "permit2",
    "evidenceDigest",
  ]);
  if (
    value.schemaVersion !== "cork.manifest-share-token/v1" ||
    value.claim !== "manifest-verified-share-token-relationship"
  ) {
    throw new TypeError("share token must be a manifest-derived claim");
  }
  assertNonEmptyString(value.deploymentId, "deploymentId");
  assertUint256Decimal(value.generation, "generation");
  if (
    value.status !== "active" &&
    value.status !== "retired" &&
    value.status !== "emergency-disabled"
  ) {
    throw new TypeError("share-token generation status is not supported");
  }
  assertUint256Decimal(value.chainId, "chainId");
  assertBytes32(value.poolId, "poolId");
  if (value.tokenRole !== "cpt" && value.tokenRole !== "cst") {
    throw new TypeError("only cpt and cst relationships use standing Permit2");
  }
  assertAddress(value.token, "token");
  assertAddress(value.permit2, "permit2");
  assertSha256Digest(value.evidenceDigest, "evidenceDigest");
  return deepFreeze({
    schemaVersion: "cork.manifest-share-token/v1",
    claim: "manifest-verified-share-token-relationship",
    deploymentId: value.deploymentId,
    generation: value.generation,
    status: value.status,
    chainId: value.chainId,
    poolId: value.poolId,
    tokenRole: value.tokenRole,
    token: value.token,
    permit2: value.permit2,
    evidenceDigest: value.evidenceDigest,
  }) as ManifestShareTokenRelationshipV1;
}

function authorityDigest(
  value: Omit<
    Extract<
      StandingPermit2AuthorityResultV1,
      { readonly outcome: "prerequisite" }
    >,
    "authorityDigest"
  >,
): Sha256Digest {
  return sha256CanonicalJson(value as unknown as JsonValue);
}

function resolveShareTokenRelationship(
  evidenceRoots: GenerationEvidenceRootsInputV1,
  poolId: string,
  tokenRole: "cpt" | "cst",
  verifier: BrowserSignatureVerifierV1,
): ManifestShareTokenRelationshipV1 {
  if (tokenRole !== "cpt" && tokenRole !== "cst") {
    throw new TypeError("only cpt and cst relationships use standing Permit2");
  }
  const { manifest } = verifyDeploymentManifest(evidenceRoots, verifier);
  if (manifest.status === "staged") {
    throw new TypeError("staged deployment evidence cannot authorize tokens");
  }
  const pool = findDeploymentPool(manifest, poolId);
  const permit2 = findDeploymentContract(manifest, "Permit2");
  return deepFreeze({
    schemaVersion: "cork.manifest-share-token/v1",
    claim: "manifest-verified-share-token-relationship",
    deploymentId: manifest.deploymentId,
    generation: manifest.generation,
    status: manifest.status,
    chainId: manifest.chainId,
    poolId: pool.poolId,
    tokenRole,
    token: tokenRole === "cpt" ? pool.cptAddress : pool.cstAddress,
    permit2: permit2.address,
    evidenceDigest: pool.relationshipDigest,
  }) as ManifestShareTokenRelationshipV1;
}

export function inspectStandingPermit2Authority(
  input: {
    readonly evidenceRoots: GenerationEvidenceRootsInputV1;
    readonly poolId: string;
    readonly tokenRole: "cpt" | "cst";
    readonly owner: AccountV1;
    readonly observedAllowance: string;
    readonly requiredAllowance: string;
  },
  verifier: BrowserSignatureVerifierV1,
): StandingPermit2AuthorityResultV1 {
  assertClosedObject(input, "authority input", [
    "evidenceRoots",
    "poolId",
    "tokenRole",
    "owner",
    "observedAllowance",
    "requiredAllowance",
  ]);
  const relationship = resolveShareTokenRelationship(
    input.evidenceRoots,
    input.poolId,
    input.tokenRole,
    verifier,
  );
  if (relationship.status !== "active") {
    throw new TypeError(
      "new standing Permit2 prerequisites require an active generation",
    );
  }
  assertAccount(input.owner, "owner");
  assertUint256Decimal(input.observedAllowance, "observedAllowance");
  assertUint256Decimal(input.requiredAllowance, "requiredAllowance");
  if (
    input.requiredAllowance === "0" ||
    input.requiredAllowance === UINT256_MAX_DECIMAL
  ) {
    throw new TypeError(
      "requiredAllowance must be an exact non-maximum amount",
    );
  }
  const owner = { kind: input.owner.kind, address: input.owner.address };
  if (BigInt(input.observedAllowance) >= BigInt(input.requiredAllowance)) {
    const result = {
      schemaVersion: "cork.authority/v1" as const,
      outcome: "sufficient" as const,
      relationship,
      owner,
      observedAllowance: input.observedAllowance,
      requiredAllowance: input.requiredAllowance,
    };
    return deepFreeze({
      ...result,
      authorityDigest: sha256CanonicalJson(result as unknown as JsonValue),
    }) as StandingPermit2AuthorityResultV1;
  }
  const withoutDigest = {
    schemaVersion: "cork.authority/v1" as const,
    outcome: "prerequisite" as const,
    terminatesAttempt: true as const,
    requirementId: `standing-permit2-${relationship.tokenRole}`,
    relationship,
    owner,
    observedAllowance: input.observedAllowance,
    requiredAllowance: input.requiredAllowance,
    targetAllowance: UINT256_MAX_DECIMAL as typeof UINT256_MAX_DECIMAL,
    transaction: transaction(
      relationship.token,
      relationship.permit2,
      UINT256_MAX_DECIMAL,
    ),
    delivery: { kind: owner.kind, account: owner.address },
    confirmation: {
      receipt: "exact-canonical" as const,
      freshAllowance: UINT256_MAX_DECIMAL as typeof UINT256_MAX_DECIMAL,
    },
    disclosure: {
      presentedBeforeAuthorization: true as const,
      code: "standing-permit2-allowance" as const,
      scope: "verified-cork-pool-share" as const,
      persistence: "owner-revocation" as const,
      revocationAction: "permit2.revoke" as const,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    authorityDigest: authorityDigest(withoutDigest),
  }) as StandingPermit2AuthorityResultV1;
}

export function createPermit2Revocation(
  input: {
    readonly evidenceRoots: GenerationEvidenceRootsInputV1;
    readonly poolId: string;
    readonly tokenRole: "cpt" | "cst";
    readonly owner: AccountV1;
  },
  verifier: BrowserSignatureVerifierV1,
): Permit2RevocationV1 {
  assertClosedObject(input, "revocation input", [
    "evidenceRoots",
    "poolId",
    "tokenRole",
    "owner",
  ]);
  const relationship = resolveShareTokenRelationship(
    input.evidenceRoots,
    input.poolId,
    input.tokenRole,
    verifier,
  );
  assertAccount(input.owner, "owner");
  const owner = { kind: input.owner.kind, address: input.owner.address };
  const withoutDigest: Omit<Permit2RevocationV1, "revocationDigest"> = {
    schemaVersion: "cork.authority-revocation/v1",
    outcome: "permit2-revocation",
    relationship,
    owner,
    transaction: transaction(relationship.token, relationship.permit2, "0"),
    delivery: { kind: owner.kind, account: owner.address },
    confirmation: { receipt: "exact-canonical", freshAllowance: "0" },
  };
  return deepFreeze({
    ...withoutDigest,
    revocationDigest: sha256CanonicalJson(
      withoutDigest as unknown as JsonValue,
    ),
  }) as Permit2RevocationV1;
}

export function validateAuthorityTransaction(
  value: unknown,
): AuthorityTransactionV1 {
  assertClosedObject(value, "authority transaction", [
    "to",
    "value",
    "calldata",
    "calldataDigest",
  ]);
  assertAddress(value.to, "authority transaction.to");
  if (value.value !== "0") {
    throw new TypeError("authority transaction value must be zero");
  }
  if (
    typeof value.calldata !== "string" ||
    !/^0x[0-9a-f]+$/u.test(value.calldata)
  ) {
    throw new TypeError(
      "authority transaction calldata must be lowercase bytes",
    );
  }
  assertKeccak256Digest(
    value.calldataDigest,
    "authority transaction.calldataDigest",
  );
  if (
    keccak256Digest(hexToBytes(value.calldata.slice(2))) !==
    value.calldataDigest
  ) {
    throw new TypeError("authority transaction calldata digest does not match");
  }
  return {
    to: value.to,
    value: "0",
    calldata: value.calldata,
    calldataDigest: value.calldataDigest,
  };
}
