import { createHash } from "node:crypto";

export const SUBMISSION_RECORD_SCHEMA_VERSION =
  "cork.submission-record/v1" as const;
export const DATABASE_DECISION_SCHEMA_VERSION =
  "cork.database-decision/v1" as const;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface SubmissionKeyV1 {
  readonly principalId: string;
  readonly upstreamProfileId: string;
  readonly clientRequestId: string;
}

export type SubmissionStateV1 =
  | "pending"
  | "accepted"
  | "rejected"
  | "ambiguous";

export type DispatchPhaseV1 = "claimed" | "started";
export type LeasePurposeV1 = "dispatch" | "reconcile";

export interface SubmissionLeaseV1 {
  readonly leasePurpose: LeasePurposeV1;
  readonly leaseOwner: string;
  readonly leaseClaimedAt: number;
  readonly leaseExpiresAt: number;
}

export interface ExactUpstreamResultV1 {
  readonly schemaVersion: "cork.submission-upstream-result/v1";
  readonly statusCode: string;
  readonly mediaType?: string;
  readonly decodedPayloadBase64: string;
  readonly decodedPayloadLength: string;
  readonly decodedPayloadDigest: string;
}

export type ReconciliationEvidenceKindV1 =
  | "transport-uncertain"
  | "content-decoding-failed"
  | "compare-and-set-uncertain"
  | "found-accepted"
  | "found-rejected"
  | "absence-proved"
  | "absence-unproved"
  | "dispatch-lease-expired"
  | "reconcile-lease-expired";

export interface ReconciliationEvidenceV1 {
  readonly kind: ReconciliationEvidenceKindV1;
  readonly observedAt: number;
  readonly evidenceDigest: string;
}

export interface SubmissionRecordV1 {
  readonly recordVersion: number;
  readonly submissionRequestDigest: string;
  readonly state: SubmissionStateV1;
  readonly dispatchPhase?: DispatchPhaseV1;
  readonly attemptCount: number;
  readonly lastDispatchStartedAt?: number;
  readonly lease?: SubmissionLeaseV1;
  readonly upstreamResult?: ExactUpstreamResultV1;
  readonly upstreamOrderIdentifier?: string;
  readonly reconciliationEvidence: readonly ReconciliationEvidenceV1[];
  readonly updatedAt: number;
}

export interface SubmissionCompareExpectationV1 {
  readonly recordVersion: number;
  readonly state: SubmissionStateV1;
  readonly dispatchPhase: DispatchPhaseV1 | null;
  readonly lease: {
    readonly leasePurpose: LeasePurposeV1;
    readonly leaseOwner: string;
  } | null;
}

export type CreateIfAbsentResultV1 =
  | {
      readonly created: true;
      readonly record: SubmissionRecordV1;
    }
  | {
      readonly created: false;
      readonly record: SubmissionRecordV1;
    };

export type CompareAndSetResultV1 =
  | {
      readonly updated: true;
      readonly record: SubmissionRecordV1;
    }
  | {
      readonly updated: false;
      readonly current?: SubmissionRecordV1;
    };

export interface SubmissionRepository {
  readonly repositoryKind: string;
  readonly testSubstitute: boolean;
  readonly productionCompatible: boolean;
  createIfAbsent(
    key: SubmissionKeyV1,
    record: SubmissionRecordV1,
  ): Promise<CreateIfAbsentResultV1>;
  read(key: SubmissionKeyV1): Promise<SubmissionRecordV1 | undefined>;
  compareAndSet(input: {
    readonly key: SubmissionKeyV1;
    readonly expected: SubmissionCompareExpectationV1;
    readonly next: SubmissionRecordV1;
  }): Promise<CompareAndSetResultV1>;
}

export type DatabaseDecisionStatusV1 = "draft" | "approved" | "rejected";

export interface DatabaseDecisionV1 {
  readonly schemaVersion: typeof DATABASE_DECISION_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly status: DatabaseDecisionStatusV1;
  readonly recordSchemaVersion: typeof SUBMISSION_RECORD_SCHEMA_VERSION;
  readonly engine: {
    readonly name: string;
    readonly minimumVersion: string;
  };
  readonly durability: {
    readonly mode: string;
    readonly recoveryPointObjective: string;
    readonly recoveryTimeObjective: string;
  };
  readonly transaction: {
    readonly isolationLevel: string;
    readonly atomicCreatePattern: string;
    readonly compareAndSetPattern: string;
  };
  readonly clockAndLeaseAuthority: {
    readonly clockSource: string;
    readonly leaseExpiryAuthority: string;
  };
  readonly migrationAndRollback: {
    readonly migrationPosture: string;
    readonly rollbackPosture: string;
  };
  readonly productionLikeEvidence: readonly {
    readonly evidenceId: string;
    readonly evidenceDigest: string;
  }[];
  readonly approvedBy: string;
  readonly approvedAt: number;
  readonly validUntil: number;
  readonly artifactDigest: string;
}

const RECORD_KEYS = [
  "recordVersion",
  "submissionRequestDigest",
  "state",
  "dispatchPhase",
  "attemptCount",
  "lastDispatchStartedAt",
  "lease",
  "upstreamResult",
  "upstreamOrderIdentifier",
  "reconciliationEvidence",
  "updatedAt",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertClosed(
  value: unknown,
  label: string,
  allowed: readonly string[],
  required: readonly string[],
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError(`${label} contains an unknown field`);
  }
  if (required.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} is missing a required field`);
  }
}

function assertNonEmpty(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertSafeTime(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a sha256 digest`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function sha256Canonical(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(new TextEncoder().encode(canonicalJson(value)))
    .digest("hex")}`;
}

export function validateSubmissionKey(value: SubmissionKeyV1): SubmissionKeyV1 {
  assertClosed(
    value,
    "submission key",
    ["principalId", "upstreamProfileId", "clientRequestId"],
    ["principalId", "upstreamProfileId", "clientRequestId"],
  );
  assertNonEmpty(value.principalId, "principalId");
  assertNonEmpty(value.upstreamProfileId, "upstreamProfileId");
  assertNonEmpty(value.clientRequestId, "clientRequestId");
  if (value.clientRequestId.length > 128) {
    throw new TypeError("clientRequestId must not exceed 128 characters");
  }
  return immutableClone({
    principalId: value.principalId,
    upstreamProfileId: value.upstreamProfileId,
    clientRequestId: value.clientRequestId,
  });
}

function validateLease(value: unknown): SubmissionLeaseV1 {
  assertClosed(
    value,
    "submission lease",
    ["leasePurpose", "leaseOwner", "leaseClaimedAt", "leaseExpiresAt"],
    ["leasePurpose", "leaseOwner", "leaseClaimedAt", "leaseExpiresAt"],
  );
  if (
    value["leasePurpose"] !== "dispatch" &&
    value["leasePurpose"] !== "reconcile"
  ) {
    throw new TypeError("leasePurpose is invalid");
  }
  assertNonEmpty(value["leaseOwner"], "leaseOwner");
  assertSafeTime(value["leaseClaimedAt"], "leaseClaimedAt");
  assertSafeTime(value["leaseExpiresAt"], "leaseExpiresAt");
  if (value["leaseExpiresAt"] <= value["leaseClaimedAt"]) {
    throw new TypeError("leaseExpiresAt must be after leaseClaimedAt");
  }
  return {
    leasePurpose: value["leasePurpose"],
    leaseOwner: value["leaseOwner"],
    leaseClaimedAt: value["leaseClaimedAt"],
    leaseExpiresAt: value["leaseExpiresAt"],
  };
}

export function validateUpstreamResult(
  value: ExactUpstreamResultV1,
): ExactUpstreamResultV1 {
  assertClosed(
    value,
    "upstream result",
    [
      "schemaVersion",
      "statusCode",
      "mediaType",
      "decodedPayloadBase64",
      "decodedPayloadLength",
      "decodedPayloadDigest",
    ],
    [
      "schemaVersion",
      "statusCode",
      "decodedPayloadBase64",
      "decodedPayloadLength",
      "decodedPayloadDigest",
    ],
  );
  if (value.schemaVersion !== "cork.submission-upstream-result/v1") {
    throw new TypeError("upstream result schemaVersion is invalid");
  }
  if (!/^[1-5][0-9]{2}$/.test(value.statusCode)) {
    throw new TypeError("statusCode must be a three-digit decimal string");
  }
  if (
    value.mediaType !== undefined &&
    (typeof value.mediaType !== "string" || value.mediaType.trim().length === 0)
  ) {
    throw new TypeError("mediaType must be a non-empty string when present");
  }
  if (
    typeof value.decodedPayloadBase64 !== "string" ||
    !BASE64_PATTERN.test(value.decodedPayloadBase64)
  ) {
    throw new TypeError("decodedPayloadBase64 is invalid");
  }
  if (
    typeof value.decodedPayloadLength !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(value.decodedPayloadLength)
  ) {
    throw new TypeError("decodedPayloadLength is invalid");
  }
  assertSha256(value.decodedPayloadDigest, "decodedPayloadDigest");
  const decoded = Buffer.from(value.decodedPayloadBase64, "base64");
  if (String(decoded.byteLength) !== value.decodedPayloadLength) {
    throw new TypeError("decoded payload length does not match base64 bytes");
  }
  const digest = `sha256:${createHash("sha256").update(decoded).digest("hex")}`;
  if (digest !== value.decodedPayloadDigest) {
    throw new TypeError("decoded payload digest does not match base64 bytes");
  }
  return immutableClone(value);
}

function validateEvidence(value: unknown): ReconciliationEvidenceV1 {
  assertClosed(
    value,
    "reconciliation evidence",
    ["kind", "observedAt", "evidenceDigest"],
    ["kind", "observedAt", "evidenceDigest"],
  );
  const kinds: readonly ReconciliationEvidenceKindV1[] = [
    "transport-uncertain",
    "content-decoding-failed",
    "compare-and-set-uncertain",
    "found-accepted",
    "found-rejected",
    "absence-proved",
    "absence-unproved",
    "dispatch-lease-expired",
    "reconcile-lease-expired",
  ];
  if (
    typeof value["kind"] !== "string" ||
    !kinds.includes(value["kind"] as ReconciliationEvidenceKindV1)
  ) {
    throw new TypeError("reconciliation evidence kind is invalid");
  }
  assertSafeTime(value["observedAt"], "evidence observedAt");
  assertSha256(value["evidenceDigest"], "evidenceDigest");
  return {
    kind: value["kind"] as ReconciliationEvidenceKindV1,
    observedAt: value["observedAt"],
    evidenceDigest: value["evidenceDigest"],
  };
}

export function validateSubmissionRecord(
  value: SubmissionRecordV1,
): SubmissionRecordV1 {
  assertClosed(value, "submission record", RECORD_KEYS, [
    "recordVersion",
    "submissionRequestDigest",
    "state",
    "attemptCount",
    "reconciliationEvidence",
    "updatedAt",
  ]);
  if (!Number.isSafeInteger(value.recordVersion) || value.recordVersion < 1) {
    throw new TypeError("recordVersion must be a positive safe integer");
  }
  assertSha256(value.submissionRequestDigest, "submissionRequestDigest");
  if (
    value.state !== "pending" &&
    value.state !== "accepted" &&
    value.state !== "rejected" &&
    value.state !== "ambiguous"
  ) {
    throw new TypeError("submission state is invalid");
  }
  if (
    !Number.isSafeInteger(value.attemptCount) ||
    value.attemptCount < 0 ||
    value.attemptCount > 2
  ) {
    throw new TypeError("attemptCount must be from zero through two");
  }
  assertSafeTime(value.updatedAt, "updatedAt");
  if (!Array.isArray(value.reconciliationEvidence)) {
    throw new TypeError("reconciliationEvidence must be an array");
  }
  const reconciliationEvidence =
    value.reconciliationEvidence.map(validateEvidence);
  const lease =
    value.lease === undefined ? undefined : validateLease(value.lease);
  const upstreamResult =
    value.upstreamResult === undefined
      ? undefined
      : validateUpstreamResult(value.upstreamResult);
  if (
    value.upstreamOrderIdentifier !== undefined &&
    (typeof value.upstreamOrderIdentifier !== "string" ||
      value.upstreamOrderIdentifier.length === 0)
  ) {
    throw new TypeError("upstreamOrderIdentifier must be non-empty");
  }
  if (value.attemptCount === 0) {
    if (value.lastDispatchStartedAt !== undefined) {
      throw new TypeError("lastDispatchStartedAt is forbidden at attempt zero");
    }
  } else {
    assertSafeTime(value.lastDispatchStartedAt, "lastDispatchStartedAt");
  }

  if (value.state === "pending") {
    if (
      (value.dispatchPhase !== "claimed" &&
        value.dispatchPhase !== "started") ||
      lease?.leasePurpose !== "dispatch" ||
      upstreamResult !== undefined
    ) {
      throw new TypeError(
        "pending requires a dispatch phase and dispatch lease without an upstream result",
      );
    }
    if (
      (value.dispatchPhase === "claimed" && value.attemptCount > 1) ||
      (value.dispatchPhase === "started" && value.attemptCount < 1)
    ) {
      throw new TypeError("pending dispatch phase conflicts with attemptCount");
    }
  } else if (value.state === "ambiguous") {
    if (
      value.dispatchPhase !== undefined ||
      upstreamResult !== undefined ||
      (lease !== undefined && lease.leasePurpose !== "reconcile") ||
      value.attemptCount < 1
    ) {
      throw new TypeError("ambiguous record shape is invalid");
    }
  } else if (
    value.dispatchPhase !== undefined ||
    lease !== undefined ||
    upstreamResult === undefined ||
    value.attemptCount < 1
  ) {
    throw new TypeError("terminal record shape is invalid");
  }

  return immutableClone({
    recordVersion: value.recordVersion,
    submissionRequestDigest: value.submissionRequestDigest,
    state: value.state,
    ...(value.dispatchPhase === undefined
      ? {}
      : { dispatchPhase: value.dispatchPhase }),
    attemptCount: value.attemptCount,
    ...(value.lastDispatchStartedAt === undefined
      ? {}
      : { lastDispatchStartedAt: value.lastDispatchStartedAt }),
    ...(lease === undefined ? {} : { lease }),
    ...(upstreamResult === undefined ? {} : { upstreamResult }),
    ...(value.upstreamOrderIdentifier === undefined
      ? {}
      : { upstreamOrderIdentifier: value.upstreamOrderIdentifier }),
    reconciliationEvidence,
    updatedAt: value.updatedAt,
  });
}

export function compareExpectation(
  record: SubmissionRecordV1,
): SubmissionCompareExpectationV1 {
  return {
    recordVersion: record.recordVersion,
    state: record.state,
    dispatchPhase: record.dispatchPhase ?? null,
    lease:
      record.lease === undefined
        ? null
        : {
            leasePurpose: record.lease.leasePurpose,
            leaseOwner: record.lease.leaseOwner,
          },
  };
}

function keyString(key: SubmissionKeyV1): string {
  const valid = validateSubmissionKey(key);
  return canonicalJson(valid);
}

function expectationMatches(
  record: SubmissionRecordV1,
  expected: SubmissionCompareExpectationV1,
): boolean {
  return (
    record.recordVersion === expected.recordVersion &&
    record.state === expected.state &&
    (record.dispatchPhase ?? null) === expected.dispatchPhase &&
    ((record.lease === undefined && expected.lease === null) ||
      (record.lease !== undefined &&
        expected.lease !== null &&
        record.lease.leasePurpose === expected.lease.leasePurpose &&
        record.lease.leaseOwner === expected.lease.leaseOwner))
  );
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  public readonly repositoryKind = "in-memory-local-test-substitute";
  public readonly testSubstitute = true;
  public readonly productionCompatible = false;
  readonly #records = new Map<string, SubmissionRecordV1>();

  public async createIfAbsent(
    key: SubmissionKeyV1,
    record: SubmissionRecordV1,
  ): Promise<CreateIfAbsentResultV1> {
    const storageKey = keyString(key);
    const current = this.#records.get(storageKey);
    if (current !== undefined) {
      return { created: false, record: current };
    }
    const next = validateSubmissionRecord(record);
    if (next.recordVersion !== 1) {
      throw new TypeError("new records must begin at recordVersion 1");
    }
    this.#records.set(storageKey, next);
    return { created: true, record: next };
  }

  public async read(
    key: SubmissionKeyV1,
  ): Promise<SubmissionRecordV1 | undefined> {
    return this.#records.get(keyString(key));
  }

  public async compareAndSet(input: {
    readonly key: SubmissionKeyV1;
    readonly expected: SubmissionCompareExpectationV1;
    readonly next: SubmissionRecordV1;
  }): Promise<CompareAndSetResultV1> {
    const storageKey = keyString(input.key);
    const current = this.#records.get(storageKey);
    if (current === undefined || !expectationMatches(current, input.expected)) {
      return current === undefined
        ? { updated: false }
        : { updated: false, current };
    }
    const next = validateSubmissionRecord(input.next);
    if (
      next.recordVersion !== current.recordVersion + 1 ||
      next.submissionRequestDigest !== current.submissionRequestDigest
    ) {
      throw new TypeError(
        "compare-and-set must advance one version without changing the request digest",
      );
    }
    this.#records.set(storageKey, next);
    return { updated: true, record: next };
  }
}

export function createLease(input: {
  readonly purpose: LeasePurposeV1;
  readonly owner: string;
  readonly now: number;
  readonly durationMs: number;
}): SubmissionLeaseV1 {
  assertNonEmpty(input.owner, "lease owner");
  assertSafeTime(input.now, "lease now");
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs < 1) {
    throw new TypeError("lease duration must be a positive safe integer");
  }
  return {
    leasePurpose: input.purpose,
    leaseOwner: input.owner,
    leaseClaimedAt: input.now,
    leaseExpiresAt: input.now + input.durationMs,
  };
}

export function createInitialSubmissionRecord(input: {
  readonly submissionRequestDigest: string;
  readonly leaseOwner: string;
  readonly now: number;
  readonly leaseDurationMs: number;
}): SubmissionRecordV1 {
  return validateSubmissionRecord({
    recordVersion: 1,
    submissionRequestDigest: input.submissionRequestDigest,
    state: "pending",
    dispatchPhase: "claimed",
    attemptCount: 0,
    lease: createLease({
      purpose: "dispatch",
      owner: input.leaseOwner,
      now: input.now,
      durationMs: input.leaseDurationMs,
    }),
    reconciliationEvidence: [],
    updatedAt: input.now,
  });
}

export function createEvidence(input: {
  readonly kind: ReconciliationEvidenceKindV1;
  readonly observedAt: number;
  readonly identity: unknown;
}): ReconciliationEvidenceV1 {
  return validateEvidence({
    kind: input.kind,
    observedAt: input.observedAt,
    evidenceDigest: sha256Canonical({
      schemaVersion: "cork.submission-reconciliation-evidence/v1",
      kind: input.kind,
      observedAt: input.observedAt,
      identity: input.identity,
    }),
  });
}

export function computeDatabaseDecisionDigest(
  decision: Omit<DatabaseDecisionV1, "artifactDigest"> | DatabaseDecisionV1,
): string {
  const { artifactDigest: _artifactDigest, ...projection } =
    decision as DatabaseDecisionV1;
  return sha256Canonical(projection);
}

function validateDecisionObject(decision: DatabaseDecisionV1): void {
  assertClosed(
    decision,
    "database decision",
    [
      "schemaVersion",
      "decisionId",
      "status",
      "recordSchemaVersion",
      "engine",
      "durability",
      "transaction",
      "clockAndLeaseAuthority",
      "migrationAndRollback",
      "productionLikeEvidence",
      "approvedBy",
      "approvedAt",
      "validUntil",
      "artifactDigest",
    ],
    [
      "schemaVersion",
      "decisionId",
      "status",
      "recordSchemaVersion",
      "engine",
      "durability",
      "transaction",
      "clockAndLeaseAuthority",
      "migrationAndRollback",
      "productionLikeEvidence",
      "approvedBy",
      "approvedAt",
      "validUntil",
      "artifactDigest",
    ],
  );
  if (decision.schemaVersion !== DATABASE_DECISION_SCHEMA_VERSION) {
    throw new TypeError("database decision schemaVersion is invalid");
  }
  assertNonEmpty(decision.decisionId, "decisionId");
  if (
    decision.status !== "draft" &&
    decision.status !== "approved" &&
    decision.status !== "rejected"
  ) {
    throw new TypeError("database decision status is invalid");
  }
  if (decision.recordSchemaVersion !== SUBMISSION_RECORD_SCHEMA_VERSION) {
    throw new TypeError("database decision record schema is incompatible");
  }
  assertClosed(
    decision.engine,
    "database engine",
    ["name", "minimumVersion"],
    ["name", "minimumVersion"],
  );
  assertNonEmpty(decision.engine.name, "engine.name");
  assertNonEmpty(decision.engine.minimumVersion, "engine.minimumVersion");
  assertClosed(
    decision.durability,
    "database durability",
    ["mode", "recoveryPointObjective", "recoveryTimeObjective"],
    ["mode", "recoveryPointObjective", "recoveryTimeObjective"],
  );
  assertNonEmpty(decision.durability.mode, "durability.mode");
  assertNonEmpty(
    decision.durability.recoveryPointObjective,
    "durability.recoveryPointObjective",
  );
  assertNonEmpty(
    decision.durability.recoveryTimeObjective,
    "durability.recoveryTimeObjective",
  );
  assertClosed(
    decision.transaction,
    "database transaction",
    ["isolationLevel", "atomicCreatePattern", "compareAndSetPattern"],
    ["isolationLevel", "atomicCreatePattern", "compareAndSetPattern"],
  );
  assertNonEmpty(decision.transaction.isolationLevel, "isolationLevel");
  assertNonEmpty(
    decision.transaction.atomicCreatePattern,
    "atomicCreatePattern",
  );
  assertNonEmpty(
    decision.transaction.compareAndSetPattern,
    "compareAndSetPattern",
  );
  assertClosed(
    decision.clockAndLeaseAuthority,
    "clock and lease authority",
    ["clockSource", "leaseExpiryAuthority"],
    ["clockSource", "leaseExpiryAuthority"],
  );
  assertNonEmpty(
    decision.clockAndLeaseAuthority.clockSource,
    "clockAndLeaseAuthority.clockSource",
  );
  assertNonEmpty(
    decision.clockAndLeaseAuthority.leaseExpiryAuthority,
    "clockAndLeaseAuthority.leaseExpiryAuthority",
  );
  assertClosed(
    decision.migrationAndRollback,
    "migration and rollback",
    ["migrationPosture", "rollbackPosture"],
    ["migrationPosture", "rollbackPosture"],
  );
  assertNonEmpty(
    decision.migrationAndRollback.migrationPosture,
    "migrationPosture",
  );
  assertNonEmpty(
    decision.migrationAndRollback.rollbackPosture,
    "rollbackPosture",
  );
  if (
    !Array.isArray(decision.productionLikeEvidence) ||
    decision.productionLikeEvidence.length === 0
  ) {
    throw new TypeError("productionLikeEvidence must be non-empty");
  }
  for (const evidence of decision.productionLikeEvidence) {
    assertClosed(
      evidence,
      "production-like evidence",
      ["evidenceId", "evidenceDigest"],
      ["evidenceId", "evidenceDigest"],
    );
    assertNonEmpty(evidence["evidenceId"], "evidenceId");
    assertSha256(evidence["evidenceDigest"], "evidenceDigest");
  }
  assertNonEmpty(decision.approvedBy, "approvedBy");
  assertSafeTime(decision.approvedAt, "approvedAt");
  assertSafeTime(decision.validUntil, "validUntil");
  if (decision.validUntil <= decision.approvedAt) {
    throw new TypeError("database decision validity window is invalid");
  }
  assertSha256(decision.artifactDigest, "artifactDigest");
  if (computeDatabaseDecisionDigest(decision) !== decision.artifactDigest) {
    throw new TypeError("database decision artifact digest is invalid");
  }
}

export function validateProductionDatabaseDecision(
  decision: DatabaseDecisionV1 | undefined,
  now: number,
): DatabaseDecisionV1 {
  if (decision === undefined) {
    throw new TypeError("an approved DatabaseDecisionV1 is required");
  }
  validateDecisionObject(decision);
  assertSafeTime(now, "decision validation time");
  if (decision.status !== "approved") {
    throw new TypeError("database decision is not approved");
  }
  if (now < decision.approvedAt || now >= decision.validUntil) {
    throw new TypeError("database decision is not current");
  }
  return immutableClone(decision);
}
