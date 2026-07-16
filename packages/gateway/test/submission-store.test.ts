import { describe, expect, it } from "vitest";
import {
  DATABASE_DECISION_SCHEMA_VERSION,
  InMemorySubmissionRepository,
  SUBMISSION_RECORD_SCHEMA_VERSION,
  SubmissionService,
  compareExpectation,
  computeDatabaseDecisionDigest,
  createEvidence,
  createInitialSubmissionRecord,
  createLease,
  validateProductionDatabaseDecision,
  validateSubmissionRecord,
  type DatabaseDecisionV1,
  type SubmissionRecordV1,
  type SubmissionRepository,
} from "../src/index.js";

const DIGEST = `sha256:${"11".repeat(32)}`;
const KEY = {
  principalId: "principal-a",
  upstreamProfileId: "phoenix-limit-orders-v1",
  clientRequestId: "request-a",
} as const;

function decision(input?: {
  readonly status?: DatabaseDecisionV1["status"];
  readonly validUntil?: number;
}): DatabaseDecisionV1 {
  const base = {
    schemaVersion: DATABASE_DECISION_SCHEMA_VERSION,
    decisionId: "database-decision-a",
    status: input?.status ?? "approved",
    recordSchemaVersion: SUBMISSION_RECORD_SCHEMA_VERSION,
    engine: { name: "chosen-engine", minimumVersion: "1.2.3" },
    durability: {
      mode: "synchronous durable commit",
      recoveryPointObjective: "zero committed-record loss",
      recoveryTimeObjective: "documented operator recovery",
    },
    transaction: {
      isolationLevel: "serializable key ownership",
      atomicCreatePattern: "unique-key insert-if-absent",
      compareAndSetPattern: "record-version and lease-owner predicate",
    },
    clockAndLeaseAuthority: {
      clockSource: "database clock",
      leaseExpiryAuthority: "database transaction time",
    },
    migrationAndRollback: {
      migrationPosture: "expand validate contract",
      rollbackPosture: "forward repair without record loss",
    },
    productionLikeEvidence: [
      { evidenceId: "durability-run-a", evidenceDigest: DIGEST },
    ],
    approvedBy: "platform-review-board",
    approvedAt: 10,
    validUntil: input?.validUntil ?? 10_000,
  } as const;
  return {
    ...base,
    artifactDigest: computeDatabaseDecisionDigest(base),
  };
}

function productionRepository(): SubmissionRepository {
  const memory = new InMemorySubmissionRepository();
  return {
    repositoryKind: "approved-engine-adapter-test-double",
    testSubstitute: false,
    productionCompatible: true,
    createIfAbsent: (key, record) => memory.createIfAbsent(key, record),
    read: (key) => memory.read(key),
    compareAndSet: (input) => memory.compareAndSet(input),
  };
}

describe("submission record repository", () => {
  it("enforces closed immutable creation, key isolation, and digest conflict visibility", async () => {
    const repository = new InMemorySubmissionRepository();
    const record = createInitialSubmissionRecord({
      submissionRequestDigest: DIGEST,
      leaseOwner: "owner-a",
      now: 100,
      leaseDurationMs: 50,
    });
    const created = await repository.createIfAbsent(KEY, record);
    expect(created.created).toBe(true);
    expect(Object.isFrozen(created.record)).toBe(true);
    const duplicate = await repository.createIfAbsent(KEY, {
      ...record,
      submissionRequestDigest: `sha256:${"22".repeat(32)}`,
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.record.submissionRequestDigest).toBe(DIGEST);
    expect(() =>
      validateSubmissionRecord({
        ...record,
        extra: true,
      } as SubmissionRecordV1),
    ).toThrow(/unknown field/);
  });

  it("requires exact version, state, phase, and lease ownership for compare-and-set", async () => {
    const repository = new InMemorySubmissionRepository();
    const initial = createInitialSubmissionRecord({
      submissionRequestDigest: DIGEST,
      leaseOwner: "owner-a",
      now: 100,
      leaseDurationMs: 50,
    });
    await repository.createIfAbsent(KEY, initial);
    const started = validateSubmissionRecord({
      ...initial,
      recordVersion: 2,
      dispatchPhase: "started",
      attemptCount: 1,
      lastDispatchStartedAt: 110,
      updatedAt: 110,
    });
    const wrongOwner = await repository.compareAndSet({
      key: KEY,
      expected: {
        ...compareExpectation(initial),
        lease: { leasePurpose: "dispatch", leaseOwner: "owner-b" },
      },
      next: started,
    });
    expect(wrongOwner.updated).toBe(false);
    const updated = await repository.compareAndSet({
      key: KEY,
      expected: compareExpectation(initial),
      next: started,
    });
    expect(updated.updated).toBe(true);
    const stale = await repository.compareAndSet({
      key: KEY,
      expected: compareExpectation(initial),
      next: started,
    });
    expect(stale.updated).toBe(false);
  });

  it("represents expired claimed re-leasing without an attempt and expired started ambiguity", async () => {
    const claimed = createInitialSubmissionRecord({
      submissionRequestDigest: DIGEST,
      leaseOwner: "owner-a",
      now: 100,
      leaseDurationMs: 10,
    });
    const reLeased = validateSubmissionRecord({
      ...claimed,
      recordVersion: 2,
      lease: createLease({
        purpose: "dispatch",
        owner: "owner-b",
        now: 111,
        durationMs: 10,
      }),
      updatedAt: 111,
    });
    expect(reLeased.attemptCount).toBe(0);
    expect(reLeased.dispatchPhase).toBe("claimed");

    const started = validateSubmissionRecord({
      ...reLeased,
      recordVersion: 3,
      dispatchPhase: "started",
      attemptCount: 1,
      lastDispatchStartedAt: 112,
      updatedAt: 112,
    });
    const evidence = createEvidence({
      kind: "dispatch-lease-expired",
      observedAt: 122,
      identity: { recordVersion: started.recordVersion },
    });
    const ambiguous = validateSubmissionRecord({
      recordVersion: 4,
      submissionRequestDigest: DIGEST,
      state: "ambiguous",
      attemptCount: 1,
      lastDispatchStartedAt: 112,
      reconciliationEvidence: [evidence],
      updatedAt: 122,
    });
    expect(ambiguous.state).toBe("ambiguous");
    expect(ambiguous.lease).toBeUndefined();
    expect(ambiguous.dispatchPhase).toBeUndefined();
  });
});

describe("production database decision gate", () => {
  const inertAdapter = {
    submit: async () => {
      throw new Error("not called");
    },
    reconcile: async () => {
      throw new Error("not called");
    },
  };

  it("refuses missing, draft, expired, malformed, and incompatible decisions", () => {
    expect(() => validateProductionDatabaseDecision(undefined, 100)).toThrow();
    expect(() =>
      validateProductionDatabaseDecision(decision({ status: "draft" }), 100),
    ).toThrow(/not approved/);
    expect(() =>
      validateProductionDatabaseDecision(decision({ validUntil: 100 }), 100),
    ).toThrow(/not current/);
    expect(() =>
      validateProductionDatabaseDecision(
        { ...decision(), artifactDigest: DIGEST },
        100,
      ),
    ).toThrow(/artifact digest/);
    expect(() =>
      validateProductionDatabaseDecision(
        {
          ...decision(),
          recordSchemaVersion: "cork.submission-record/v2",
        } as DatabaseDecisionV1,
        100,
      ),
    ).toThrow(/incompatible/);
  });

  it("refuses the in-memory test substitute in production even with an approved decision", () => {
    const memory = new InMemorySubmissionRepository();
    expect(() =>
      SubmissionService.createProduction({
        config: {
          repository: memory,
          adapter: inertAdapter,
          clock: { nowMs: () => 100 },
          ownerId: "owner-a",
          dispatchLeaseDurationMs: 100,
          reconcileLeaseDurationMs: 100,
        },
        databaseDecision: decision(),
      }),
    ).toThrow(/in-memory/);
    expect(() =>
      SubmissionService.createProduction({
        config: {
          repository: productionRepository(),
          adapter: inertAdapter,
          clock: { nowMs: () => 100 },
          ownerId: "owner-a",
          dispatchLeaseDurationMs: 100,
          reconcileLeaseDurationMs: 100,
        },
        databaseDecision: decision(),
      }),
    ).not.toThrow();
  });
});
