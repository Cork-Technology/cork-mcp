import {
  canonicalizeJson,
  deepFreeze,
  sha256CanonicalJson,
  type AccountV1,
  type JsonValue,
  type Sha256Digest,
} from "./kernel.js";
import type { BrowserSignatureVerifierV1 } from "./evidence.js";
import {
  assertLimitOrderIntentAuthority,
  finalizeLimitOrderMaker,
  prepareLimitOrderAllowanceRevocation,
  prepareLimitOrderCancellation,
  prepareLimitOrderMaker,
  prepareLimitOrderTaker,
  reconcileLimitOrder,
  resolveLimitOrderAuthority,
  verifyFinalizedLimitOrder,
  type FinalizedSignedOrderV1,
  type LimitOrderAgreementVerifierV1,
  type LimitOrderAllowanceRevocationV1,
  type LimitOrderCancellationV1,
  type LimitOrderChainReconciliationV1,
  type LimitOrderDeploymentEvidenceInputV1,
  type LimitOrderIdentityStateV1,
  type LimitOrderMakerIntentV1,
  type LimitOrderReconciliationV1,
  type LimitOrderServiceClaimV1,
  type LimitOrderSignatureVerifierV1,
  type LimitOrderTakerIntentV1,
  type LimitOrderVerifiedMarketReferenceV1,
  type MakerOrderInventoryV1,
  type MakerPreparationResultV1,
  type TakerPreparationResultV1,
} from "./limit-orders.js";

export interface LimitOrderSubmissionRequestV1 {
  readonly schemaVersion: "cork.limit-order-submission/v1";
  readonly principalId: string;
  readonly upstreamProfileId: string;
  readonly clientRequestId: string;
  readonly chainId: string;
  readonly signedOrder: FinalizedSignedOrderV1;
  readonly submissionRequestDigest: Sha256Digest;
}

export type LimitOrderSubmissionLifecycleResultV1 =
  | {
      readonly status: "accepted";
      readonly acceptanceStatus: "accepted-not-filled";
      readonly replayed: boolean;
      readonly upstreamResult: unknown;
      readonly upstreamOrderIdentifier?: string;
    }
  | {
      readonly status: "rejected";
      readonly replayed: boolean;
      readonly upstreamResult: unknown;
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

export interface DurableLimitOrderSubmissionPortV1<
  Result extends LimitOrderSubmissionLifecycleResultV1,
> {
  submit(input: LimitOrderSubmissionRequestV1): Promise<Result>;
  reconcile(input: LimitOrderSubmissionRequestV1): Promise<Result>;
}

export interface DirectLimitOrderLifecycleConfigV1<
  Result extends LimitOrderSubmissionLifecycleResultV1,
> {
  readonly deploymentEvidence: LimitOrderDeploymentEvidenceInputV1;
  readonly evidenceVerifier: BrowserSignatureVerifierV1;
  readonly agreementVerifier: LimitOrderAgreementVerifierV1;
  readonly signatureVerifier: LimitOrderSignatureVerifierV1;
  readonly submission: DurableLimitOrderSubmissionPortV1<Result>;
}

export interface DirectLimitOrderMakerPreparationInputV1 {
  readonly intent: LimitOrderMakerIntentV1;
  readonly inventory: MakerOrderInventoryV1;
  readonly identityState: LimitOrderIdentityStateV1;
  readonly currentAllowance: string;
  readonly zeroFirst: boolean;
  readonly authorityMode: "classic-erc20";
}

export interface DirectLimitOrderSubmissionInputV1 {
  readonly principalId: string;
  readonly upstreamProfileId: string;
  readonly clientRequestId: string;
  readonly finalizedOrder: FinalizedSignedOrderV1;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertSameAuthority(
  signedOrder: FinalizedSignedOrderV1,
  config: Pick<
    DirectLimitOrderLifecycleConfigV1<LimitOrderSubmissionLifecycleResultV1>,
    "deploymentEvidence" | "evidenceVerifier"
  >,
  requireActive: boolean,
): void {
  const authority = resolveLimitOrderAuthority(
    config.deploymentEvidence,
    config.evidenceVerifier,
    requireActive,
  );
  if (
    canonicalizeJson(signedOrder.deployment as unknown as JsonValue) !==
    canonicalizeJson(authority.deployment as unknown as JsonValue)
  ) {
    throw new TypeError(
      "signed order deployment does not match verified authority",
    );
  }
  assertLimitOrderIntentAuthority(
    signedOrder.intent,
    authority.deployment,
    authority.pool,
  );
}

export function createLimitOrderSubmissionRequest(
  input: DirectLimitOrderSubmissionInputV1,
  config: Pick<
    DirectLimitOrderLifecycleConfigV1<LimitOrderSubmissionLifecycleResultV1>,
    | "deploymentEvidence"
    | "evidenceVerifier"
    | "agreementVerifier"
    | "signatureVerifier"
  >,
): LimitOrderSubmissionRequestV1 {
  assertNonEmpty(input.principalId, "principalId");
  assertNonEmpty(input.upstreamProfileId, "upstreamProfileId");
  assertNonEmpty(input.clientRequestId, "clientRequestId");
  if (input.clientRequestId.length > 128) {
    throw new RangeError("clientRequestId exceeds 128 characters");
  }
  const signedOrder = verifyFinalizedLimitOrder(
    input.finalizedOrder,
    config.agreementVerifier,
    config.signatureVerifier,
  );
  assertSameAuthority(signedOrder, config, true);
  const withoutDigest = {
    schemaVersion: "cork.limit-order-submission/v1" as const,
    principalId: input.principalId,
    upstreamProfileId: input.upstreamProfileId,
    clientRequestId: input.clientRequestId,
    chainId: signedOrder.deployment.chainId,
    signedOrder,
  };
  const digestProjection = {
    schemaVersion: withoutDigest.schemaVersion,
    upstreamProfileId: withoutDigest.upstreamProfileId,
    chainId: withoutDigest.chainId,
    signedOrder: withoutDigest.signedOrder,
  };
  return deepFreeze({
    ...withoutDigest,
    submissionRequestDigest: sha256CanonicalJson(
      digestProjection as unknown as JsonValue,
    ),
  }) as LimitOrderSubmissionRequestV1;
}

export class DirectLimitOrderLifecycleV1<
  Result extends LimitOrderSubmissionLifecycleResultV1,
> {
  readonly #config: DirectLimitOrderLifecycleConfigV1<Result>;

  public constructor(config: DirectLimitOrderLifecycleConfigV1<Result>) {
    this.#config = config;
  }

  public makerPrepare(
    input: DirectLimitOrderMakerPreparationInputV1,
  ): MakerPreparationResultV1 {
    const authority = resolveLimitOrderAuthority(
      this.#config.deploymentEvidence,
      this.#config.evidenceVerifier,
      true,
    );
    assertLimitOrderIntentAuthority(
      input.intent,
      authority.deployment,
      authority.pool,
    );
    return prepareLimitOrderMaker(
      {
        ...input,
        deployment: authority.deployment,
      },
      this.#config.agreementVerifier,
    );
  }

  public makerFinalize(input: {
    readonly prepared: Extract<
      MakerPreparationResultV1,
      { readonly outcome: "prepared" }
    >;
    readonly signature: string;
  }): FinalizedSignedOrderV1 {
    const authority = resolveLimitOrderAuthority(
      this.#config.deploymentEvidence,
      this.#config.evidenceVerifier,
      true,
    );
    if (
      canonicalizeJson(input.prepared.deployment as unknown as JsonValue) !==
      canonicalizeJson(authority.deployment as unknown as JsonValue)
    ) {
      throw new TypeError(
        "prepared maker deployment does not match verified authority",
      );
    }
    assertLimitOrderIntentAuthority(
      input.prepared.intent,
      authority.deployment,
      authority.pool,
    );
    return finalizeLimitOrderMaker(
      input,
      this.#config.agreementVerifier,
      this.#config.signatureVerifier,
    );
  }

  public createSubmissionRequest(
    input: DirectLimitOrderSubmissionInputV1,
  ): LimitOrderSubmissionRequestV1 {
    return createLimitOrderSubmissionRequest(input, this.#config);
  }

  public async submit(
    input: DirectLimitOrderSubmissionInputV1,
  ): Promise<Result> {
    return this.#config.submission.submit(this.createSubmissionRequest(input));
  }

  public async reconcileSubmission(
    input: DirectLimitOrderSubmissionInputV1,
  ): Promise<Result> {
    return this.#config.submission.reconcile(
      this.createSubmissionRequest(input),
    );
  }

  public takerPrepare(
    input: LimitOrderTakerIntentV1,
  ): TakerPreparationResultV1 {
    const signedOrder = verifyFinalizedLimitOrder(
      input.signedOrder,
      this.#config.agreementVerifier,
      this.#config.signatureVerifier,
    );
    assertSameAuthority(signedOrder, this.#config, true);
    return prepareLimitOrderTaker(
      { ...input, signedOrder },
      this.#config.agreementVerifier,
      this.#config.signatureVerifier,
    );
  }

  public cancellationPrepare(input: {
    readonly signedOrder: FinalizedSignedOrderV1;
    readonly mode: "order-cancel" | "bit-invalidate";
    readonly currentInvalidatorRaw: string;
  }): LimitOrderCancellationV1 {
    const signedOrder = verifyFinalizedLimitOrder(
      input.signedOrder,
      this.#config.agreementVerifier,
      this.#config.signatureVerifier,
    );
    assertSameAuthority(signedOrder, this.#config, true);
    return prepareLimitOrderCancellation(
      { ...input, signedOrder },
      this.#config.agreementVerifier,
      this.#config.signatureVerifier,
    );
  }

  public allowanceRevocationPrepare(input: {
    readonly market: LimitOrderVerifiedMarketReferenceV1;
    readonly role: "maker" | "taker";
    readonly owner: AccountV1;
  }): LimitOrderAllowanceRevocationV1 {
    return prepareLimitOrderAllowanceRevocation(
      {
        ...input,
        deploymentEvidence: this.#config.deploymentEvidence,
      },
      this.#config.evidenceVerifier,
    );
  }

  public reconcile(input: {
    readonly signedOrder: FinalizedSignedOrderV1;
    readonly submitted: boolean;
    readonly service: LimitOrderServiceClaimV1;
    readonly chain: LimitOrderChainReconciliationV1;
  }): LimitOrderReconciliationV1 {
    const signedOrder = verifyFinalizedLimitOrder(
      input.signedOrder,
      this.#config.agreementVerifier,
      this.#config.signatureVerifier,
    );
    assertSameAuthority(signedOrder, this.#config, false);
    if (
      input.chain.expiry !== signedOrder.intent.expiry ||
      BigInt(input.chain.remainingMakingAmount) >
        BigInt(signedOrder.identity.order.makingAmount)
    ) {
      throw new TypeError(
        "chain reconciliation does not match the verified signed order",
      );
    }
    return reconcileLimitOrder({ ...input, signedOrder });
  }
}
