import {
  UpstreamRedirectResponseUnavailableError,
  buildRequestIdentity,
  failureObservation,
  pathWithQuery,
  readDecodedPayload,
  successObservation,
  type RawObservation,
  type RequestIdentity,
  type SourceIdentity,
  type UpstreamPayloadBase,
} from "./evidence.js";

export const MARKET_REGISTRY_SOURCE_COMMIT =
  "d2f0352bd2eaca64f65b2cb401dcf9d343e0190b" as const;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ORACLE_REASONS = new Set([
  "missing-conversion-feed",
  "unsupported-denomination",
  "entry-not-found",
  "zero-address",
]);

export interface MarketRegistryOriginTransport {
  readonly origin: string;
  readonly administrationIdentity: string;
  readonly sourceSchemaDigest: `sha256:${string}`;
  fetch(
    input: string,
    init: {
      readonly method: "GET";
      readonly redirect: "manual";
    },
  ): Promise<Response>;
}

export interface MarketRegistryProjectionFailure {
  readonly ok: false;
  readonly failure: {
    readonly code: "UPSTREAM_PROJECTION_FAILED";
    readonly message: string;
  };
}

export interface UntrustedMetadata<T> {
  readonly classification: "untrusted-source-metadata";
  readonly value: T;
}

export interface UntrustedClaim<T> {
  readonly classification: "untrusted-source-claim";
  readonly value: T;
}

export interface RegistryAssetClaim {
  readonly address: string;
  readonly chainId: number;
  readonly symbol: UntrustedClaim<string>;
  readonly decimals: UntrustedClaim<number>;
  readonly sources: UntrustedClaim<
    readonly {
      readonly address: string;
      readonly quoteUnit: string;
    }[]
  >;
}

export type MarketRegistryProjection =
  | {
      readonly ok: true;
      readonly kind: "asset-list";
      readonly value: {
        readonly assets: readonly RegistryAssetClaim[];
        readonly total: UntrustedMetadata<number | undefined>;
        readonly limit: UntrustedMetadata<number | undefined>;
        readonly offset: UntrustedMetadata<number | undefined>;
        readonly reads: UntrustedMetadata<unknown>;
      };
    }
  | {
      readonly ok: true;
      readonly kind: "asset";
      readonly value: {
        readonly asset: RegistryAssetClaim;
        readonly reads: UntrustedMetadata<unknown>;
      };
    }
  | {
      readonly ok: true;
      readonly kind: "oracle";
      readonly value: {
        readonly chainId: number;
        readonly ca: string;
        readonly ref: string;
        readonly wrapperClaim: UntrustedClaim<string | null>;
        readonly deployedClaim: UntrustedClaim<boolean>;
        readonly deployableClaim: UntrustedClaim<boolean>;
        readonly reasonClaim: UntrustedClaim<string | null>;
        readonly reads: UntrustedMetadata<unknown>;
      };
    }
  | MarketRegistryProjectionFailure;

export interface MarketRegistryPayload extends UpstreamPayloadBase {
  readonly projection: MarketRegistryProjection;
}

function validateOrigin(origin: string): string {
  const parsed = new URL(origin);
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError(
      "market registry origin must be an HTTP(S) origin without credentials or a path",
    );
  }
  return parsed.origin;
}

function assertChainId(chainId: number): void {
  if (!Number.isSafeInteger(chainId) || chainId < 1 || chainId > 0xffff_ffff) {
    throw new TypeError("chainId must be a positive unsigned 32-bit integer");
  }
}

function assertAddress(address: string, name: string): void {
  if (!ADDRESS_PATTERN.test(address)) {
    throw new TypeError(`${name} must be a 20-byte hexadecimal address`);
  }
}

function projectionFailure(message: string): MarketRegistryProjectionFailure {
  return {
    ok: false,
    failure: {
      code: "UPSTREAM_PROJECTION_FAILED",
      message,
    },
  };
}

function decodeJson(
  bytes: Uint8Array,
): unknown | MarketRegistryProjectionFailure {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return projectionFailure("decoded payload is not valid UTF-8");
  }
  try {
    return JSON.parse(text);
  } catch {
    return projectionFailure("decoded payload is not valid JSON");
  }
}

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function assetClaim(value: unknown): RegistryAssetClaim | undefined {
  const record = objectRecord(value);
  if (
    record === undefined ||
    typeof record["address"] !== "string" ||
    !ADDRESS_PATTERN.test(record["address"]) ||
    typeof record["chain_id"] !== "number" ||
    !Number.isSafeInteger(record["chain_id"]) ||
    typeof record["symbol"] !== "string" ||
    typeof record["decimals"] !== "number" ||
    !Number.isInteger(record["decimals"]) ||
    !Array.isArray(record["sources"])
  ) {
    return undefined;
  }
  const sources: { address: string; quoteUnit: string }[] = [];
  for (const candidate of record["sources"]) {
    const source = objectRecord(candidate);
    if (
      source === undefined ||
      typeof source["address"] !== "string" ||
      !ADDRESS_PATTERN.test(source["address"]) ||
      typeof source["quote_unit"] !== "string"
    ) {
      return undefined;
    }
    sources.push({
      address: source["address"],
      quoteUnit: source["quote_unit"],
    });
  }
  return {
    address: record["address"],
    chainId: record["chain_id"],
    symbol: {
      classification: "untrusted-source-claim",
      value: record["symbol"],
    },
    decimals: {
      classification: "untrusted-source-claim",
      value: record["decimals"],
    },
    sources: {
      classification: "untrusted-source-claim",
      value: sources,
    },
  };
}

function projectAssetList(bytes: Uint8Array): MarketRegistryProjection {
  const decoded = decodeJson(bytes);
  if (typeof decoded === "object" && decoded !== null && "ok" in decoded) {
    return decoded as MarketRegistryProjectionFailure;
  }
  const record = objectRecord(decoded);
  if (record === undefined || !Array.isArray(record["data"])) {
    return projectionFailure(
      "asset-list response does not contain a data array",
    );
  }
  const assets: RegistryAssetClaim[] = [];
  for (const candidate of record["data"]) {
    const asset = assetClaim(candidate);
    if (asset === undefined) {
      return projectionFailure(
        "asset-list response contains an invalid asset row",
      );
    }
    assets.push(asset);
  }
  const meta = objectRecord(record["meta"]);
  return {
    ok: true,
    kind: "asset-list",
    value: {
      assets,
      total: {
        classification: "untrusted-source-metadata",
        value:
          typeof record["total"] === "number" ? record["total"] : undefined,
      },
      limit: {
        classification: "untrusted-source-metadata",
        value:
          typeof record["limit"] === "number" ? record["limit"] : undefined,
      },
      offset: {
        classification: "untrusted-source-metadata",
        value:
          typeof record["offset"] === "number" ? record["offset"] : undefined,
      },
      reads: {
        classification: "untrusted-source-metadata",
        value: meta?.["reads"],
      },
    },
  };
}

function projectAsset(
  bytes: Uint8Array,
  chainId: number,
  address: string,
): MarketRegistryProjection {
  const decoded = decodeJson(bytes);
  if (typeof decoded === "object" && decoded !== null && "ok" in decoded) {
    return decoded as MarketRegistryProjectionFailure;
  }
  const record = objectRecord(decoded);
  const asset = assetClaim(decoded);
  if (
    record === undefined ||
    asset === undefined ||
    asset.chainId !== chainId ||
    asset.address !== address
  ) {
    return projectionFailure(
      "asset response changed the requested chain/address key",
    );
  }
  const meta = objectRecord(record["meta"]);
  return {
    ok: true,
    kind: "asset",
    value: {
      asset,
      reads: {
        classification: "untrusted-source-metadata",
        value: meta?.["reads"],
      },
    },
  };
}

function projectOracle(
  bytes: Uint8Array,
  chainId: number,
  ca: string,
  ref: string,
): MarketRegistryProjection {
  const decoded = decodeJson(bytes);
  if (typeof decoded === "object" && decoded !== null && "ok" in decoded) {
    return decoded as MarketRegistryProjectionFailure;
  }
  const record = objectRecord(decoded);
  if (
    record === undefined ||
    record["chain_id"] !== chainId ||
    record["ca"] !== ca ||
    record["ref"] !== ref ||
    (typeof record["wrapper"] !== "string" && record["wrapper"] !== null) ||
    (typeof record["wrapper"] === "string" &&
      !ADDRESS_PATTERN.test(record["wrapper"])) ||
    typeof record["deployed"] !== "boolean" ||
    typeof record["deployable"] !== "boolean" ||
    (record["reason"] !== null &&
      (typeof record["reason"] !== "string" ||
        !ORACLE_REASONS.has(record["reason"])))
  ) {
    return projectionFailure(
      "oracle response changed the ordered pair or contains invalid source claims",
    );
  }
  const meta = objectRecord(record["meta"]);
  return {
    ok: true,
    kind: "oracle",
    value: {
      chainId,
      ca,
      ref,
      wrapperClaim: {
        classification: "untrusted-source-claim",
        value: record["wrapper"],
      },
      deployedClaim: {
        classification: "untrusted-source-claim",
        value: record["deployed"],
      },
      deployableClaim: {
        classification: "untrusted-source-claim",
        value: record["deployable"],
      },
      reasonClaim: {
        classification: "untrusted-source-claim",
        value: record["reason"],
      },
      reads: {
        classification: "untrusted-source-metadata",
        value: meta?.["reads"],
      },
    },
  };
}

export class MarketRegistryClient {
  readonly #transport: MarketRegistryOriginTransport;
  readonly #origin: string;
  readonly #source: SourceIdentity;
  readonly #now: () => string;

  public constructor(input: {
    readonly transport: MarketRegistryOriginTransport;
    readonly now?: () => string;
  }) {
    this.#origin = validateOrigin(input.transport.origin);
    if (input.transport.administrationIdentity.length === 0) {
      throw new TypeError(
        "market registry administration identity is required",
      );
    }
    this.#transport = input.transport;
    this.#source = {
      service: "market-registry-api",
      administrationIdentity: input.transport.administrationIdentity,
      origin: this.#origin,
      sourceCommit: MARKET_REGISTRY_SOURCE_COMMIT,
      sourceSchemaDigest: input.transport.sourceSchemaDigest,
    };
    if (input.now === undefined) {
      throw new TypeError(
        "market registry canonical observation clock is required",
      );
    }
    this.#now = input.now;
  }

  public async listAssets(): Promise<RawObservation<MarketRegistryPayload>> {
    const request = buildRequestIdentity("GET", "/v1/assets", []);
    return this.#get(request, (bytes) => projectAssetList(bytes));
  }

  public async getAsset(input: {
    readonly chainId: number;
    readonly address: string;
  }): Promise<RawObservation<MarketRegistryPayload>> {
    let request = buildRequestIdentity(
      "GET",
      "/v1/assets/{chain_id}/{address}",
      [],
    );
    try {
      assertChainId(input.chainId);
      assertAddress(input.address, "address");
      request = buildRequestIdentity(
        "GET",
        `/v1/assets/${input.chainId}/${input.address}`,
        [],
      );
    } catch (error) {
      return failureObservation({
        source: this.#source,
        request,
        observedAt: this.#now(),
        failure: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "invalid asset request",
        },
      });
    }
    return this.#get(request, (bytes) =>
      projectAsset(bytes, input.chainId, input.address),
    );
  }

  public async getOracle(input: {
    readonly chainId: number;
    readonly ca: string;
    readonly ref: string;
  }): Promise<RawObservation<MarketRegistryPayload>> {
    let request = buildRequestIdentity(
      "GET",
      "/v1/oracles/{chain_id}/{ca}/{ref}",
      [],
    );
    try {
      assertChainId(input.chainId);
      assertAddress(input.ca, "ca");
      assertAddress(input.ref, "ref");
      request = buildRequestIdentity(
        "GET",
        `/v1/oracles/${input.chainId}/${input.ca}/${input.ref}`,
        [],
      );
    } catch (error) {
      return failureObservation({
        source: this.#source,
        request,
        observedAt: this.#now(),
        failure: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "invalid oracle request",
        },
      });
    }
    return this.#get(request, (bytes) =>
      projectOracle(bytes, input.chainId, input.ca, input.ref),
    );
  }

  async #get(
    request: RequestIdentity,
    project: (bytes: Uint8Array) => MarketRegistryProjection,
  ): Promise<RawObservation<MarketRegistryPayload>> {
    const observedAt = this.#now();
    let response: Response;
    try {
      response = await this.#transport.fetch(
        new URL(pathWithQuery(request), this.#origin).toString(),
        { method: "GET", redirect: "manual" },
      );
    } catch (error) {
      return failureObservation({
        source: this.#source,
        request,
        observedAt,
        failure:
          error instanceof UpstreamRedirectResponseUnavailableError
            ? {
                code: "UPSTREAM_REDIRECT_RESPONSE_UNAVAILABLE",
                message: error.message,
              }
            : {
                code: "UPSTREAM_TRANSPORT_FAILED",
                message: "market registry transport failed",
              },
      });
    }

    const decoded = await readDecodedPayload({
      response,
      source: this.#source,
      request,
      observedAt,
    });
    if (!decoded.ok) {
      return failureObservation({
        source: this.#source,
        request,
        observedAt,
        failure: decoded.failure,
      });
    }

    return successObservation({
      source: this.#source,
      request,
      observedAt,
      value: {
        ...decoded.value.payload,
        projection: project(decoded.value.bytes),
      },
    });
  }
}
