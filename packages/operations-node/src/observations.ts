import {
  buildRequestIdentity,
  failureObservation,
  successObservation,
  type ExactBlockReference,
  type RawObservation,
  type SourceIdentity,
} from "./evidence.js";
import type { Sha256Digest } from "@corkprotocol/operations";
import type { JsonValue } from "@corkprotocol/operations";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type ProviderReadRequest =
  | {
      readonly kind: "contract-call";
      readonly chainId: number;
      readonly blockNumber: number;
      readonly target: string;
      readonly data: string;
    }
  | {
      readonly kind: "runtime-code";
      readonly chainId: number;
      readonly blockNumber: number;
      readonly address: string;
    }
  | {
      readonly kind: "storage-slot";
      readonly chainId: number;
      readonly blockNumber: number;
      readonly address: string;
      readonly slot: string;
    }
  | {
      readonly kind: "block-header";
      readonly chainId: number;
      readonly blockNumber: number;
    };

export interface PinnedProviderResult {
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly parentHash: string;
  readonly rawResult: JsonValue;
}

export interface PinnedProviderAdapter {
  readAtBlock(request: ProviderReadRequest): Promise<PinnedProviderResult>;
}

export type ProviderReadValue = JsonValue;

export interface PinnedProviderReaderConfig {
  readonly providerIdentity: string;
  readonly administrationIdentity: string;
  readonly chainIdentity: string;
  readonly sourceCommit: string;
  readonly sourceSchemaDigest: Sha256Digest;
  readonly adapter: PinnedProviderAdapter;
  readonly now: () => string;
}

function assertSafeInteger(value: number, name: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(
      `${name} must be a safe integer greater than or equal to ${minimum}`,
    );
  }
}

function validateRequest(request: ProviderReadRequest): void {
  assertSafeInteger(request.chainId, "chainId", 1);
  assertSafeInteger(request.blockNumber, "blockNumber", 0);
  if (request.kind === "contract-call") {
    if (
      !ADDRESS_PATTERN.test(request.target) ||
      !HEX_PATTERN.test(request.data)
    ) {
      throw new TypeError("contract-call target or data is invalid");
    }
  } else if (request.kind === "runtime-code") {
    if (!ADDRESS_PATTERN.test(request.address)) {
      throw new TypeError("runtime-code address is invalid");
    }
  } else if (request.kind === "storage-slot") {
    if (
      !ADDRESS_PATTERN.test(request.address) ||
      !HASH_PATTERN.test(request.slot)
    ) {
      throw new TypeError("storage-slot address or slot is invalid");
    }
  }
}

function requestQuery(
  request: ProviderReadRequest,
): readonly (readonly [string, string])[] {
  const common = [
    ["chainId", String(request.chainId)],
    ["blockNumber", String(request.blockNumber)],
  ] as const;
  switch (request.kind) {
    case "contract-call":
      return [...common, ["target", request.target], ["data", request.data]];
    case "runtime-code":
      return [...common, ["address", request.address]];
    case "storage-slot":
      return [...common, ["address", request.address], ["slot", request.slot]];
    case "block-header":
      return common;
  }
}

function exactBlock(
  result: PinnedProviderResult,
): ExactBlockReference | undefined {
  if (
    !Number.isSafeInteger(result.blockNumber) ||
    result.blockNumber < 0 ||
    !HASH_PATTERN.test(result.blockHash) ||
    !HASH_PATTERN.test(result.parentHash)
  ) {
    return undefined;
  }
  return {
    kind: "independently-pinned",
    blockNumber: String(result.blockNumber),
    blockHash: result.blockHash.toLowerCase(),
    parentBlockHash: result.parentHash.toLowerCase(),
  };
}

export class PinnedProviderReader {
  readonly #source: SourceIdentity;
  readonly #adapter: PinnedProviderAdapter;
  readonly #now: () => string;

  public constructor(config: PinnedProviderReaderConfig) {
    if (
      config.providerIdentity.length === 0 ||
      config.administrationIdentity.length === 0 ||
      config.chainIdentity.length === 0 ||
      config.sourceCommit.length === 0
    ) {
      throw new TypeError(
        "provider identity, administration, chain, and pin are required",
      );
    }
    this.#source = {
      service: config.providerIdentity,
      administrationIdentity: config.administrationIdentity,
      origin: config.chainIdentity,
      sourceCommit: config.sourceCommit,
      sourceSchemaDigest: config.sourceSchemaDigest,
    };
    this.#adapter = config.adapter;
    this.#now = config.now;
  }

  public async read(
    request: ProviderReadRequest,
  ): Promise<RawObservation<ProviderReadValue>> {
    const observedAt = this.#now();
    let requestIdentity = buildRequestIdentity(
      "PROVIDER_READ",
      `/provider/${request.kind}`,
      [],
    );
    try {
      validateRequest(request);
      requestIdentity = buildRequestIdentity(
        "PROVIDER_READ",
        `/provider/${request.kind}`,
        requestQuery(request),
      );
    } catch (error) {
      return failureObservation({
        source: this.#source,
        request: requestIdentity,
        observedAt,
        failure: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "invalid provider request",
          retryable: false,
        },
      });
    }

    let result: PinnedProviderResult;
    try {
      result = await this.#adapter.readAtBlock(request);
    } catch {
      return failureObservation({
        source: this.#source,
        request: requestIdentity,
        observedAt,
        failure: {
          code: "PROVIDER_READ_FAILED",
          message: "pinned provider read failed",
          retryable: false,
        },
      });
    }

    const block = exactBlock(result);
    if (block === undefined || result.blockNumber !== request.blockNumber) {
      return failureObservation({
        source: this.#source,
        request: requestIdentity,
        observedAt,
        failure: {
          code: "PROVIDER_OBSERVATION_INVALID",
          message:
            "provider result did not carry the requested exact block number, hash, and parent hash",
          retryable: false,
        },
      });
    }

    return successObservation({
      source: this.#source,
      request: requestIdentity,
      observedAt,
      block,
      value: result.rawResult,
    });
  }
}
