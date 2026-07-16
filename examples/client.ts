import {
  CAPPED_INPUT_CAPABILITY_IDS,
  createCappedInputUnavailableActions,
  type FinalizedPairedSharesUnwindV1,
  type FinalizedSignedOrderV1,
  type LimitOrderReconciliationV1,
  type PreparedMarketDeploymentV1,
  type SafeExecutionWrapperV1,
} from "@corkprotocol/operations";
import {
  MARKET_REGISTRY_SOURCE_COMMIT,
  type RawObservation,
} from "@corkprotocol/operations-node";
import {
  RELEASE_CANDIDATE_ADAPTER_STATUS,
  STABLE_MCP_PROTOCOL_ERA,
  STABLE_MCP_SDK_VERSION,
  type RouterCallResult,
  type SubmissionServiceResultV1,
} from "@corkprotocol/gateway";

export interface HostedTransport {
  call(input: {
    readonly name: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
  }): Promise<RouterCallResult>;
}

export interface RawObservationReader {
  read<T>(
    request: Readonly<Record<string, unknown>>,
  ): Promise<RawObservation<T>>;
}

export interface CallerOwnedSigner {
  signDigest(input: {
    readonly digest: string;
    readonly purpose: "permit2" | "limit-order";
  }): Promise<{ readonly signature: string }>;
}

export interface CallerOwnedSafeConfirmation {
  confirmSafeTransaction(input: {
    readonly safeTxHash: string;
  }): Promise<{ readonly confirmationArtifact: unknown }>;
}

export interface CallerOwnedBroadcaster {
  broadcast(input: {
    readonly chainId: string;
    readonly to: string;
    readonly value: string;
    readonly data: string;
  }): Promise<{ readonly transactionHash: string }>;
}

export interface CallerOwnedReceiptStore {
  persist(input: {
    readonly operationId: string;
    readonly receipt: unknown;
  }): Promise<void>;
}

export interface CallerOwnedRetryScheduler {
  schedule(input: {
    readonly operationId: string;
    readonly retryAfter: number;
    readonly reason: string;
  }): Promise<void>;
}

export interface CallerOwnedPorts {
  readonly signer: CallerOwnedSigner;
  readonly safeConfirmation: CallerOwnedSafeConfirmation;
  readonly broadcaster: CallerOwnedBroadcaster;
  readonly receiptStore: CallerOwnedReceiptStore;
  readonly retryScheduler: CallerOwnedRetryScheduler;
}

export type CallerOwnedArtifact =
  | FinalizedPairedSharesUnwindV1
  | FinalizedSignedOrderV1
  | SafeExecutionWrapperV1
  | PreparedMarketDeploymentV1
  | LimitOrderReconciliationV1;

export interface CallerHandoff {
  readonly artifact: CallerOwnedArtifact;
  readonly ports: CallerOwnedPorts;
  readonly serviceWillNot: readonly [
    "hold-keys",
    "sign",
    "confirm-safe-transaction",
    "broadcast",
    "persist-receipt",
    "schedule-retry",
  ];
}

export type SubmissionInterpretation =
  | {
      readonly state: "accepted-not-filled";
      readonly next: "reconcile-service-and-chain";
    }
  | {
      readonly state: "rejected";
      readonly next: "do-not-broadcast-or-claim-fill";
    }
  | {
      readonly state: "caller-retry-decision-required";
      readonly retryAfter?: number;
    }
  | {
      readonly state: "ambiguous";
      readonly next: "reconcile-before-any-retry";
    }
  | {
      readonly state: "submission-error";
      readonly retryable: boolean;
      readonly retryAfter?: number;
    };

export class CorkNonCustodialClient {
  readonly #transport: HostedTransport;
  readonly #rawObservations: RawObservationReader;
  readonly #callerOwned: CallerOwnedPorts;

  public constructor(input: {
    readonly transport: HostedTransport;
    readonly rawObservations: RawObservationReader;
    readonly callerOwned: CallerOwnedPorts;
  }) {
    this.#transport = input.transport;
    this.#rawObservations = input.rawObservations;
    this.#callerOwned = input.callerOwned;
  }

  public capabilities(signal?: AbortSignal): Promise<RouterCallResult> {
    return this.#transport.call({
      name: "cork.capabilities.v1",
      arguments: {},
      ...(signal === undefined ? {} : { signal }),
    });
  }

  public readRawObservation<T>(
    request: Readonly<Record<string, unknown>>,
  ): Promise<RawObservation<T>> {
    return this.#rawObservations.read<T>(request);
  }

  public handOff(artifact: CallerOwnedArtifact): CallerHandoff {
    return {
      artifact,
      ports: this.#callerOwned,
      serviceWillNot: [
        "hold-keys",
        "sign",
        "confirm-safe-transaction",
        "broadcast",
        "persist-receipt",
        "schedule-retry",
      ],
    };
  }
}

export function interpretSubmission(
  result: SubmissionServiceResultV1,
): SubmissionInterpretation {
  if (result.status === "accepted") {
    return {
      state: result.acceptanceStatus,
      next: "reconcile-service-and-chain",
    };
  }
  if (result.status === "rejected") {
    return {
      state: "rejected",
      next: "do-not-broadcast-or-claim-fill",
    };
  }
  if (result.status === "retry-authorized") {
    return {
      state: "caller-retry-decision-required",
      retryAfter: result.retryAfter,
    };
  }
  if (result.status === "ambiguous") {
    return {
      state: "ambiguous",
      next: "reconcile-before-any-retry",
    };
  }
  return {
    state: "submission-error",
    retryable: result.retryable,
    ...(result.retryAfter === undefined
      ? {}
      : { retryAfter: result.retryAfter }),
  };
}

export const integrationPins = {
  stableProtocolEra: STABLE_MCP_PROTOCOL_ERA,
  stableSdkVersion: STABLE_MCP_SDK_VERSION,
  releaseCandidate: RELEASE_CANDIDATE_ADAPTER_STATUS,
  marketRegistrySourceCommit: MARKET_REGISTRY_SOURCE_COMMIT,
  cappedInputCapabilityIds: CAPPED_INPUT_CAPABILITY_IDS,
  cappedInputStatus: createCappedInputUnavailableActions(),
} as const;
