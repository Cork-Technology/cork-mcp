import {
  compareExpectation,
  createEvidence,
  createInitialSubmissionRecord,
  createLease,
  sha256Canonical,
  validateProductionDatabaseDecision,
  validateSubmissionKey,
  validateSubmissionRecord,
  validateUpstreamResult,
  type DatabaseDecisionV1,
  type DispatchPhaseV1,
  type ExactUpstreamResultV1,
  type ReconciliationEvidenceV1,
  type SubmissionKeyV1,
  type SubmissionRecordV1,
  type SubmissionRepository,
} from "./submission-store.js";

export interface SubmissionClock {
  nowMs(): number;
}

export interface SignedOrderSubmissionRequestV1 {
  readonly schemaVersion: "cork.limit-order-submission/v1";
  readonly principalId: string;
  readonly upstreamProfileId: string;
  readonly clientRequestId: string;
  readonly chainId: string;
  readonly signedOrder: Readonly<Record<string, unknown>>;
  readonly submissionRequestDigest: string;
}

export type SubmissionAttemptOutcomeV1 =
  | {
      readonly kind: "accepted";
      readonly upstreamResult: ExactUpstreamResultV1;
      readonly upstreamOrderIdentifier?: string;
    }
  | {
      readonly kind: "rejected";
      readonly upstreamResult: ExactUpstreamResultV1;
      readonly upstreamOrderIdentifier?: string;
    }
  | {
      readonly kind: "uncertain";
      readonly evidenceIdentity: unknown;
    }
  | {
      readonly kind: "content-decoding-failed";
      readonly evidenceIdentity: unknown;
    };

export type ReconciliationOutcomeV1 =
  | {
      readonly kind: "found-accepted";
      readonly upstreamResult: ExactUpstreamResultV1;
      readonly upstreamOrderIdentifier?: string;
      readonly evidenceIdentity: unknown;
    }
  | {
      readonly kind: "found-rejected";
      readonly upstreamResult: ExactUpstreamResultV1;
      readonly upstreamOrderIdentifier?: string;
      readonly evidenceIdentity: unknown;
    }
  | {
      readonly kind: "absence-proved";
      readonly evidenceIdentity: unknown;
    }
  | {
      readonly kind: "absence-unproved";
      readonly evidenceIdentity: unknown;
    }
  | {
      readonly kind: "content-decoding-failed";
      readonly evidenceIdentity: unknown;
    };

export interface SubmissionUpstreamAdapter {
  submit(input: {
    readonly upstreamProfileId: string;
    readonly clientRequestId: string;
    readonly chainId: string;
    readonly signedOrder: Readonly<Record<string, unknown>>;
  }): Promise<SubmissionAttemptOutcomeV1>;
  reconcile(input: {
    readonly upstreamProfileId: string;
    readonly clientRequestId: string;
    readonly chainId: string;
    readonly signedOrder: Readonly<Record<string, unknown>>;
    readonly attemptCount: number;
  }): Promise<ReconciliationOutcomeV1>;
}

export type SubmissionServiceResultV1 =
  | {
      readonly status: "accepted";
      readonly acceptanceStatus: "accepted-not-filled";
      readonly replayed: boolean;
      readonly upstreamResult: ExactUpstreamResultV1;
      readonly upstreamOrderIdentifier?: string;
    }
  | {
      readonly status: "rejected";
      readonly replayed: boolean;
      readonly upstreamResult: ExactUpstreamResultV1;
      readonly upstreamOrderIdentifier?: string;
    }
  | {
      readonly status: "retry-authorized";
      readonly code: "SUBMISSION_RETRY_AUTHORIZED";
      readonly attemptCount: 1;
      readonly retryAfter: number;
    }
  | {
      readonly status: "error";
      readonly code:
        | "INVALID_SUBMISSION_REQUEST"
        | "IDEMPOTENCY_KEY_CONFLICT"
        | "SUBMISSION_IN_PROGRESS";
      readonly retryable: boolean;
      readonly retryAfter?: number;
    }
  | {
      readonly status: "ambiguous";
      readonly code: "SUBMISSION_OUTCOME_UNKNOWN";
      readonly retryable: false;
      readonly attemptCount: number;
    };

export interface SubmissionServiceConfig {
  readonly repository: SubmissionRepository;
  readonly adapter: SubmissionUpstreamAdapter;
  readonly clock: SubmissionClock;
  readonly ownerId: string;
  readonly dispatchLeaseDurationMs: number;
  readonly reconcileLeaseDurationMs: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestProjection(
  request: SignedOrderSubmissionRequestV1,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: request.schemaVersion,
    upstreamProfileId: request.upstreamProfileId,
    chainId: request.chainId,
    signedOrder: request.signedOrder,
  };
}

export function computeSubmissionRequestDigest(
  request: Omit<SignedOrderSubmissionRequestV1, "submissionRequestDigest">,
): string {
  return sha256Canonical(
    requestProjection(request as SignedOrderSubmissionRequestV1),
  );
}

function validateRequest(
  request: SignedOrderSubmissionRequestV1,
): SubmissionKeyV1 {
  if (
    request.schemaVersion !== "cork.limit-order-submission/v1" ||
    !/^(0|[1-9][0-9]*)$/.test(request.chainId) ||
    !isRecord(request.signedOrder)
  ) {
    throw new TypeError("submission request shape is invalid");
  }
  const key = validateSubmissionKey({
    principalId: request.principalId,
    upstreamProfileId: request.upstreamProfileId,
    clientRequestId: request.clientRequestId,
  });
  if (
    computeSubmissionRequestDigest({
      schemaVersion: request.schemaVersion,
      principalId: request.principalId,
      upstreamProfileId: request.upstreamProfileId,
      clientRequestId: request.clientRequestId,
      chainId: request.chainId,
      signedOrder: request.signedOrder,
    }) !== request.submissionRequestDigest
  ) {
    throw new TypeError("submissionRequestDigest does not match exact request");
  }
  return key;
}

function recordWith(
  current: SubmissionRecordV1,
  input: {
    readonly state: SubmissionRecordV1["state"];
    readonly dispatchPhase?: DispatchPhaseV1;
    readonly attemptCount?: number;
    readonly lastDispatchStartedAt?: number;
    readonly lease?: SubmissionRecordV1["lease"];
    readonly upstreamResult?: ExactUpstreamResultV1;
    readonly upstreamOrderIdentifier?: string;
    readonly appendEvidence?: ReconciliationEvidenceV1;
    readonly now: number;
  },
): SubmissionRecordV1 {
  return validateSubmissionRecord({
    recordVersion: current.recordVersion + 1,
    submissionRequestDigest: current.submissionRequestDigest,
    state: input.state,
    ...(input.dispatchPhase === undefined
      ? {}
      : { dispatchPhase: input.dispatchPhase }),
    attemptCount: input.attemptCount ?? current.attemptCount,
    ...(input.lastDispatchStartedAt === undefined
      ? current.lastDispatchStartedAt === undefined
        ? {}
        : { lastDispatchStartedAt: current.lastDispatchStartedAt }
      : { lastDispatchStartedAt: input.lastDispatchStartedAt }),
    ...(input.lease === undefined ? {} : { lease: input.lease }),
    ...(input.upstreamResult === undefined
      ? {}
      : { upstreamResult: input.upstreamResult }),
    ...(input.upstreamOrderIdentifier === undefined
      ? {}
      : { upstreamOrderIdentifier: input.upstreamOrderIdentifier }),
    reconciliationEvidence:
      input.appendEvidence === undefined
        ? current.reconciliationEvidence
        : [...current.reconciliationEvidence, input.appendEvidence],
    updatedAt: input.now,
  });
}

function terminalResult(
  record: SubmissionRecordV1,
  replayed: boolean,
): SubmissionServiceResultV1 {
  if (
    (record.state !== "accepted" && record.state !== "rejected") ||
    record.upstreamResult === undefined
  ) {
    throw new TypeError("terminal replay requires an exact upstream result");
  }
  const common = {
    replayed,
    upstreamResult: record.upstreamResult,
    ...(record.upstreamOrderIdentifier === undefined
      ? {}
      : { upstreamOrderIdentifier: record.upstreamOrderIdentifier }),
  };
  return record.state === "accepted"
    ? {
        status: "accepted",
        acceptanceStatus: "accepted-not-filled",
        ...common,
      }
    : { status: "rejected", ...common };
}

function inProgress(record: SubmissionRecordV1): SubmissionServiceResultV1 {
  return {
    status: "error",
    code: "SUBMISSION_IN_PROGRESS",
    retryable: true,
    ...(record.lease === undefined
      ? {}
      : { retryAfter: record.lease.leaseExpiresAt }),
  };
}

function unknown(record: SubmissionRecordV1): SubmissionServiceResultV1 {
  return {
    status: "ambiguous",
    code: "SUBMISSION_OUTCOME_UNKNOWN",
    retryable: false,
    attemptCount: record.attemptCount,
  };
}

export class SubmissionService {
  readonly #repository: SubmissionRepository;
  readonly #adapter: SubmissionUpstreamAdapter;
  readonly #clock: SubmissionClock;
  readonly #ownerId: string;
  readonly #dispatchLeaseDurationMs: number;
  readonly #reconcileLeaseDurationMs: number;

  private constructor(config: SubmissionServiceConfig) {
    if (
      config.ownerId.length === 0 ||
      !Number.isSafeInteger(config.dispatchLeaseDurationMs) ||
      config.dispatchLeaseDurationMs < 1 ||
      !Number.isSafeInteger(config.reconcileLeaseDurationMs) ||
      config.reconcileLeaseDurationMs < 1
    ) {
      throw new TypeError("submission service lease configuration is invalid");
    }
    this.#repository = config.repository;
    this.#adapter = config.adapter;
    this.#clock = config.clock;
    this.#ownerId = config.ownerId;
    this.#dispatchLeaseDurationMs = config.dispatchLeaseDurationMs;
    this.#reconcileLeaseDurationMs = config.reconcileLeaseDurationMs;
  }

  public static createLocalTestSubstitute(
    config: SubmissionServiceConfig,
  ): SubmissionService {
    if (!config.repository.testSubstitute) {
      throw new TypeError(
        "local construction requires an explicit test substitute",
      );
    }
    return new SubmissionService(config);
  }

  public static createProduction(input: {
    readonly config: SubmissionServiceConfig;
    readonly databaseDecision?: DatabaseDecisionV1;
  }): SubmissionService {
    validateProductionDatabaseDecision(
      input.databaseDecision,
      input.config.clock.nowMs(),
    );
    if (
      input.config.repository.testSubstitute ||
      !input.config.repository.productionCompatible
    ) {
      throw new TypeError(
        "production submission refuses the in-memory or incompatible repository",
      );
    }
    return new SubmissionService(input.config);
  }

  public async submit(
    request: SignedOrderSubmissionRequestV1,
  ): Promise<SubmissionServiceResultV1> {
    let key: SubmissionKeyV1;
    try {
      key = validateRequest(request);
    } catch {
      return {
        status: "error",
        code: "INVALID_SUBMISSION_REQUEST",
        retryable: false,
      };
    }
    const now = this.#clock.nowMs();
    const initial = createInitialSubmissionRecord({
      submissionRequestDigest: request.submissionRequestDigest,
      leaseOwner: this.#ownerId,
      now,
      leaseDurationMs: this.#dispatchLeaseDurationMs,
    });
    const created = await this.#repository.createIfAbsent(key, initial);
    let record = created.record;
    if (record.submissionRequestDigest !== request.submissionRequestDigest) {
      return {
        status: "error",
        code: "IDEMPOTENCY_KEY_CONFLICT",
        retryable: false,
      };
    }
    if (record.state === "accepted" || record.state === "rejected") {
      return terminalResult(record, true);
    }
    if (record.state === "ambiguous") {
      return record.lease !== undefined && record.lease.leaseExpiresAt > now
        ? inProgress(record)
        : unknown(record);
    }

    if (record.dispatchPhase === "started") {
      if (record.lease !== undefined && record.lease.leaseExpiresAt > now) {
        return inProgress(record);
      }
      const evidence = createEvidence({
        kind: "dispatch-lease-expired",
        observedAt: now,
        identity: { recordVersion: record.recordVersion },
      });
      const ambiguous = recordWith(record, {
        state: "ambiguous",
        appendEvidence: evidence,
        now,
      });
      const expired = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(record),
        next: ambiguous,
      });
      return unknown(expired.updated ? expired.record : record);
    }

    if (
      record.lease === undefined ||
      record.lease.leasePurpose !== "dispatch"
    ) {
      return unknown(record);
    }
    if (
      record.lease.leaseOwner !== this.#ownerId &&
      record.lease.leaseExpiresAt > now
    ) {
      return inProgress(record);
    }
    if (
      record.lease.leaseOwner !== this.#ownerId ||
      record.lease.leaseExpiresAt <= now
    ) {
      const reclaimed = recordWith(record, {
        state: "pending",
        dispatchPhase: "claimed",
        lease: createLease({
          purpose: "dispatch",
          owner: this.#ownerId,
          now,
          durationMs: this.#dispatchLeaseDurationMs,
        }),
        now,
      });
      const claimed = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(record),
        next: reclaimed,
      });
      if (!claimed.updated) {
        return claimed.current === undefined
          ? unknown(record)
          : inProgress(claimed.current);
      }
      record = claimed.record;
    }
    return this.#dispatch(key, record, request);
  }

  public async reconcile(
    request: SignedOrderSubmissionRequestV1,
  ): Promise<SubmissionServiceResultV1> {
    let key: SubmissionKeyV1;
    try {
      key = validateRequest(request);
    } catch {
      return {
        status: "error",
        code: "INVALID_SUBMISSION_REQUEST",
        retryable: false,
      };
    }
    let record = await this.#repository.read(key);
    if (record === undefined) {
      return {
        status: "error",
        code: "INVALID_SUBMISSION_REQUEST",
        retryable: false,
      };
    }
    if (record.submissionRequestDigest !== request.submissionRequestDigest) {
      return {
        status: "error",
        code: "IDEMPOTENCY_KEY_CONFLICT",
        retryable: false,
      };
    }
    if (record.state === "accepted" || record.state === "rejected") {
      return terminalResult(record, true);
    }
    const now = this.#clock.nowMs();
    if (record.state === "pending") {
      if (record.lease !== undefined && record.lease.leaseExpiresAt > now) {
        return inProgress(record);
      }
      if (record.dispatchPhase === "claimed") {
        return inProgress(record);
      }
      const evidence = createEvidence({
        kind: "dispatch-lease-expired",
        observedAt: now,
        identity: { recordVersion: record.recordVersion },
      });
      const ambiguous = recordWith(record, {
        state: "ambiguous",
        appendEvidence: evidence,
        now,
      });
      const expired = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(record),
        next: ambiguous,
      });
      if (!expired.updated) {
        return expired.current === undefined
          ? unknown(record)
          : inProgress(expired.current);
      }
      record = expired.record;
    }
    if (record.lease !== undefined && record.lease.leaseExpiresAt > now) {
      return inProgress(record);
    }
    if (record.lease !== undefined) {
      const expiryEvidence = createEvidence({
        kind: "reconcile-lease-expired",
        observedAt: now,
        identity: { recordVersion: record.recordVersion },
      });
      const idle = recordWith(record, {
        state: "ambiguous",
        appendEvidence: expiryEvidence,
        now,
      });
      const released = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(record),
        next: idle,
      });
      if (!released.updated) {
        return released.current === undefined
          ? unknown(record)
          : inProgress(released.current);
      }
      record = released.record;
    }
    const claimedRecord = recordWith(record, {
      state: "ambiguous",
      lease: createLease({
        purpose: "reconcile",
        owner: this.#ownerId,
        now,
        durationMs: this.#reconcileLeaseDurationMs,
      }),
      now,
    });
    const claimed = await this.#repository.compareAndSet({
      key,
      expected: compareExpectation(record),
      next: claimedRecord,
    });
    if (!claimed.updated) {
      return claimed.current === undefined
        ? unknown(record)
        : inProgress(claimed.current);
    }
    record = claimed.record;
    return this.#reconcileOwned(key, record, request);
  }

  async #dispatch(
    key: SubmissionKeyV1,
    claimed: SubmissionRecordV1,
    request: SignedOrderSubmissionRequestV1,
  ): Promise<SubmissionServiceResultV1> {
    const now = this.#clock.nowMs();
    if (
      claimed.state !== "pending" ||
      claimed.dispatchPhase !== "claimed" ||
      claimed.lease?.leasePurpose !== "dispatch" ||
      claimed.lease.leaseOwner !== this.#ownerId ||
      claimed.attemptCount >= 2
    ) {
      return unknown(claimed);
    }
    const started = recordWith(claimed, {
      state: "pending",
      dispatchPhase: "started",
      attemptCount: claimed.attemptCount + 1,
      lastDispatchStartedAt: now,
      lease: claimed.lease,
      now,
    });
    const durableStart = await this.#repository.compareAndSet({
      key,
      expected: compareExpectation(claimed),
      next: started,
    });
    if (!durableStart.updated) {
      return durableStart.current === undefined
        ? unknown(claimed)
        : inProgress(durableStart.current);
    }

    let outcome: SubmissionAttemptOutcomeV1;
    try {
      outcome = await this.#adapter.submit({
        upstreamProfileId: request.upstreamProfileId,
        clientRequestId: request.clientRequestId,
        chainId: request.chainId,
        signedOrder: request.signedOrder,
      });
    } catch {
      outcome = {
        kind: "uncertain",
        evidenceIdentity: { kind: "adapter-throw" },
      };
    }
    if (outcome.kind === "accepted" || outcome.kind === "rejected") {
      let upstreamResult: ExactUpstreamResultV1;
      try {
        upstreamResult = validateUpstreamResult(outcome.upstreamResult);
      } catch {
        return this.#markAmbiguous(key, started, "content-decoding-failed", {
          kind: "invalid-upstream-result",
        });
      }
      const terminal = recordWith(started, {
        state: outcome.kind,
        upstreamResult,
        ...(outcome.upstreamOrderIdentifier === undefined
          ? {}
          : { upstreamOrderIdentifier: outcome.upstreamOrderIdentifier }),
        now: this.#clock.nowMs(),
      });
      const stored = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(started),
        next: terminal,
      });
      if (stored.updated) {
        return terminalResult(stored.record, false);
      }
      return this.#markAmbiguous(key, started, "compare-and-set-uncertain", {
        kind: "terminal-compare-and-set-failed",
      });
    }
    return this.#markAmbiguous(
      key,
      started,
      outcome.kind === "content-decoding-failed"
        ? "content-decoding-failed"
        : "transport-uncertain",
      outcome.evidenceIdentity,
    );
  }

  async #markAmbiguous(
    key: SubmissionKeyV1,
    started: SubmissionRecordV1,
    kind:
      | "transport-uncertain"
      | "content-decoding-failed"
      | "compare-and-set-uncertain",
    identity: unknown,
  ): Promise<SubmissionServiceResultV1> {
    const now = this.#clock.nowMs();
    const evidence = createEvidence({ kind, observedAt: now, identity });
    const ambiguous = recordWith(started, {
      state: "ambiguous",
      appendEvidence: evidence,
      now,
    });
    const stored = await this.#repository.compareAndSet({
      key,
      expected: compareExpectation(started),
      next: ambiguous,
    });
    return unknown(stored.updated ? stored.record : started);
  }

  async #reconcileOwned(
    key: SubmissionKeyV1,
    record: SubmissionRecordV1,
    request: SignedOrderSubmissionRequestV1,
  ): Promise<SubmissionServiceResultV1> {
    let outcome: ReconciliationOutcomeV1;
    try {
      outcome = await this.#adapter.reconcile({
        upstreamProfileId: request.upstreamProfileId,
        clientRequestId: request.clientRequestId,
        chainId: request.chainId,
        signedOrder: request.signedOrder,
        attemptCount: record.attemptCount,
      });
    } catch {
      outcome = {
        kind: "absence-unproved",
        evidenceIdentity: { kind: "reconcile-adapter-throw" },
      };
    }
    const now = this.#clock.nowMs();
    if (
      outcome.kind === "found-accepted" ||
      outcome.kind === "found-rejected"
    ) {
      let upstreamResult: ExactUpstreamResultV1;
      try {
        upstreamResult = validateUpstreamResult(outcome.upstreamResult);
      } catch {
        return this.#releaseUnknown(key, record, "content-decoding-failed", {
          kind: "invalid-reconciliation-result",
        });
      }
      const evidence = createEvidence({
        kind: outcome.kind,
        observedAt: now,
        identity: outcome.evidenceIdentity,
      });
      const terminal = recordWith(record, {
        state: outcome.kind === "found-accepted" ? "accepted" : "rejected",
        upstreamResult,
        ...(outcome.upstreamOrderIdentifier === undefined
          ? {}
          : { upstreamOrderIdentifier: outcome.upstreamOrderIdentifier }),
        appendEvidence: evidence,
        now,
      });
      const stored = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(record),
        next: terminal,
      });
      return stored.updated
        ? terminalResult(stored.record, false)
        : unknown(record);
    }
    if (outcome.kind === "absence-proved" && record.attemptCount === 1) {
      const evidence = createEvidence({
        kind: "absence-proved",
        observedAt: now,
        identity: outcome.evidenceIdentity,
      });
      const retry = recordWith(record, {
        state: "pending",
        dispatchPhase: "claimed",
        lease: createLease({
          purpose: "dispatch",
          owner: this.#ownerId,
          now,
          durationMs: this.#dispatchLeaseDurationMs,
        }),
        appendEvidence: evidence,
        now,
      });
      const stored = await this.#repository.compareAndSet({
        key,
        expected: compareExpectation(record),
        next: retry,
      });
      return stored.updated
        ? {
            status: "retry-authorized",
            code: "SUBMISSION_RETRY_AUTHORIZED",
            attemptCount: 1,
            retryAfter: stored.record.lease?.leaseExpiresAt ?? now,
          }
        : unknown(record);
    }
    return this.#releaseUnknown(
      key,
      record,
      outcome.kind === "content-decoding-failed"
        ? "content-decoding-failed"
        : outcome.kind === "absence-proved"
          ? "absence-proved"
          : "absence-unproved",
      outcome.evidenceIdentity,
    );
  }

  async #releaseUnknown(
    key: SubmissionKeyV1,
    record: SubmissionRecordV1,
    kind: "content-decoding-failed" | "absence-proved" | "absence-unproved",
    identity: unknown,
  ): Promise<SubmissionServiceResultV1> {
    const now = this.#clock.nowMs();
    const evidence = createEvidence({ kind, observedAt: now, identity });
    const idle = recordWith(record, {
      state: "ambiguous",
      appendEvidence: evidence,
      now,
    });
    const released = await this.#repository.compareAndSet({
      key,
      expected: compareExpectation(record),
      next: idle,
    });
    return unknown(released.updated ? released.record : record);
  }
}
