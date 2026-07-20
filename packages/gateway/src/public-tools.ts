import {
  CAPPED_INPUT_CAPABILITY_IDS,
  sha256CanonicalJson,
  type JsonValue,
} from "@corkprotocol/operations";
import { decodeBundler3Calldata, MAX_CALLDATA_BYTES } from "./calldata.js";
import { type CredentialClaims, type HostedScope } from "./controls.js";
import {
  type ClosedInputSchema,
  type JsonPropertySchema,
  type RouterCallResult,
  type RouterErrorCode,
} from "./router.js";
import { type StdioToolDefinition, type StdioToolRouter } from "./stable.js";

export const PUBLIC_TOOL_NAMES = [
  "cork_query",
  "cork_compute",
  "cork_decode",
  "cork_capabilities",
  "cork_prepare_phoenix",
  "cork_prepare_orders",
  "cork_prepare_market",
  "cork_track",
  "cork_submit",
] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];

type LocalHandler = "capabilities" | "fixed-mul-div-floor" | "bundler3";

interface DelegatedVariant {
  readonly kind: "delegated";
  readonly id: string;
  readonly targetTool: string;
}

interface LocalVariant {
  readonly kind: "local";
  readonly id: string;
  readonly scope: HostedScope;
  readonly inputSchema: ClosedInputSchema;
  readonly handler: LocalHandler;
}

export type PublicVariantDefinition = DelegatedVariant | LocalVariant;

export interface PublicToolRegistryEntry {
  readonly name: PublicToolName;
  readonly description: string;
  readonly cliPath: readonly string[];
  readonly inputStyle: "empty" | "variant";
  readonly variants: readonly PublicVariantDefinition[];
  readonly annotations: NonNullable<StdioToolDefinition["annotations"]>;
}

export interface PublicToolResultEnvelope {
  readonly schemaVersion: "cork.tool-result/v1";
  readonly tool: PublicToolName;
  readonly variant: string;
  readonly state: "ok" | "conflict" | "unavailable";
  readonly data: JsonValue;
  readonly warnings: readonly {
    readonly code: string;
    readonly message: string;
  }[];
  readonly provenance: {
    readonly source: "canonical-gateway" | "canonical-local";
    readonly environment: string;
    readonly targetTool?: string;
    readonly resultDigest: string;
  };
}

const EMPTY_SCHEMA: ClosedInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const UINT_STRING: JsonPropertySchema = {
  type: "string",
  pattern: "^(?:0|[1-9][0-9]*)$",
  maxLength: 78,
};

const FIXED_MATH_SCHEMA: ClosedInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: UINT_STRING,
    rate: UINT_STRING,
    scale: UINT_STRING,
  },
  required: ["amount", "rate", "scale"],
};

const CALLDATA_SCHEMA: ClosedInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    data: {
      type: "string",
      pattern: "^0x(?:[0-9a-fA-F]{2})+$",
      maxLength: 2 + MAX_CALLDATA_BYTES * 2,
    },
  },
  required: ["data"],
};

const PUBLIC_OUTPUT_SCHEMA: JsonPropertySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: "cork.tool-result/v1" },
    tool: { type: "string", enum: PUBLIC_TOOL_NAMES },
    variant: { type: "string" },
    state: {
      type: "string",
      enum: ["ok", "conflict", "unavailable"],
    },
    data: {},
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
        required: ["code", "message"],
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      properties: {
        source: {
          type: "string",
          enum: ["canonical-gateway", "canonical-local"],
        },
        environment: { type: "string" },
        targetTool: { type: "string" },
        resultDigest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
      },
      required: ["source", "environment", "resultDigest"],
    },
  },
  required: [
    "schemaVersion",
    "tool",
    "variant",
    "state",
    "data",
    "warnings",
    "provenance",
  ],
};

function delegated(id: string, targetTool: string): DelegatedVariant {
  return { kind: "delegated", id, targetTool };
}

function local(
  id: string,
  inputSchema: ClosedInputSchema,
  handler: LocalHandler,
): LocalVariant {
  return {
    kind: "local",
    id,
    scope: "capabilities:read",
    inputSchema,
    handler,
  };
}

const EXACT_SPEND_PROFILES = [
  ["mint-collateral-in", "cork.phoenix.mint.collateral-in"],
  ["mint-paired-shares-out", "cork.phoenix.mint.paired-shares-out"],
  [
    "repurchase-collateral-in-for-swap",
    "cork.phoenix.repurchase.collateral-in-for-swap",
  ],
  ["unwind-collateral-out", "cork.phoenix.unwind.collateral-out"],
  ["redeem-principal-token-in", "cork.phoenix.redeem.principal-token-in"],
] as const;

const EXACT_PREPARE_VARIANTS = EXACT_SPEND_PROFILES.flatMap(
  ([variant, prefix]) => [
    delegated(`${variant}.prepare`, `${prefix}.prepare.v1`),
    delegated(`${variant}.finalize`, `${prefix}.finalize.v1`),
  ],
);

const EXACT_TRACK_VARIANTS = EXACT_SPEND_PROFILES.flatMap(
  ([variant, prefix]) => [
    delegated(`${variant}.simulate`, `${prefix}.simulate.v1`),
    delegated(`${variant}.reconcile`, `${prefix}.reconcile.v1`),
  ],
);

export const PUBLIC_TOOL_REGISTRY: readonly PublicToolRegistryEntry[] =
  Object.freeze([
    {
      name: "cork_query",
      description:
        "Read supported Cork and Phoenix resources through bounded canonical adapters.",
      cliPath: ["query"],
      inputStyle: "variant",
      variants: [
        delegated("phoenix-pools", "cork.phoenix.pools.list.v1"),
        delegated(
          "phoenix-pool-whitelists",
          "cork.phoenix.poolWhitelists.list.v1",
        ),
        delegated("phoenix-flows", "cork.phoenix.flows.list.v1"),
        delegated(
          "limit-order-markets",
          "cork.phoenix.limitOrders.markets.list.v1",
        ),
        delegated(
          "limit-order-orderbook",
          "cork.phoenix.limitOrders.orderbook.list.v1",
        ),
        delegated(
          "limit-order-fills",
          "cork.phoenix.limitOrders.fills.list.v1",
        ),
        delegated("phoenix-market-verify", "cork.phoenix.market.verify.v1"),
        delegated("authority-inspect", "cork.phoenix.authority.inspect.v1"),
        delegated("fixture-markets", "cork.local.markets.list.v1"),
      ],
      annotations: {
        title: "Query Cork data",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "cork_compute",
      description:
        "Run deterministic integer computations without network access or floating-point rounding.",
      cliPath: ["compute"],
      inputStyle: "variant",
      variants: [
        local("fixed-mul-div-floor", FIXED_MATH_SCHEMA, "fixed-mul-div-floor"),
      ],
      annotations: {
        title: "Compute Cork values",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "cork_decode",
      description:
        "Decode bounded Bundler3 calldata while preserving unknown legs instead of hiding them.",
      cliPath: ["decode"],
      inputStyle: "variant",
      variants: [local("bundler3-calldata", CALLDATA_SCHEMA, "bundler3")],
      annotations: {
        title: "Decode Cork calldata",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "cork_capabilities",
      description:
        "List only the public tool variants callable for the current principal and runtime.",
      cliPath: ["capabilities"],
      inputStyle: "empty",
      variants: [local("list", EMPTY_SCHEMA, "capabilities")],
      annotations: {
        title: "List Cork capabilities",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "cork_prepare_phoenix",
      description:
        "Prepare or finalize supported Phoenix actions; signing and broadcasting remain caller-owned.",
      cliPath: ["prepare", "phoenix"],
      inputStyle: "variant",
      variants: [
        delegated(
          "paired-shares-unwind.prepare",
          "cork.phoenix.unwind.paired-shares-in.prepare.v1",
        ),
        delegated(
          "paired-shares-unwind.finalize",
          "cork.phoenix.unwind.paired-shares-in.finalize.v1",
        ),
        delegated(
          "authority-onboard.prepare",
          "cork.phoenix.authority.onboard.prepare.v1",
        ),
        delegated(
          "authority-revoke.prepare",
          "cork.phoenix.authority.revoke.prepare.v1",
        ),
        ...EXACT_PREPARE_VARIANTS,
        delegated("fixture-safe-unwind", "cork.local.safe.unwind.prepare.v1"),
        delegated("fixture-safe-coverage", "cork.local.safe.coverage.v1"),
      ],
      annotations: {
        title: "Prepare Phoenix actions",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "cork_prepare_orders",
      description:
        "Prepare caller-owned limit-order maker, taker, cancellation, and revocation artifacts.",
      cliPath: ["prepare", "orders"],
      inputStyle: "variant",
      variants: [
        delegated("maker.prepare", "cork.phoenix.limitOrders.maker.prepare.v1"),
        delegated(
          "maker.finalize",
          "cork.phoenix.limitOrders.maker.finalize.v1",
        ),
        delegated("taker.prepare", "cork.phoenix.limitOrders.taker.prepare.v1"),
        delegated(
          "cancel.prepare",
          "cork.phoenix.limitOrders.cancel.prepare.v1",
        ),
        delegated(
          "allowance-revoke.prepare",
          "cork.phoenix.limitOrders.allowance.revoke.prepare.v1",
        ),
      ],
      annotations: {
        title: "Prepare limit orders",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "cork_prepare_market",
      description:
        "Quote or prepare a market deployment using verified handoff and deployment evidence.",
      cliPath: ["prepare", "market"],
      inputStyle: "variant",
      variants: [
        delegated("quote", "cork.market.deploy.quote.v1"),
        delegated("prepare", "cork.market.deploy.prepare.v1"),
        delegated("safe-package", "cork.safe.market.preview.prepare.v1"),
      ],
      annotations: {
        title: "Prepare Cork markets",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "cork_track",
      description:
        "Simulate or reconcile supported Cork actions, orders, and market deployments.",
      cliPath: ["track"],
      inputStyle: "variant",
      variants: [
        delegated(
          "paired-shares-unwind.simulate",
          "cork.phoenix.unwind.paired-shares-in.simulate.v1",
        ),
        delegated(
          "paired-shares-unwind.reconcile",
          "cork.phoenix.unwind.paired-shares-in.reconcile.v1",
        ),
        ...EXACT_TRACK_VARIANTS,
        delegated(
          "limit-order.reconcile",
          "cork.phoenix.limitOrders.reconcile.v1",
        ),
        delegated("market.simulate", "cork.market.deploy.simulate.v1"),
        delegated("market.reconcile", "cork.market.deploy.reconcile.v1"),
      ],
      annotations: {
        title: "Track Cork operations",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: "cork_submit",
      description:
        "Submit a caller-signed limit order with byte-stable idempotency; never signs or broadcasts transactions.",
      cliPath: ["submit"],
      inputStyle: "variant",
      variants: [
        delegated("limit-order", "cork.phoenix.limitOrders.submit.v1"),
      ],
      annotations: {
        title: "Submit signed Cork artifacts",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
  ] satisfies readonly PublicToolRegistryEntry[]);

const REGISTRY_BY_NAME = new Map(
  PUBLIC_TOOL_REGISTRY.map((definition) => [definition.name, definition]),
);

interface ActiveVariant {
  readonly definition: PublicVariantDefinition;
  readonly inputSchema: ClosedInputSchema;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesSchema(value: unknown, schema: JsonPropertySchema): boolean {
  if (
    schema.oneOf !== undefined &&
    schema.oneOf.filter((candidate) => matchesSchema(value, candidate))
      .length !== 1
  ) {
    return false;
  }
  if (schema.const !== undefined && value !== schema.const) return false;
  if (schema.type === undefined) return true;
  if (schema.type === "array") {
    return (
      Array.isArray(value) &&
      (schema.items === undefined ||
        value.every((item) => matchesSchema(item, schema.items!)))
    );
  }
  if (schema.type === "object") {
    if (!isRecord(value)) return false;
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
      return property === undefined || matchesSchema(item, property);
    });
  }
  if (typeof value !== schema.type) return false;
  if (
    schema.maxLength !== undefined &&
    (typeof value !== "string" || value.length > schema.maxLength)
  ) {
    return false;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as never)) {
    return false;
  }
  return (
    schema.pattern === undefined ||
    (typeof value === "string" && new RegExp(schema.pattern, "u").test(value))
  );
}

function variantInputSchema(
  variants: readonly ActiveVariant[],
): ClosedInputSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      variant: {
        type: "string",
        enum: variants.map(({ definition }) => definition.id),
      },
      input: {},
    },
    required: ["variant", "input"],
    oneOf: variants.map(({ definition, inputSchema }) => ({
      type: "object",
      additionalProperties: false,
      properties: {
        variant: { type: "string", const: definition.id },
        input: inputSchema,
      },
      required: ["variant", "input"],
    })),
  };
}

function publicError(code: RouterErrorCode, message: string): RouterCallResult {
  return { ok: false, error: { code, message } };
}

function jsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("tool result contains a non-finite number");
    }
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("tool result is cyclic");
    ancestors.add(value);
    const result = value.map((item) =>
      item === undefined ? null : jsonValue(item, ancestors),
    );
    ancestors.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (ancestors.has(value)) throw new TypeError("tool result is cyclic");
    ancestors.add(value);
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = jsonValue(item, ancestors);
    }
    ancestors.delete(value);
    return result;
  }
  throw new TypeError(`tool result contains unsupported ${typeof value}`);
}

function resultState(data: JsonValue): PublicToolResultEnvelope["state"] {
  if (!isRecord(data)) return "ok";
  const state = data["state"] ?? data["status"] ?? data["kind"];
  if (
    state === "conflict" ||
    state === "reorg-conflict" ||
    state === "invalid"
  ) {
    return "conflict";
  }
  if (state === "unavailable" || state === "failure") return "unavailable";
  return "ok";
}

function fixedMulDivFloor(input: Readonly<Record<string, unknown>>): JsonValue {
  const amount = BigInt(input["amount"] as string);
  const rate = BigInt(input["rate"] as string);
  const scale = BigInt(input["scale"] as string);
  const maximumUint256 = (1n << 256n) - 1n;
  if (
    amount > maximumUint256 ||
    rate > maximumUint256 ||
    scale > maximumUint256
  ) {
    throw new RangeError("amount, rate, and scale must fit uint256");
  }
  if (scale === 0n) throw new RangeError("scale must be greater than zero");
  return {
    schemaVersion: "cork.fixed-math/v1",
    operation: "mul-div-floor",
    amount: amount.toString(),
    rate: rate.toString(),
    scale: scale.toString(),
    result: ((amount * rate) / scale).toString(),
    rounding: "floor",
  };
}

function localResult(
  handler: LocalHandler,
  input: Readonly<Record<string, unknown>>,
  capabilities: JsonValue,
): JsonValue {
  switch (handler) {
    case "capabilities":
      return capabilities;
    case "fixed-mul-div-floor":
      return fixedMulDivFloor(input);
    case "bundler3":
      return jsonValue(decodeBundler3Calldata(input["data"] as string));
  }
}

function envelope(input: {
  readonly tool: PublicToolName;
  readonly variant: string;
  readonly data: unknown;
  readonly environment: string;
  readonly targetTool?: string;
}): PublicToolResultEnvelope {
  const data = jsonValue(input.data);
  return {
    schemaVersion: "cork.tool-result/v1",
    tool: input.tool,
    variant: input.variant,
    state: resultState(data),
    data,
    warnings: [],
    provenance: {
      source:
        input.targetTool === undefined
          ? "canonical-local"
          : "canonical-gateway",
      environment: input.environment,
      ...(input.targetTool === undefined
        ? {}
        : { targetTool: input.targetTool }),
      resultDigest: sha256CanonicalJson(data),
    },
  };
}

export class PublicToolRouter implements StdioToolRouter {
  readonly #internal: StdioToolRouter;

  public constructor(internal: StdioToolRouter) {
    this.#internal = internal;
  }

  #activeVariants(
    definition: PublicToolRegistryEntry,
    principal: CredentialClaims,
  ): readonly ActiveVariant[] {
    const internalTools = new Map(
      this.#internal
        .listTools(principal)
        .map((tool) => [tool.name, tool.inputSchema]),
    );
    return definition.variants.flatMap((variant): readonly ActiveVariant[] => {
      if (variant.kind === "local") {
        return principal.scopes.includes(variant.scope)
          ? [{ definition: variant, inputSchema: variant.inputSchema }]
          : [];
      }
      const inputSchema = internalTools.get(variant.targetTool);
      return inputSchema === undefined
        ? []
        : [{ definition: variant, inputSchema }];
    });
  }

  #materialize(
    definition: PublicToolRegistryEntry,
    principal: CredentialClaims,
  ): StdioToolDefinition | undefined {
    const variants = this.#activeVariants(definition, principal);
    if (variants.length === 0) return undefined;
    return {
      name: definition.name,
      description: definition.description,
      inputSchema:
        definition.inputStyle === "empty"
          ? EMPTY_SCHEMA
          : variantInputSchema(variants),
      outputSchema: PUBLIC_OUTPUT_SCHEMA,
      annotations: definition.annotations,
    };
  }

  public listTools(
    principal: CredentialClaims,
  ): readonly StdioToolDefinition[] {
    return PUBLIC_TOOL_REGISTRY.flatMap((definition) => {
      const materialized = this.#materialize(definition, principal);
      return materialized === undefined ? [] : [materialized];
    });
  }

  #capabilities(principal: CredentialClaims): JsonValue {
    return {
      schemaVersion: "cork.public-capabilities/v1",
      tools: PUBLIC_TOOL_REGISTRY.flatMap((definition) => {
        const variants = this.#activeVariants(definition, principal);
        return variants.length === 0
          ? []
          : [
              {
                name: definition.name,
                cliPath: definition.cliPath,
                variants: variants.map(({ definition: variant }) => ({
                  id: variant.id,
                  source: variant.kind,
                  ...(variant.kind === "delegated"
                    ? { targetTool: variant.targetTool }
                    : {}),
                })),
              },
            ];
      }),
      omittedCapabilityIds: CAPPED_INPUT_CAPABILITY_IDS,
      safety: {
        signingKeysHeld: false,
        transactionsBroadcast: false,
        safeConfirmationsCollected: false,
        hostedHttpTransport: false,
      },
    };
  }

  public async call(input: {
    readonly name: string;
    readonly arguments: unknown;
    readonly principal: CredentialClaims;
    readonly signal?: AbortSignal;
    readonly deadlineAtMs?: number;
  }): Promise<RouterCallResult> {
    const definition = REGISTRY_BY_NAME.get(input.name as PublicToolName);
    if (definition === undefined) {
      return publicError("UNKNOWN_TOOL", "unknown public Cork tool");
    }
    const active = this.#activeVariants(definition, input.principal);
    if (active.length === 0) {
      return publicError(
        "CAPABILITY_NOT_CALLABLE",
        "no variants are callable for this principal and runtime",
      );
    }
    if (definition.inputStyle === "empty") {
      if (!matchesSchema(input.arguments, EMPTY_SCHEMA)) {
        return publicError(
          "INVALID_INPUT",
          `${definition.name} input must be an empty closed object`,
        );
      }
    } else if (!matchesSchema(input.arguments, variantInputSchema(active))) {
      return publicError(
        "INVALID_INPUT",
        `${definition.name} input must match one callable closed variant`,
      );
    }
    const activeVariant =
      definition.inputStyle === "empty"
        ? active[0]
        : active.find(
            ({ definition: variant }) =>
              variant.id ===
              (input.arguments as Readonly<Record<string, unknown>>)["variant"],
          );
    if (activeVariant === undefined) {
      return publicError(
        "INVALID_INPUT",
        `${definition.name} variant is unknown or not callable`,
      );
    }
    const variantInput =
      definition.inputStyle === "empty"
        ? input.arguments
        : (input.arguments as Readonly<Record<string, unknown>>)["input"];
    if (!matchesSchema(variantInput, activeVariant.inputSchema)) {
      return publicError(
        "INVALID_INPUT",
        `${definition.name} input does not match the selected variant schema`,
      );
    }
    if (input.signal?.aborted === true) {
      return publicError("REQUEST_CANCELLED", "request was cancelled");
    }
    if (input.deadlineAtMs !== undefined && Date.now() >= input.deadlineAtMs) {
      return publicError("DEADLINE_EXCEEDED", "request deadline elapsed");
    }
    try {
      if (activeVariant.definition.kind === "delegated") {
        const result = await this.#internal.call({
          name: activeVariant.definition.targetTool,
          arguments: variantInput,
          principal: input.principal,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          ...(input.deadlineAtMs === undefined
            ? {}
            : { deadlineAtMs: input.deadlineAtMs }),
        });
        if (!result.ok) return result;
        return {
          ok: true,
          toolName: definition.name,
          coreResult: envelope({
            tool: definition.name,
            variant: activeVariant.definition.id,
            data: result.coreResult,
            environment: result.transportMetadata.environment,
            targetTool: activeVariant.definition.targetTool,
          }),
          transportMetadata: result.transportMetadata,
        };
      }
      const data = localResult(
        activeVariant.definition.handler,
        variantInput as Readonly<Record<string, unknown>>,
        this.#capabilities(input.principal),
      );
      if (
        input.deadlineAtMs !== undefined &&
        Date.now() >= input.deadlineAtMs
      ) {
        return publicError("DEADLINE_EXCEEDED", "request deadline elapsed");
      }
      return {
        ok: true,
        toolName: definition.name,
        coreResult: envelope({
          tool: definition.name,
          variant: activeVariant.definition.id,
          data,
          environment: input.principal.environment,
        }),
        transportMetadata: {
          principalId: input.principal.principalId,
          environment: input.principal.environment,
          scope: activeVariant.definition.scope,
        },
      };
    } catch (error: unknown) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return publicError("INVALID_INPUT", error.message);
      }
      return publicError("HANDLER_FAILED", "public tool handler failed closed");
    }
  }
}
