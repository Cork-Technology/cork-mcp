import {
  PhoenixClient,
  type LimitOrderFillsQuery,
  type LimitOrderMarketsQuery,
  type LimitOrderOrderbookQuery,
  type PhoenixPaginationBounds,
  type PoolWhitelistedAddressesQuery,
  type PoolsQuery,
  type FlowsQuery,
} from "@corkprotocol/operations-node";
import {
  createFixtureAdmissionController,
  createFixtureHandlers,
  createLocalLiveReadInventory,
  createLocalLiveReadPrincipal,
} from "./dev-fixture.js";
import {
  ToolRouter,
  type HandlerContext,
  type ToolHandler,
  type ToolHandlers,
} from "./router.js";

export const PHOENIX_API_ORIGIN = "https://api-phoenix.cork.tech" as const;
export const PINNED_PHOENIX_SOURCE_COMMIT =
  "40d9b173c4b2262a93f36167355b5311d5f58e6b" as const;

const DEFAULT_BOUNDS: PhoenixPaginationBounds = Object.freeze({
  maxPages: 5,
  maxItems: 10_000,
});

export interface LiveReadFetch {
  (
    input: string,
    init: {
      readonly method: "GET";
      readonly redirect: "manual";
      readonly signal: AbortSignal;
    },
  ): Promise<Response>;
}

export interface LiveReadDependencies {
  readonly fetch: LiveReadFetch;
  readonly now: () => string;
  readonly origin?: string;
}

function splitQuery<T>(input: Readonly<Record<string, unknown>>): {
  readonly query: T;
  readonly bounds: PhoenixPaginationBounds;
} {
  const { maxPages, maxItems, ...query } = input;
  return {
    query: query as T,
    bounds: {
      maxPages:
        typeof maxPages === "number" ? maxPages : DEFAULT_BOUNDS.maxPages,
      maxItems:
        typeof maxItems === "number" ? maxItems : DEFAULT_BOUNDS.maxItems,
    },
  };
}

function client(
  dependencies: LiveReadDependencies,
  context: HandlerContext,
): PhoenixClient {
  return new PhoenixClient({
    transport: {
      origin: dependencies.origin ?? PHOENIX_API_ORIGIN,
      administrationIdentity: "cork-mcp-local-live-read",
      sourceCommit: PINNED_PHOENIX_SOURCE_COMMIT,
      fetch: (input, init) =>
        dependencies.fetch(input, { ...init, signal: context.signal }),
    },
    now: dependencies.now,
  });
}

function phoenixHandler<T>(
  dependencies: LiveReadDependencies,
  read: (
    reader: PhoenixClient,
    query: T,
    bounds: PhoenixPaginationBounds,
  ) => ReturnType<PhoenixClient["listPools"]>,
): ToolHandler {
  return async (input, context) => {
    const separated = splitQuery<T>(input);
    return read(
      client(dependencies, context),
      separated.query,
      separated.bounds,
    );
  };
}

function createLiveReadHandlers(
  dependencies: LiveReadDependencies,
  inventory: ReturnType<typeof createLocalLiveReadInventory>,
): ToolHandlers {
  const fixtureHandlers = createFixtureHandlers(inventory);
  return Object.freeze({
    ...fixtureHandlers,
    "phoenix-pools": phoenixHandler<PoolsQuery>(
      dependencies,
      (reader, query, bounds) => reader.listPools(query, bounds),
    ),
    "phoenix-pool-whitelists": phoenixHandler<PoolWhitelistedAddressesQuery>(
      dependencies,
      (reader, query, bounds) =>
        reader.listPoolWhitelistedAddresses(query, bounds),
    ),
    "phoenix-flows": phoenixHandler<FlowsQuery>(
      dependencies,
      (reader, query, bounds) => reader.listFlows(query, bounds),
    ),
    "phoenix-limit-order-markets": phoenixHandler<LimitOrderMarketsQuery>(
      dependencies,
      (reader, query, bounds) => reader.listLimitOrderMarkets(query, bounds),
    ),
    "phoenix-limit-order-orderbook": phoenixHandler<LimitOrderOrderbookQuery>(
      dependencies,
      (reader, query, bounds) => reader.listLimitOrderOrderbook(query, bounds),
    ),
    "phoenix-limit-order-fills": phoenixHandler<LimitOrderFillsQuery>(
      dependencies,
      (reader, query, bounds) => reader.listLimitOrderFills(query, bounds),
    ),
  });
}

export interface LocalLiveReadGateway {
  readonly inventory: ReturnType<typeof createLocalLiveReadInventory>;
  readonly principal: ReturnType<typeof createLocalLiveReadPrincipal>;
  readonly router: ToolRouter;
}

export function createLocalLiveReadGateway(
  dependencies: LiveReadDependencies,
): LocalLiveReadGateway {
  const inventory = createLocalLiveReadInventory();
  const principal = createLocalLiveReadPrincipal();
  return Object.freeze({
    inventory,
    principal,
    router: new ToolRouter({
      capabilityInventory: () => inventory,
      handlers: createLiveReadHandlers(dependencies, inventory),
      admission: createFixtureAdmissionController(),
      clock: { nowMs: () => Number(dependencies.now()) },
    }),
  });
}
