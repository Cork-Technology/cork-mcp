export const MAX_REVOCATION_CACHE_AGE_MS = 30_000 as const;

export type HostedScope =
  | "capabilities:read"
  | "phoenix:read"
  | "phoenix:verify"
  | "authority:read"
  | "authority:write"
  | "action:write"
  | "simulation:run"
  | "reconciliation:read"
  | "exact-spend:write"
  | "exact-spend:simulate"
  | "exact-spend:reconcile"
  | "limit-orders:read"
  | "limit-orders:write"
  | "signed-orders:submit"
  | "market-deployment:write";

export interface CredentialClaims {
  readonly credentialId: string;
  readonly principalId: string;
  readonly ownerId: string;
  readonly environment: string;
  readonly trafficClass: "public" | "first-party";
  readonly scopes: readonly HostedScope[];
  readonly issuedAtMs: number;
  readonly expiresAtMs?: number;
  readonly reviewAtMs?: number;
  readonly revocationId: string;
}

export interface CredentialVerifier {
  verify(rawCredential: string): Promise<CredentialClaims>;
}

export interface RevocationSource {
  isRevoked(revocationId: string): Promise<boolean>;
}

export interface GatewayClock {
  nowMs(): number;
}

export type CredentialFailureCode =
  | "CREDENTIAL_INVALID"
  | "CREDENTIAL_EXPIRED"
  | "CREDENTIAL_REVIEW_REQUIRED"
  | "CREDENTIAL_REVOKED";

export type CredentialResult =
  | {
      readonly ok: true;
      readonly claims: CredentialClaims;
    }
  | {
      readonly ok: false;
      readonly failure: {
        readonly code: CredentialFailureCode;
        readonly message: string;
      };
    };

interface RevocationCacheEntry {
  readonly revoked: boolean;
  readonly checkedAtMs: number;
}

const HOSTED_SCOPES = new Set<HostedScope>([
  "capabilities:read",
  "phoenix:read",
  "phoenix:verify",
  "authority:read",
  "authority:write",
  "action:write",
  "simulation:run",
  "reconciliation:read",
  "exact-spend:write",
  "exact-spend:simulate",
  "exact-spend:reconcile",
  "limit-orders:read",
  "limit-orders:write",
  "signed-orders:submit",
  "market-deployment:write",
]);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safeTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validateClaims(value: CredentialClaims): CredentialClaims {
  if (
    !nonEmpty(value.credentialId) ||
    !nonEmpty(value.principalId) ||
    !nonEmpty(value.ownerId) ||
    !nonEmpty(value.environment) ||
    !nonEmpty(value.revocationId) ||
    (value.trafficClass !== "public" && value.trafficClass !== "first-party") ||
    !Array.isArray(value.scopes) ||
    !safeTime(value.issuedAtMs) ||
    (value.expiresAtMs !== undefined && !safeTime(value.expiresAtMs)) ||
    (value.reviewAtMs !== undefined && !safeTime(value.reviewAtMs))
  ) {
    throw new TypeError(
      "credential verifier returned invalid non-secret claims",
    );
  }
  const scopes = value.scopes.map((scope) => {
    if (!HOSTED_SCOPES.has(scope)) {
      throw new TypeError("credential verifier returned an unknown scope");
    }
    return scope;
  });
  if (new Set(scopes).size !== scopes.length) {
    throw new TypeError("credential verifier returned duplicate scopes");
  }
  return {
    credentialId: value.credentialId,
    principalId: value.principalId,
    ownerId: value.ownerId,
    environment: value.environment,
    trafficClass: value.trafficClass,
    scopes,
    issuedAtMs: value.issuedAtMs,
    ...(value.expiresAtMs === undefined
      ? {}
      : { expiresAtMs: value.expiresAtMs }),
    ...(value.reviewAtMs === undefined ? {} : { reviewAtMs: value.reviewAtMs }),
    revocationId: value.revocationId,
  };
}

export class RevocationCache {
  readonly #source: RevocationSource;
  readonly #clock: GatewayClock;
  readonly #maximumAgeMs: number;
  readonly #entries = new Map<string, RevocationCacheEntry>();

  public constructor(input: {
    readonly source: RevocationSource;
    readonly clock: GatewayClock;
    readonly maximumAgeMs: number;
  }) {
    if (
      !Number.isSafeInteger(input.maximumAgeMs) ||
      input.maximumAgeMs < 0 ||
      input.maximumAgeMs > MAX_REVOCATION_CACHE_AGE_MS
    ) {
      throw new TypeError(
        `revocation cache age must be from 0 through ${MAX_REVOCATION_CACHE_AGE_MS} milliseconds`,
      );
    }
    this.#source = input.source;
    this.#clock = input.clock;
    this.#maximumAgeMs = input.maximumAgeMs;
  }

  public async isRevoked(revocationId: string): Promise<boolean> {
    if (!nonEmpty(revocationId)) {
      throw new TypeError("revocationId is required");
    }
    const now = this.#clock.nowMs();
    const cached = this.#entries.get(revocationId);
    if (cached !== undefined && now - cached.checkedAtMs < this.#maximumAgeMs) {
      return cached.revoked;
    }
    const revoked = await this.#source.isRevoked(revocationId);
    this.#entries.set(revocationId, { revoked, checkedAtMs: now });
    return revoked;
  }
}

export class CredentialControl {
  readonly #verifier: CredentialVerifier;
  readonly #revocations: RevocationCache;
  readonly #clock: GatewayClock;

  public constructor(input: {
    readonly verifier: CredentialVerifier;
    readonly revocations: RevocationCache;
    readonly clock: GatewayClock;
  }) {
    this.#verifier = input.verifier;
    this.#revocations = input.revocations;
    this.#clock = input.clock;
  }

  public async authenticate(rawCredential: string): Promise<CredentialResult> {
    let claims: CredentialClaims;
    try {
      claims = validateClaims(await this.#verifier.verify(rawCredential));
    } catch {
      return {
        ok: false,
        failure: {
          code: "CREDENTIAL_INVALID",
          message: "credential verification failed",
        },
      };
    }
    const now = this.#clock.nowMs();
    if (claims.expiresAtMs !== undefined && now >= claims.expiresAtMs) {
      return {
        ok: false,
        failure: {
          code: "CREDENTIAL_EXPIRED",
          message: "credential has expired",
        },
      };
    }
    if (claims.reviewAtMs !== undefined && now >= claims.reviewAtMs) {
      return {
        ok: false,
        failure: {
          code: "CREDENTIAL_REVIEW_REQUIRED",
          message: "credential review is required",
        },
      };
    }
    if (await this.#revocations.isRevoked(claims.revocationId)) {
      return {
        ok: false,
        failure: {
          code: "CREDENTIAL_REVOKED",
          message: "credential is revoked",
        },
      };
    }
    return { ok: true, claims };
  }
}

export interface WorkCost {
  readonly concurrency: number;
  readonly upstream: number;
  readonly simulation: number;
  readonly queue: number;
  readonly responseBytes: number;
  readonly total: number;
}

type ReservedDimension = "concurrency" | "upstream" | "simulation" | "queue";

export interface WorkAdmissionConfig {
  readonly perPrincipal: WorkCost;
  readonly global: WorkCost;
  readonly firstPartyReserve: Readonly<Record<ReservedDimension, number>>;
}

export interface WorkLease {
  release(): void;
}

export class WorkAdmissionError extends Error {
  public override readonly name = "WorkAdmissionError";

  public constructor(
    public readonly code: "BOUNDED_WORK_REJECTED",
    message: string,
  ) {
    super(message);
  }
}

const COST_KEYS = [
  "concurrency",
  "upstream",
  "simulation",
  "queue",
  "responseBytes",
  "total",
] as const;

function zeroCost(): WorkCost {
  return {
    concurrency: 0,
    upstream: 0,
    simulation: 0,
    queue: 0,
    responseBytes: 0,
    total: 0,
  };
}

function validateCost(cost: WorkCost, label: string): void {
  for (const key of COST_KEYS) {
    if (!Number.isSafeInteger(cost[key]) || cost[key] < 0) {
      throw new TypeError(
        `${label}.${key} must be a non-negative safe integer`,
      );
    }
  }
}

function addCost(left: WorkCost, right: WorkCost): WorkCost {
  return {
    concurrency: left.concurrency + right.concurrency,
    upstream: left.upstream + right.upstream,
    simulation: left.simulation + right.simulation,
    queue: left.queue + right.queue,
    responseBytes: left.responseBytes + right.responseBytes,
    total: left.total + right.total,
  };
}

function subtractCost(left: WorkCost, right: WorkCost): WorkCost {
  return {
    concurrency: left.concurrency - right.concurrency,
    upstream: left.upstream - right.upstream,
    simulation: left.simulation - right.simulation,
    queue: left.queue - right.queue,
    responseBytes: left.responseBytes - right.responseBytes,
    total: left.total - right.total,
  };
}

function exceeds(usage: WorkCost, limit: WorkCost): boolean {
  return COST_KEYS.some((key) => usage[key] > limit[key]);
}

function publicLimit(config: WorkAdmissionConfig): WorkCost {
  return {
    concurrency:
      config.global.concurrency - config.firstPartyReserve.concurrency,
    upstream: config.global.upstream - config.firstPartyReserve.upstream,
    simulation: config.global.simulation - config.firstPartyReserve.simulation,
    queue: config.global.queue - config.firstPartyReserve.queue,
    responseBytes: config.global.responseBytes,
    total: config.global.total,
  };
}

export class WorkAdmissionController {
  readonly #config: WorkAdmissionConfig;
  readonly #principalUsage = new Map<string, WorkCost>();
  #globalUsage: WorkCost = zeroCost();
  #publicUsage: WorkCost = zeroCost();

  public constructor(config: WorkAdmissionConfig) {
    validateCost(config.perPrincipal, "perPrincipal");
    validateCost(config.global, "global");
    for (const key of [
      "concurrency",
      "upstream",
      "simulation",
      "queue",
    ] as const) {
      const reserve = config.firstPartyReserve[key];
      if (
        !Number.isSafeInteger(reserve) ||
        reserve < 0 ||
        reserve > config.global[key]
      ) {
        throw new TypeError(`firstPartyReserve.${key} is invalid`);
      }
    }
    this.#config = config;
  }

  public admit(input: {
    readonly principalId: string;
    readonly trafficClass: "public" | "first-party";
    readonly cost: WorkCost;
  }): WorkLease {
    if (!nonEmpty(input.principalId)) {
      throw new WorkAdmissionError(
        "BOUNDED_WORK_REJECTED",
        "principal identity is required for work admission",
      );
    }
    validateCost(input.cost, "cost");
    const currentPrincipal =
      this.#principalUsage.get(input.principalId) ?? zeroCost();
    const nextPrincipal = addCost(currentPrincipal, input.cost);
    const nextGlobal = addCost(this.#globalUsage, input.cost);
    if (exceeds(nextPrincipal, this.#config.perPrincipal)) {
      throw new WorkAdmissionError(
        "BOUNDED_WORK_REJECTED",
        "per-principal weighted work limit exceeded",
      );
    }
    if (exceeds(nextGlobal, this.#config.global)) {
      throw new WorkAdmissionError(
        "BOUNDED_WORK_REJECTED",
        "global weighted work limit exceeded",
      );
    }
    let nextPublic = this.#publicUsage;
    if (input.trafficClass === "public") {
      nextPublic = addCost(this.#publicUsage, input.cost);
      if (exceeds(nextPublic, publicLimit(this.#config))) {
        throw new WorkAdmissionError(
          "BOUNDED_WORK_REJECTED",
          "public work would consume first-party reserved capacity",
        );
      }
    }

    this.#principalUsage.set(input.principalId, nextPrincipal);
    this.#globalUsage = nextGlobal;
    this.#publicUsage = nextPublic;
    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        const principal =
          this.#principalUsage.get(input.principalId) ?? zeroCost();
        const remaining = subtractCost(principal, input.cost);
        if (COST_KEYS.every((key) => remaining[key] === 0)) {
          this.#principalUsage.delete(input.principalId);
        } else {
          this.#principalUsage.set(input.principalId, remaining);
        }
        this.#globalUsage = subtractCost(this.#globalUsage, input.cost);
        if (input.trafficClass === "public") {
          this.#publicUsage = subtractCost(this.#publicUsage, input.cost);
        }
      },
    };
  }

  public snapshot(): {
    readonly global: WorkCost;
    readonly public: WorkCost;
    readonly principals: Readonly<Record<string, WorkCost>>;
  } {
    return {
      global: { ...this.#globalUsage },
      public: { ...this.#publicUsage },
      principals: Object.fromEntries(
        [...this.#principalUsage.entries()].map(([key, value]) => [
          key,
          { ...value },
        ]),
      ),
    };
  }
}

const SENSITIVE_KEY_PARTS = [
  "credential",
  "authorization",
  "privateendpoint",
  "rpcendpoint",
  "providerendpoint",
  "signature",
  "calldata",
  "typeddata",
  "permit2",
  "safemessage",
  "safeconfirmation",
  "safetransaction",
  "transactionbody",
  "signedorder",
  "orderbody",
] as const;

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function sensitiveString(value: string): boolean {
  return (
    /^bearer\s+/i.test(value) ||
    /^basic\s+/i.test(value) ||
    /^https?:\/\/[^/]*@/i.test(value)
  );
}

export function redactTelemetry(value: unknown): unknown {
  if (typeof value === "string") {
    return sensitiveString(value) ? "[REDACTED]" : value;
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactTelemetry(item));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sensitiveKey(key) ? "[REDACTED]" : redactTelemetry(item);
    }
    return output;
  }
  return "[REDACTED]";
}

const METRIC_LABEL_KEYS = [
  "component",
  "operation",
  "outcome",
  "environment",
] as const;

export interface MetricLabelInput {
  readonly component: string;
  readonly operation: string;
  readonly outcome: string;
  readonly environment: string;
}

export function createMetricLabels(
  input: MetricLabelInput,
): Readonly<Record<string, string>> {
  const record = input as unknown as Readonly<Record<string, unknown>>;
  const labels: Record<string, string> = {};
  for (const key of METRIC_LABEL_KEYS) {
    const value = record[key];
    labels[key] =
      typeof value === "string" && !sensitiveString(value)
        ? value.slice(0, 128)
        : "invalid";
  }
  return labels;
}
