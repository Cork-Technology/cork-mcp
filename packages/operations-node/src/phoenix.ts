import {
  UpstreamRedirectResponseUnavailableError,
  buildRequestIdentity,
  canonicalJson,
  failureObservation,
  pathWithQuery,
  readDecodedPayload,
  successObservation,
  type QueryEntry,
  type RawObservation,
  type SourceIdentity,
  type StructuredFailure,
  type UpstreamPayloadBase,
} from "./evidence.js";

export const PHOENIX_OPENAPI_SCHEMA_DIGEST =
  "sha256:081be9a32c27f7e46e6026f830c764a037065f6c3d64d7de50ac9ecc04b7c7c8" as const;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const POOL_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_PATTERN = /^[0-9]+$/;
const ORDER_HASH_PATTERN = POOL_ID_PATTERN;
const MAX_PAGE_BOUND = 100;
const MAX_ITEM_BOUND = 100_000;

export type PhoenixChainName = "mainnet" | "virtual" | "sepolia";
export type PhoenixPoolWhitelistStatus = "enabled" | "disabled";
export type PhoenixFlowAction =
  | "exercise"
  | "repurchase"
  | "redeem"
  | "mint"
  | "unwind";
export type LimitOrderSide = "BUY" | "SELL";
export type LimitOrderStatus =
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "EXPIRED";

export interface PhoenixPaginationBounds {
  readonly maxPages: number;
  readonly maxItems: number;
}

interface PhoenixTimeAndBlockQuery {
  readonly fromBlock?: string;
  readonly toBlock?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
}

interface PhoenixCursorQuery {
  readonly limit?: number;
  readonly nextCursor?: string;
}

export interface PoolsQuery
  extends PhoenixTimeAndBlockQuery,
    PhoenixCursorQuery {
  readonly chainName?: PhoenixChainName;
  readonly chainId?: number;
  readonly poolManagerAddress?: string;
  readonly collateralAddress?: string;
  readonly referenceAddress?: string;
  readonly principalAddress?: string;
  readonly swapAddress?: string;
  readonly rateOracleAddress?: string;
  readonly poolId?: string;
  readonly poolWhitelistStatus?: PhoenixPoolWhitelistStatus;
  readonly expiryBefore?: string;
  readonly expiryAfter?: string;
}

export interface PoolWhitelistedAddressesQuery
  extends PhoenixTimeAndBlockQuery,
    PhoenixCursorQuery {
  readonly chainName?: PhoenixChainName;
  readonly chainId?: number;
  readonly poolManagerAddress?: string;
  readonly whitelistManagerAddress?: string;
  readonly poolId?: string;
  readonly walletAddress?: string;
  readonly collateralAddress?: string;
  readonly referenceAddress?: string;
  readonly poolWhitelistStatus?: PhoenixPoolWhitelistStatus;
  readonly expiryBefore?: string;
  readonly expiryAfter?: string;
}

export interface FlowsQuery
  extends PhoenixTimeAndBlockQuery,
    PhoenixCursorQuery {
  readonly chainName?: PhoenixChainName;
  readonly chainId?: number;
  readonly walletAddress?: string;
  readonly poolId?: string;
  readonly actionType?: PhoenixFlowAction;
}

interface LimitOrderCursorQuery extends PhoenixCursorQuery {
  readonly chainId?: number;
  readonly poolId?: string;
  readonly offset?: number;
}

export interface LimitOrderMarketsQuery extends LimitOrderCursorQuery {
  readonly makerAsset?: string;
  readonly takerAsset?: string;
  readonly onlyActive?: boolean;
}

export interface LimitOrderOrderbookQuery extends LimitOrderCursorQuery {
  readonly maker?: string;
  readonly makerAsset?: string;
  readonly takerAsset?: string;
  readonly side?: LimitOrderSide;
  readonly status?: readonly LimitOrderStatus[];
}

export interface LimitOrderFillsQuery
  extends LimitOrderCursorQuery,
    PhoenixTimeAndBlockQuery {
  readonly orderHash?: string;
  readonly maker?: string;
  readonly taker?: string;
}

export interface PhoenixOriginTransport {
  readonly origin: string;
  readonly administrationIdentity: string;
  readonly sourceCommit: string;
  fetch(
    input: string,
    init: {
      readonly method: "GET";
      readonly redirect: "manual";
    },
  ): Promise<Response>;
}

export interface PhoenixProjectionFailure {
  readonly ok: false;
  readonly failure: {
    readonly code: "UPSTREAM_PROJECTION_FAILED";
    readonly message: string;
  };
}

export interface PageProjection {
  readonly ok: true;
  readonly kind: "page";
  readonly value: {
    readonly items: readonly unknown[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}

export interface JsonProjection {
  readonly ok: true;
  readonly kind: "json";
  readonly value: unknown;
}

export type PhoenixProjection =
  | PageProjection
  | JsonProjection
  | PhoenixProjectionFailure;

export interface PhoenixPayload extends UpstreamPayloadBase {
  readonly projection: PhoenixProjection;
}

export type PaginationStopReason =
  | "complete"
  | "page-bound"
  | "item-bound"
  | "cursor-missing"
  | "cursor-repeated"
  | "projection-failure"
  | "source-response";

export interface PhoenixReadValue {
  readonly operation:
    | "pools"
    | "pool-whitelisted-addresses"
    | "flows"
    | "limit-order-markets"
    | "limit-order-orderbook"
    | "limit-order-fills";
  readonly pages: readonly PhoenixPayload[];
  readonly items: readonly unknown[];
  readonly pagination: {
    readonly complete: boolean;
    readonly pagesRead: number;
    readonly itemsRead: number;
    readonly finalCursor: string | null;
    readonly maxPages: number;
    readonly maxItems: number;
    readonly stableOrdering: "first-source-occurrence";
    readonly deduplication: "canonical-item-bytes";
    readonly stopReason: PaginationStopReason;
  };
}

type OperationName = PhoenixReadValue["operation"];

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
      "Phoenix transport origin must be an HTTP(S) origin without credentials or a path",
    );
  }
  return parsed.origin;
}

function assertSafeInteger(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `${name} must be a safe integer from ${minimum} through ${maximum}`,
    );
  }
}

function assertAddress(value: string, name: string): void {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a 20-byte hexadecimal address`);
  }
}

function assertPoolId(value: string, name: string): void {
  if (!POOL_ID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a 32-byte hexadecimal value`);
  }
}

function assertDecimal(value: string, name: string): void {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`${name} must contain only decimal digits`);
  }
}

function appendString(
  entries: QueryEntry[],
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    if (value.length === 0) {
      throw new TypeError(`${name} must not be empty`);
    }
    entries.push([name, value]);
  }
}

function appendAddress(
  entries: QueryEntry[],
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    assertAddress(value, name);
    entries.push([name, value]);
  }
}

function appendPoolId(
  entries: QueryEntry[],
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    assertPoolId(value, name);
    entries.push([name, value]);
  }
}

function appendChainId(entries: QueryEntry[], value: number | undefined): void {
  if (value !== undefined) {
    assertSafeInteger(value, "chainId", 1, Number.MAX_SAFE_INTEGER);
    entries.push(["chainId", String(value)]);
  }
}

function appendLimit(entries: QueryEntry[], value: number | undefined): void {
  if (value !== undefined) {
    assertSafeInteger(value, "limit", 1, 2000);
    entries.push(["limit", String(value)]);
  }
}

function appendOffset(entries: QueryEntry[], value: number | undefined): void {
  if (value !== undefined) {
    assertSafeInteger(value, "offset", 0, 10_000);
    entries.push(["offset", String(value)]);
  }
}

function appendTimeAndBlock(
  entries: QueryEntry[],
  query: PhoenixTimeAndBlockQuery,
): void {
  if (query.fromBlock !== undefined) {
    assertDecimal(query.fromBlock, "fromBlock");
    entries.push(["fromBlock", query.fromBlock]);
  }
  if (query.toBlock !== undefined) {
    assertDecimal(query.toBlock, "toBlock");
    entries.push(["toBlock", query.toBlock]);
  }
  appendString(entries, "fromTimestamp", query.fromTimestamp);
  appendString(entries, "toTimestamp", query.toTimestamp);
}

function appendCursor(entries: QueryEntry[], query: PhoenixCursorQuery): void {
  appendLimit(entries, query.limit);
  appendString(entries, "nextCursor", query.nextCursor);
}

function serializePools(query: PoolsQuery): readonly QueryEntry[] {
  const entries: QueryEntry[] = [];
  appendString(entries, "chainName", query.chainName);
  appendChainId(entries, query.chainId);
  appendAddress(entries, "poolManagerAddress", query.poolManagerAddress);
  appendAddress(entries, "collateralAddress", query.collateralAddress);
  appendAddress(entries, "referenceAddress", query.referenceAddress);
  appendAddress(entries, "principalAddress", query.principalAddress);
  appendAddress(entries, "swapAddress", query.swapAddress);
  appendAddress(entries, "rateOracleAddress", query.rateOracleAddress);
  appendPoolId(entries, "poolId", query.poolId);
  appendString(entries, "poolWhitelistStatus", query.poolWhitelistStatus);
  appendString(entries, "expiryBefore", query.expiryBefore);
  appendString(entries, "expiryAfter", query.expiryAfter);
  appendTimeAndBlock(entries, query);
  appendCursor(entries, query);
  return entries;
}

function serializePoolWhitelistedAddresses(
  query: PoolWhitelistedAddressesQuery,
): readonly QueryEntry[] {
  const entries: QueryEntry[] = [];
  appendString(entries, "chainName", query.chainName);
  appendChainId(entries, query.chainId);
  appendAddress(entries, "poolManagerAddress", query.poolManagerAddress);
  appendAddress(
    entries,
    "whitelistManagerAddress",
    query.whitelistManagerAddress,
  );
  appendPoolId(entries, "poolId", query.poolId);
  appendAddress(entries, "walletAddress", query.walletAddress);
  appendAddress(entries, "collateralAddress", query.collateralAddress);
  appendAddress(entries, "referenceAddress", query.referenceAddress);
  appendString(entries, "poolWhitelistStatus", query.poolWhitelistStatus);
  appendString(entries, "expiryBefore", query.expiryBefore);
  appendString(entries, "expiryAfter", query.expiryAfter);
  appendTimeAndBlock(entries, query);
  appendCursor(entries, query);
  return entries;
}

function serializeFlows(query: FlowsQuery): readonly QueryEntry[] {
  if (query.walletAddress === undefined && query.poolId === undefined) {
    throw new TypeError("flows requires walletAddress or poolId");
  }
  const entries: QueryEntry[] = [];
  appendString(entries, "chainName", query.chainName);
  appendChainId(entries, query.chainId);
  appendAddress(entries, "walletAddress", query.walletAddress);
  appendPoolId(entries, "poolId", query.poolId);
  appendTimeAndBlock(entries, query);
  appendString(entries, "actionType", query.actionType);
  appendCursor(entries, query);
  return entries;
}

function serializeLimitOrderMarkets(
  query: LimitOrderMarketsQuery,
): readonly QueryEntry[] {
  const entries: QueryEntry[] = [];
  appendChainId(entries, query.chainId);
  appendPoolId(entries, "poolId", query.poolId);
  appendAddress(entries, "makerAsset", query.makerAsset);
  appendAddress(entries, "takerAsset", query.takerAsset);
  if (query.onlyActive !== undefined) {
    entries.push(["onlyActive", String(query.onlyActive)]);
  }
  appendLimit(entries, query.limit);
  appendOffset(entries, query.offset);
  appendString(entries, "nextCursor", query.nextCursor);
  return entries;
}

function serializeLimitOrderOrderbook(
  query: LimitOrderOrderbookQuery,
): readonly QueryEntry[] {
  const entries: QueryEntry[] = [];
  appendChainId(entries, query.chainId);
  appendPoolId(entries, "poolId", query.poolId);
  appendAddress(entries, "maker", query.maker);
  appendAddress(entries, "makerAsset", query.makerAsset);
  appendAddress(entries, "takerAsset", query.takerAsset);
  appendString(entries, "side", query.side);
  if (query.status !== undefined) {
    if (query.status.length === 0 || query.status.length > 5) {
      throw new TypeError("status must contain from one through five values");
    }
    for (const status of query.status) {
      entries.push(["status", status]);
    }
  }
  appendLimit(entries, query.limit);
  appendOffset(entries, query.offset);
  appendString(entries, "nextCursor", query.nextCursor);
  return entries;
}

function serializeLimitOrderFills(
  query: LimitOrderFillsQuery,
): readonly QueryEntry[] {
  const entries: QueryEntry[] = [];
  appendChainId(entries, query.chainId);
  appendPoolId(entries, "poolId", query.poolId);
  if (query.orderHash !== undefined) {
    if (!ORDER_HASH_PATTERN.test(query.orderHash)) {
      throw new TypeError("orderHash must be a 32-byte hexadecimal value");
    }
    entries.push(["orderHash", query.orderHash]);
  }
  appendAddress(entries, "maker", query.maker);
  appendAddress(entries, "taker", query.taker);
  appendTimeAndBlock(entries, query);
  appendLimit(entries, query.limit);
  appendOffset(entries, query.offset);
  appendString(entries, "nextCursor", query.nextCursor);
  return entries;
}

function validateBounds(bounds: PhoenixPaginationBounds): void {
  assertSafeInteger(bounds.maxPages, "maxPages", 1, MAX_PAGE_BOUND);
  assertSafeInteger(bounds.maxItems, "maxItems", 1, MAX_ITEM_BOUND);
}

function project(bytes: Uint8Array, pageExpected: boolean): PhoenixProjection {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      failure: {
        code: "UPSTREAM_PROJECTION_FAILED",
        message: "decoded payload is not valid UTF-8",
      },
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    return {
      ok: false,
      failure: {
        code: "UPSTREAM_PROJECTION_FAILED",
        message: "decoded payload is not valid JSON",
      },
    };
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, unknown>>;
    if (
      Array.isArray(record["items"]) &&
      (typeof record["nextCursor"] === "string" ||
        record["nextCursor"] === null) &&
      typeof record["hasMore"] === "boolean"
    ) {
      return {
        ok: true,
        kind: "page",
        value: {
          items: record["items"],
          nextCursor: record["nextCursor"],
          hasMore: record["hasMore"],
        },
      };
    }
  }

  if (pageExpected) {
    return {
      ok: false,
      failure: {
        code: "UPSTREAM_PROJECTION_FAILED",
        message: "successful response does not match the paginated projection",
      },
    };
  }
  return { ok: true, kind: "json", value };
}

function queryWithCursor(
  base: readonly QueryEntry[],
  cursor: string | null,
): readonly QueryEntry[] {
  const withoutCursor = base.filter(([name]) => name !== "nextCursor");
  return cursor === null
    ? withoutCursor
    : [...withoutCursor, ["nextCursor", cursor] as const];
}

function partialValue(input: {
  readonly operation: OperationName;
  readonly pages: readonly PhoenixPayload[];
  readonly items: readonly unknown[];
  readonly bounds: PhoenixPaginationBounds;
  readonly finalCursor: string | null;
  readonly stopReason: PaginationStopReason;
}): PhoenixReadValue {
  return {
    operation: input.operation,
    pages: input.pages,
    items: input.items,
    pagination: {
      complete: input.stopReason === "complete",
      pagesRead: input.pages.length,
      itemsRead: input.items.length,
      finalCursor: input.finalCursor,
      maxPages: input.bounds.maxPages,
      maxItems: input.bounds.maxItems,
      stableOrdering: "first-source-occurrence",
      deduplication: "canonical-item-bytes",
      stopReason: input.stopReason,
    },
  };
}

export class PhoenixClient {
  readonly #transport: PhoenixOriginTransport;
  readonly #origin: string;
  readonly #source: SourceIdentity;
  readonly #now: () => string;

  public constructor(input: {
    readonly transport: PhoenixOriginTransport;
    readonly now?: () => string;
  }) {
    this.#origin = validateOrigin(input.transport.origin);
    if (input.transport.administrationIdentity.length === 0) {
      throw new TypeError("Phoenix administration identity is required");
    }
    this.#transport = input.transport;
    this.#source = {
      service: "phoenix-api",
      administrationIdentity: input.transport.administrationIdentity,
      origin: this.#origin,
      sourceCommit: input.transport.sourceCommit,
      sourceSchemaDigest: PHOENIX_OPENAPI_SCHEMA_DIGEST,
    };
    if (input.transport.sourceCommit.length === 0 || input.now === undefined) {
      throw new TypeError(
        "Phoenix source commit and canonical observation clock are required",
      );
    }
    this.#now = input.now;
  }

  public async listPools(
    query: PoolsQuery,
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    return this.#execute(
      "pools",
      "/v1/pools/",
      () => serializePools(query),
      bounds,
    );
  }

  public async listPoolWhitelistedAddresses(
    query: PoolWhitelistedAddressesQuery,
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    return this.#execute(
      "pool-whitelisted-addresses",
      "/v1/pools/whitelisted-addresses",
      () => serializePoolWhitelistedAddresses(query),
      bounds,
    );
  }

  public async listFlows(
    query: FlowsQuery,
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    return this.#execute(
      "flows",
      "/v1/flows/",
      () => serializeFlows(query),
      bounds,
    );
  }

  public async listLimitOrderMarkets(
    query: LimitOrderMarketsQuery,
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    return this.#execute(
      "limit-order-markets",
      "/v1/limit-orders/markets",
      () => serializeLimitOrderMarkets(query),
      bounds,
    );
  }

  public async listLimitOrderOrderbook(
    query: LimitOrderOrderbookQuery,
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    return this.#execute(
      "limit-order-orderbook",
      "/v1/limit-orders/orderbook",
      () => serializeLimitOrderOrderbook(query),
      bounds,
    );
  }

  public async listLimitOrderFills(
    query: LimitOrderFillsQuery,
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    return this.#execute(
      "limit-order-fills",
      "/v1/limit-orders/fills",
      () => serializeLimitOrderFills(query),
      bounds,
    );
  }

  async #execute(
    operation: OperationName,
    path: string,
    serialize: () => readonly QueryEntry[],
    bounds: PhoenixPaginationBounds,
  ): Promise<RawObservation<PhoenixReadValue>> {
    const startedAt = this.#now();
    let baseQuery: readonly QueryEntry[] = [];
    let initialRequest = buildRequestIdentity("GET", path, baseQuery);
    try {
      validateBounds(bounds);
      baseQuery = serialize();
      initialRequest = buildRequestIdentity("GET", path, baseQuery);
    } catch (error) {
      return failureObservation({
        source: this.#source,
        request: initialRequest,
        observedAt: startedAt,
        failure: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "invalid Phoenix request",
        },
      });
    }

    const pages: PhoenixPayload[] = [];
    const items: unknown[] = [];
    const seenItems = new Set<string>();
    const seenCursors = new Set<string>();
    const initialCursor =
      baseQuery.find(([name]) => name === "nextCursor")?.[1] ?? null;
    let cursor = initialCursor;

    for (let pageIndex = 0; pageIndex < bounds.maxPages; pageIndex += 1) {
      if (cursor !== null) {
        if (seenCursors.has(cursor)) {
          const value = partialValue({
            operation,
            pages,
            items,
            bounds,
            finalCursor: cursor,
            stopReason: "cursor-repeated",
          });
          return successObservation({
            source: this.#source,
            request: initialRequest,
            observedAt: startedAt,
            value,
          });
        }
        seenCursors.add(cursor);
      }

      const pageQuery =
        pageIndex === 0 ? baseQuery : queryWithCursor(baseQuery, cursor);
      const request = buildRequestIdentity("GET", path, pageQuery);
      let response: Response;
      try {
        response = await this.#transport.fetch(
          new URL(pathWithQuery(request), this.#origin).toString(),
          { method: "GET", redirect: "manual" },
        );
      } catch (error) {
        const failure: StructuredFailure =
          error instanceof UpstreamRedirectResponseUnavailableError
            ? {
                code: "UPSTREAM_REDIRECT_RESPONSE_UNAVAILABLE",
                message: error.message,
                retryable: false,
              }
            : {
                code: "UPSTREAM_TRANSPORT_FAILED",
                message: "Phoenix transport failed",
                retryable: false,
              };
        return failureObservation({
          source: this.#source,
          request,
          observedAt: this.#now(),
          failure,
        });
      }

      const observedAt = this.#now();
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

      const projection = project(
        decoded.value.bytes,
        response.status >= 200 && response.status < 300,
      );
      const payload: PhoenixPayload = {
        ...decoded.value.payload,
        projection,
      };
      pages.push(payload);

      if (response.status < 200 || response.status >= 300) {
        const value = partialValue({
          operation,
          pages,
          items,
          bounds,
          finalCursor: cursor,
          stopReason: "source-response",
        });
        return successObservation({
          source: this.#source,
          request: initialRequest,
          observedAt: startedAt,
          value,
        });
      }

      if (!projection.ok || projection.kind !== "page") {
        const value = partialValue({
          operation,
          pages,
          items,
          bounds,
          finalCursor: cursor,
          stopReason: "projection-failure",
        });
        return successObservation({
          source: this.#source,
          request: initialRequest,
          observedAt: startedAt,
          value,
        });
      }

      for (const item of projection.value.items) {
        const itemIdentity = canonicalJson(item);
        if (!seenItems.has(itemIdentity)) {
          if (items.length === bounds.maxItems) {
            const value = partialValue({
              operation,
              pages,
              items,
              bounds,
              finalCursor: projection.value.nextCursor,
              stopReason: "item-bound",
            });
            return successObservation({
              source: this.#source,
              request: initialRequest,
              observedAt: startedAt,
              value,
            });
          }
          seenItems.add(itemIdentity);
          items.push(item);
        }
      }

      if (!projection.value.hasMore) {
        const value = partialValue({
          operation,
          pages,
          items,
          bounds,
          finalCursor: projection.value.nextCursor,
          stopReason: "complete",
        });
        return successObservation({
          source: this.#source,
          request: initialRequest,
          observedAt: startedAt,
          value,
        });
      }

      if (projection.value.nextCursor === null) {
        const value = partialValue({
          operation,
          pages,
          items,
          bounds,
          finalCursor: null,
          stopReason: "cursor-missing",
        });
        return successObservation({
          source: this.#source,
          request: initialRequest,
          observedAt: startedAt,
          value,
        });
      }
      cursor = projection.value.nextCursor;
    }

    const value = partialValue({
      operation,
      pages,
      items,
      bounds,
      finalCursor: cursor,
      stopReason: "page-bound",
    });
    return successObservation({
      source: this.#source,
      request: initialRequest,
      observedAt: startedAt,
      value,
    });
  }
}
