import {
  CAPPED_INPUT_CAPABILITY_IDS,
  validateCapabilityInventory,
  type CapabilityInventoryV1,
} from "@corkprotocol/operations";
import {
  WorkAdmissionError,
  type CredentialClaims,
  type HostedScope,
  type WorkAdmissionController,
  type WorkCost,
  type WorkLease,
} from "./controls.js";
import {
  CAPABILITY_TOOL_CATALOG,
  type CapabilityHandlerKey,
} from "./capability-catalog.js";

type JsonPrimitiveType = "string" | "number" | "boolean" | "object" | "array";

export interface JsonPropertySchema {
  readonly type: JsonPrimitiveType;
  readonly enum?: readonly (string | number | boolean)[];
  readonly items?: JsonPropertySchema;
  readonly properties?: Readonly<Record<string, JsonPropertySchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface ClosedInputSchema {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Readonly<Record<string, JsonPropertySchema>>;
  readonly required?: readonly string[];
}

export type HandlerKey =
  | "capability-inventory"
  | "phoenix-pools"
  | "phoenix-pool-whitelists"
  | "phoenix-flows"
  | "phoenix-limit-order-markets"
  | "phoenix-limit-order-orderbook"
  | "phoenix-limit-order-fills"
  | "phoenix-market-verify"
  | "authority-inspect"
  | "authority-onboard-prepare"
  | "authority-revoke-prepare"
  | "paired-shares-unwind-prepare"
  | "paired-shares-unwind-finalize"
  | "paired-shares-unwind-simulate"
  | "paired-shares-unwind-reconcile"
  | CapabilityHandlerKey;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly scope: HostedScope;
  readonly inputSchema: ClosedInputSchema;
  readonly costProfile: WorkCost;
  readonly handlerKey: HandlerKey;
  readonly capabilityId?: string;
}

export interface HandlerContext {
  readonly principal: CredentialClaims;
  readonly signal: AbortSignal;
  readonly deadlineAtMs?: number;
}

export type ToolHandler = (
  input: Readonly<Record<string, unknown>>,
  context: HandlerContext,
) => Promise<unknown>;

export type ToolHandlers = Readonly<Record<HandlerKey, ToolHandler>>;

export type RouterErrorCode =
  | "UNKNOWN_TOOL"
  | "AUTHENTICATION_SCOPE_DENIED"
  | "CAPABILITY_NOT_CALLABLE"
  | "INVALID_INPUT"
  | "REQUEST_CANCELLED"
  | "DEADLINE_EXCEEDED"
  | "HANDLER_FAILED"
  | "BOUNDED_WORK_REJECTED";

export interface RouterError {
  readonly code: RouterErrorCode;
  readonly message: string;
}

export type RouterCallResult =
  | {
      readonly ok: true;
      readonly toolName: string;
      readonly coreResult: unknown;
      readonly transportMetadata: {
        readonly principalId: string;
        readonly environment: string;
        readonly scope: HostedScope;
      };
    }
  | {
      readonly ok: false;
      readonly error: RouterError;
    };

export interface RouterDependencies {
  readonly capabilityInventory: () => CapabilityInventoryV1;
  readonly handlers: ToolHandlers;
  readonly admission: WorkAdmissionController;
  readonly clock: {
    nowMs(): number;
  };
}

const STRING: JsonPropertySchema = { type: "string" };
const NUMBER: JsonPropertySchema = { type: "number" };
const BOOLEAN: JsonPropertySchema = { type: "boolean" };
const STRING_ARRAY: JsonPropertySchema = { type: "array", items: STRING };

function closedSchema(
  properties: Readonly<Record<string, JsonPropertySchema>>,
  required?: readonly string[],
): ClosedInputSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required === undefined ? {} : { required }),
  };
}

const EMPTY_SCHEMA = closedSchema({});
const PAGE_BOUNDS = {
  maxPages: NUMBER,
  maxItems: NUMBER,
} as const;
const BLOCK_TIME_FILTERS = {
  fromBlock: STRING,
  toBlock: STRING,
  fromTimestamp: STRING,
  toTimestamp: STRING,
} as const;

const READ_COST: WorkCost = {
  concurrency: 1,
  upstream: 1,
  simulation: 0,
  queue: 1,
  responseBytes: 1_000_000,
  total: 3,
};
const VERIFY_COST: WorkCost = {
  concurrency: 1,
  upstream: 2,
  simulation: 0,
  queue: 1,
  responseBytes: 500_000,
  total: 5,
};
const WRITE_COST: WorkCost = {
  concurrency: 1,
  upstream: 2,
  simulation: 0,
  queue: 1,
  responseBytes: 250_000,
  total: 5,
};
const SIMULATION_COST: WorkCost = {
  concurrency: 1,
  upstream: 2,
  simulation: 1,
  queue: 1,
  responseBytes: 500_000,
  total: 7,
};

const BASE_TOOL_CATALOG: readonly ToolDefinition[] = [
  {
    name: "cork.capabilities.v1",
    description: "Return the canonical capability maturity inventory.",
    scope: "capabilities:read",
    inputSchema: EMPTY_SCHEMA,
    costProfile: {
      concurrency: 1,
      upstream: 0,
      simulation: 0,
      queue: 1,
      responseBytes: 250_000,
      total: 2,
    },
    handlerKey: "capability-inventory",
  },
  {
    name: "cork.phoenix.pools.list.v1",
    description: "Read bounded Phoenix pools with exact source bytes.",
    scope: "phoenix:read",
    inputSchema: closedSchema({
      chainName: { type: "string", enum: ["mainnet", "virtual", "sepolia"] },
      chainId: NUMBER,
      poolManagerAddress: STRING,
      collateralAddress: STRING,
      referenceAddress: STRING,
      principalAddress: STRING,
      swapAddress: STRING,
      rateOracleAddress: STRING,
      poolId: STRING,
      poolWhitelistStatus: {
        type: "string",
        enum: ["enabled", "disabled"],
      },
      expiryBefore: STRING,
      expiryAfter: STRING,
      ...BLOCK_TIME_FILTERS,
      limit: NUMBER,
      nextCursor: STRING,
      ...PAGE_BOUNDS,
    }),
    costProfile: READ_COST,
    handlerKey: "phoenix-pools",
    capabilityId: "cork.phoenix.pools.list.v1",
  },
  {
    name: "cork.phoenix.poolWhitelists.list.v1",
    description:
      "Read bounded Phoenix pool whitelist entries with exact source bytes.",
    scope: "phoenix:read",
    inputSchema: closedSchema({
      chainName: { type: "string", enum: ["mainnet", "virtual", "sepolia"] },
      chainId: NUMBER,
      poolManagerAddress: STRING,
      whitelistManagerAddress: STRING,
      poolId: STRING,
      walletAddress: STRING,
      collateralAddress: STRING,
      referenceAddress: STRING,
      poolWhitelistStatus: {
        type: "string",
        enum: ["enabled", "disabled"],
      },
      expiryBefore: STRING,
      expiryAfter: STRING,
      ...BLOCK_TIME_FILTERS,
      limit: NUMBER,
      nextCursor: STRING,
      ...PAGE_BOUNDS,
    }),
    costProfile: READ_COST,
    handlerKey: "phoenix-pool-whitelists",
    capabilityId: "cork.phoenix.poolWhitelists.list.v1",
  },
  {
    name: "cork.phoenix.flows.list.v1",
    description:
      "Read bounded Phoenix wallet-or-pool flows with exact source bytes.",
    scope: "phoenix:read",
    inputSchema: closedSchema({
      chainName: { type: "string", enum: ["mainnet", "virtual", "sepolia"] },
      chainId: NUMBER,
      walletAddress: STRING,
      poolId: STRING,
      ...BLOCK_TIME_FILTERS,
      actionType: {
        type: "string",
        enum: ["exercise", "repurchase", "redeem", "mint", "unwind"],
      },
      limit: NUMBER,
      nextCursor: STRING,
      ...PAGE_BOUNDS,
    }),
    costProfile: READ_COST,
    handlerKey: "phoenix-flows",
    capabilityId: "cork.phoenix.flows.list.v1",
  },
  {
    name: "cork.phoenix.limitOrders.markets.list.v1",
    description: "Read bounded limit-order markets with exact source bytes.",
    scope: "limit-orders:read",
    inputSchema: closedSchema({
      chainId: NUMBER,
      poolId: STRING,
      makerAsset: STRING,
      takerAsset: STRING,
      onlyActive: BOOLEAN,
      limit: NUMBER,
      offset: NUMBER,
      nextCursor: STRING,
      ...PAGE_BOUNDS,
    }),
    costProfile: READ_COST,
    handlerKey: "phoenix-limit-order-markets",
    capabilityId: "cork.phoenix.limitOrders.markets.list.v1",
  },
  {
    name: "cork.phoenix.limitOrders.orderbook.list.v1",
    description: "Read bounded limit orders with exact source bytes.",
    scope: "limit-orders:read",
    inputSchema: closedSchema({
      chainId: NUMBER,
      poolId: STRING,
      maker: STRING,
      makerAsset: STRING,
      takerAsset: STRING,
      side: { type: "string", enum: ["BUY", "SELL"] },
      status: {
        type: "array",
        items: {
          type: "string",
          enum: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"],
        },
      },
      limit: NUMBER,
      offset: NUMBER,
      nextCursor: STRING,
      ...PAGE_BOUNDS,
    }),
    costProfile: READ_COST,
    handlerKey: "phoenix-limit-order-orderbook",
    capabilityId: "cork.phoenix.limitOrders.orderbook.list.v1",
  },
  {
    name: "cork.phoenix.limitOrders.fills.list.v1",
    description: "Read bounded limit-order fills with exact source bytes.",
    scope: "limit-orders:read",
    inputSchema: closedSchema({
      chainId: NUMBER,
      poolId: STRING,
      orderHash: STRING,
      maker: STRING,
      taker: STRING,
      ...BLOCK_TIME_FILTERS,
      limit: NUMBER,
      offset: NUMBER,
      nextCursor: STRING,
      ...PAGE_BOUNDS,
    }),
    costProfile: READ_COST,
    handlerKey: "phoenix-limit-order-fills",
    capabilityId: "cork.phoenix.limitOrders.fills.list.v1",
  },
  {
    name: "cork.phoenix.market.verify.v1",
    description:
      "Route selected source bytes and raw observations to pure verified-market reconstruction.",
    scope: "phoenix:verify",
    inputSchema: closedSchema(
      {
        chainId: STRING,
        poolId: STRING,
        sourcePayloadDigest: STRING,
        selectedItemDigest: STRING,
      },
      ["chainId", "poolId", "sourcePayloadDigest", "selectedItemDigest"],
    ),
    costProfile: VERIFY_COST,
    handlerKey: "phoenix-market-verify",
    capabilityId: "cork.phoenix.market.verify.v1",
  },
  {
    name: "cork.phoenix.authority.inspect.v1",
    description: "Inspect manifest-bound token and account authority inputs.",
    scope: "authority:read",
    inputSchema: closedSchema(
      { chainId: STRING, wallet: STRING, token: STRING },
      ["chainId", "wallet", "token"],
    ),
    costProfile: VERIFY_COST,
    handlerKey: "authority-inspect",
    capabilityId: "cork.phoenix.authority.v1",
  },
  {
    name: "cork.phoenix.authority.onboard.prepare.v1",
    description: "Prepare only manifest-bound standing authority onboarding.",
    scope: "authority:write",
    inputSchema: closedSchema(
      { chainId: STRING, wallet: STRING, token: STRING },
      ["chainId", "wallet", "token"],
    ),
    costProfile: WRITE_COST,
    handlerKey: "authority-onboard-prepare",
    capabilityId: "cork.phoenix.authority.v1",
  },
  {
    name: "cork.phoenix.authority.revoke.prepare.v1",
    description: "Prepare only manifest-derived authority revocation.",
    scope: "authority:write",
    inputSchema: closedSchema(
      { chainId: STRING, wallet: STRING, token: STRING },
      ["chainId", "wallet", "token"],
    ),
    costProfile: WRITE_COST,
    handlerKey: "authority-revoke-prepare",
    capabilityId: "cork.phoenix.authority.v1",
  },
  {
    name: "cork.phoenix.unwind.paired-shares-in.prepare.v1",
    description: "Prepare the exact paired-shares-in unwind profile.",
    scope: "action:write",
    inputSchema: closedSchema(
      {
        chainId: STRING,
        poolId: STRING,
        account: STRING,
        requestedShares: STRING,
        minimumCollateral: STRING,
        deadline: STRING,
      },
      [
        "chainId",
        "poolId",
        "account",
        "requestedShares",
        "minimumCollateral",
        "deadline",
      ],
    ),
    costProfile: WRITE_COST,
    handlerKey: "paired-shares-unwind-prepare",
    capabilityId: "cork.phoenix.unwind.paired-shares-in.v1",
  },
  {
    name: "cork.phoenix.unwind.paired-shares-in.finalize.v1",
    description: "Finalize the reconstructed paired-shares-in unwind artifact.",
    scope: "action:write",
    inputSchema: closedSchema(
      { preparedDigest: STRING, signatures: STRING_ARRAY },
      ["preparedDigest", "signatures"],
    ),
    costProfile: VERIFY_COST,
    handlerKey: "paired-shares-unwind-finalize",
    capabilityId: "cork.phoenix.unwind.paired-shares-in.v1",
  },
  {
    name: "cork.phoenix.unwind.paired-shares-in.simulate.v1",
    description: "Simulate unchanged finalized paired-shares-in unwind bytes.",
    scope: "simulation:run",
    inputSchema: closedSchema(
      { finalizedDigest: STRING, calls: STRING_ARRAY },
      ["finalizedDigest", "calls"],
    ),
    costProfile: SIMULATION_COST,
    handlerKey: "paired-shares-unwind-simulate",
    capabilityId: "cork.phoenix.unwind.paired-shares-in.v1",
  },
  {
    name: "cork.phoenix.unwind.paired-shares-in.reconcile.v1",
    description:
      "Reconcile paired-shares-in unwind receipts through the canonical core.",
    scope: "reconciliation:read",
    inputSchema: closedSchema(
      { operationDigest: STRING, receiptDigests: STRING_ARRAY },
      ["operationDigest", "receiptDigests"],
    ),
    costProfile: VERIFY_COST,
    handlerKey: "paired-shares-unwind-reconcile",
    capabilityId: "cork.phoenix.unwind.paired-shares-in.v1",
  },
] as const;

export const STATIC_TOOL_CATALOG: readonly ToolDefinition[] = [
  ...BASE_TOOL_CATALOG,
  ...CAPABILITY_TOOL_CATALOG,
] as const;

const CATALOG_BY_NAME = new Map(
  STATIC_TOOL_CATALOG.map((definition) => [definition.name, definition]),
);

function scopeAllowed(
  principal: CredentialClaims,
  scope: HostedScope,
): boolean {
  return principal.scopes.includes(scope);
}

function capabilityCallable(
  inventory: CapabilityInventoryV1,
  capabilityId: string | undefined,
): boolean {
  if (capabilityId === undefined) {
    return true;
  }
  return (
    inventory.capabilities.find(
      (capability) => capability.capabilityId === capabilityId,
    )?.callable === true
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesProperty(value: unknown, schema: JsonPropertySchema): boolean {
  if (schema.type === "array") {
    return (
      Array.isArray(value) &&
      (schema.items === undefined ||
        value.every((item) => matchesProperty(item, schema.items!)))
    );
  }
  if (schema.type === "object") {
    if (!isRecord(value)) {
      return false;
    }
    const properties = schema.properties ?? {};
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((key) => properties[key] === undefined)
    ) {
      return false;
    }
    if (schema.required?.some((key) => !Object.hasOwn(value, key)) === true) {
      return false;
    }
    return Object.entries(value).every(([key, item]) => {
      const property = properties[key];
      return property === undefined || matchesProperty(item, property);
    });
  }
  if (typeof value !== schema.type) {
    return false;
  }
  return schema.enum === undefined || schema.enum.includes(value as never);
}

function validateInput(
  input: unknown,
  schema: ClosedInputSchema,
  toolName: string,
): RouterError | undefined {
  if (!isRecord(input)) {
    return {
      code: "INVALID_INPUT",
      message: `${toolName} input must be a closed object`,
    };
  }
  if (Object.keys(input).some((key) => schema.properties[key] === undefined)) {
    return {
      code: "INVALID_INPUT",
      message: `${toolName} input contains an unknown field`,
    };
  }
  if (schema.required?.some((key) => !Object.hasOwn(input, key)) === true) {
    return {
      code: "INVALID_INPUT",
      message: `${toolName} input is missing a required field`,
    };
  }
  for (const [key, value] of Object.entries(input)) {
    const property = schema.properties[key];
    if (property === undefined || !matchesProperty(value, property)) {
      return {
        code: "INVALID_INPUT",
        message: `${toolName} input field ${key} has an invalid type or value`,
      };
    }
  }
  if (
    toolName === "cork.phoenix.flows.list.v1" &&
    input["walletAddress"] === undefined &&
    input["poolId"] === undefined
  ) {
    return {
      code: "INVALID_INPUT",
      message: "flows requires walletAddress or poolId",
    };
  }
  return undefined;
}

function errorResult(code: RouterErrorCode, message: string): RouterCallResult {
  return { ok: false, error: { code, message } };
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

class RouterCancellationError extends Error {
  public override readonly name = "RouterCancellationError";
}

class RouterDeadlineError extends Error {
  public override readonly name = "RouterDeadlineError";
}

export class ToolRouter {
  readonly #dependencies: RouterDependencies;

  public constructor(dependencies: RouterDependencies) {
    this.#dependencies = dependencies;
  }

  public listTools(principal: CredentialClaims): readonly ToolDefinition[] {
    const inventory = validateCapabilityInventory(
      this.#dependencies.capabilityInventory(),
    );
    return STATIC_TOOL_CATALOG.filter(
      (tool) =>
        scopeAllowed(principal, tool.scope) &&
        capabilityCallable(inventory, tool.capabilityId),
    );
  }

  public async call(input: {
    readonly name: string;
    readonly arguments: unknown;
    readonly principal: CredentialClaims;
    readonly signal?: AbortSignal;
    readonly deadlineAtMs?: number;
  }): Promise<RouterCallResult> {
    const tool = CATALOG_BY_NAME.get(input.name);
    if (tool === undefined) {
      return errorResult("UNKNOWN_TOOL", "unknown hosted tool");
    }
    if (!scopeAllowed(input.principal, tool.scope)) {
      return errorResult(
        "AUTHENTICATION_SCOPE_DENIED",
        "credential lacks the required hosted scope",
      );
    }
    const inventory = validateCapabilityInventory(
      this.#dependencies.capabilityInventory(),
    );
    if (!capabilityCallable(inventory, tool.capabilityId)) {
      return errorResult(
        "CAPABILITY_NOT_CALLABLE",
        "capability is not implemented, activated, and healthy",
      );
    }
    const invalid = validateInput(input.arguments, tool.inputSchema, tool.name);
    if (invalid !== undefined) {
      return { ok: false, error: invalid };
    }
    if (signalAborted(input.signal)) {
      return errorResult("REQUEST_CANCELLED", "request was cancelled");
    }
    if (
      input.deadlineAtMs !== undefined &&
      this.#dependencies.clock.nowMs() >= input.deadlineAtMs
    ) {
      return errorResult("DEADLINE_EXCEEDED", "request deadline elapsed");
    }

    let lease: WorkLease;
    try {
      lease = this.#dependencies.admission.admit({
        principalId: input.principal.principalId,
        trafficClass: input.principal.trafficClass,
        cost: tool.costProfile,
      });
    } catch (error) {
      if (error instanceof WorkAdmissionError) {
        return errorResult("BOUNDED_WORK_REJECTED", error.message);
      }
      return errorResult(
        "BOUNDED_WORK_REJECTED",
        "work admission failed closed",
      );
    }

    try {
      if (signalAborted(input.signal)) {
        return errorResult("REQUEST_CANCELLED", "request was cancelled");
      }
      if (
        input.deadlineAtMs !== undefined &&
        this.#dependencies.clock.nowMs() >= input.deadlineAtMs
      ) {
        return errorResult("DEADLINE_EXCEEDED", "request deadline elapsed");
      }
      const handler = this.#dependencies.handlers[tool.handlerKey];
      const coreResult = await this.#invoke(handler, {
        arguments: input.arguments,
        principal: input.principal,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.deadlineAtMs === undefined
          ? {}
          : { deadlineAtMs: input.deadlineAtMs }),
      });
      if (signalAborted(input.signal)) {
        return errorResult("REQUEST_CANCELLED", "request was cancelled");
      }
      if (
        input.deadlineAtMs !== undefined &&
        this.#dependencies.clock.nowMs() >= input.deadlineAtMs
      ) {
        return errorResult("DEADLINE_EXCEEDED", "request deadline elapsed");
      }
      return {
        ok: true,
        toolName: tool.name,
        coreResult,
        transportMetadata: {
          principalId: input.principal.principalId,
          environment: input.principal.environment,
          scope: tool.scope,
        },
      };
    } catch (error) {
      if (error instanceof RouterCancellationError) {
        return errorResult("REQUEST_CANCELLED", "request was cancelled");
      }
      if (error instanceof RouterDeadlineError) {
        return errorResult("DEADLINE_EXCEEDED", "request deadline elapsed");
      }
      return errorResult("HANDLER_FAILED", "injected operation handler failed");
    } finally {
      lease.release();
    }
  }

  async #invoke(
    handler: ToolHandler,
    input: {
      readonly arguments: unknown;
      readonly principal: CredentialClaims;
      readonly signal?: AbortSignal;
      readonly deadlineAtMs?: number;
    },
  ): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancellation = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          reject(
            input.deadlineAtMs !== undefined &&
              this.#dependencies.clock.nowMs() >= input.deadlineAtMs
              ? new RouterDeadlineError()
              : new RouterCancellationError(),
          );
        },
        { once: true },
      );
    });
    if (input.deadlineAtMs !== undefined) {
      const delay = Math.max(
        0,
        input.deadlineAtMs - this.#dependencies.clock.nowMs(),
      );
      timer = setTimeout(() => controller.abort(), delay);
    }
    try {
      return await Promise.race([
        handler(input.arguments as Readonly<Record<string, unknown>>, {
          principal: input.principal,
          signal: controller.signal,
          ...(input.deadlineAtMs === undefined
            ? {}
            : { deadlineAtMs: input.deadlineAtMs }),
        }),
        cancellation,
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    }
  }
}

export function cappedInputToolsAreOmitted(): boolean {
  return CAPPED_INPUT_CAPABILITY_IDS.every(
    (capabilityId) =>
      !STATIC_TOOL_CATALOG.some(
        (tool) =>
          tool.name === capabilityId ||
          tool.name.startsWith(`${capabilityId.slice(0, -3)}.`),
      ),
  );
}
