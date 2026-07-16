import type { HostedScope, WorkCost } from "./controls.js";

type JsonPrimitiveType = "string" | "number" | "boolean" | "object" | "array";

interface JsonPropertySchema {
  readonly type: JsonPrimitiveType;
  readonly enum?: readonly (string | number | boolean)[];
  readonly items?: JsonPropertySchema;
  readonly properties?: Readonly<Record<string, JsonPropertySchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

interface ClosedInputSchema {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Readonly<Record<string, JsonPropertySchema>>;
  readonly required?: readonly string[];
}

const EXACT_SPEND_PROFILES = [
  {
    key: "exact-mint-collateral-in",
    toolPrefix: "cork.phoenix.mint.collateral-in",
    capabilityId: "cork.phoenix.mint.collateral-in.v1",
    label: "mint collateral-in",
  },
  {
    key: "exact-mint-paired-shares-out",
    toolPrefix: "cork.phoenix.mint.paired-shares-out",
    capabilityId: "cork.phoenix.mint.paired-shares-out.v1",
    label: "mint paired-shares-out",
  },
  {
    key: "exact-repurchase-collateral-in-for-swap",
    toolPrefix: "cork.phoenix.repurchase.collateral-in-for-swap",
    capabilityId: "cork.phoenix.repurchase.collateral-in-for-swap.v1",
    label: "repurchase collateral-in-for-swap",
  },
  {
    key: "exact-unwind-collateral-out",
    toolPrefix: "cork.phoenix.unwind.collateral-out",
    capabilityId: "cork.phoenix.unwind.collateral-out.v1",
    label: "unwind collateral-out",
  },
  {
    key: "exact-redeem-principal-token-in",
    toolPrefix: "cork.phoenix.redeem.principal-token-in",
    capabilityId: "cork.phoenix.redeem.principal-token-in.v1",
    label: "redeem principal-token-in",
  },
] as const;

type ExactSpendProfileKey = (typeof EXACT_SPEND_PROFILES)[number]["key"];
type ExactSpendLifecycle = "prepare" | "finalize" | "simulate" | "reconcile";
export type ExactSpendHandlerKey =
  `${ExactSpendProfileKey}-${ExactSpendLifecycle}`;

export type LimitOrderHandlerKey =
  | "limit-order-maker-prepare"
  | "limit-order-maker-finalize"
  | "limit-order-submit"
  | "limit-order-taker-prepare"
  | "limit-order-cancel-prepare"
  | "limit-order-allowance-revoke-prepare"
  | "limit-order-reconcile";

export type MarketDeploymentHandlerKey =
  | "market-deployment-quote"
  | "market-deployment-prepare"
  | "market-deployment-simulate"
  | "market-deployment-reconcile";

export type CapabilityHandlerKey =
  | ExactSpendHandlerKey
  | LimitOrderHandlerKey
  | MarketDeploymentHandlerKey;

export interface CapabilityToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly scope: HostedScope;
  readonly inputSchema: ClosedInputSchema;
  readonly costProfile: WorkCost;
  readonly handlerKey: CapabilityHandlerKey;
  readonly capabilityId: string;
}

const STRING: JsonPropertySchema = { type: "string" };

function closedSchema(
  properties: Readonly<Record<string, JsonPropertySchema>>,
  required: readonly string[],
): ClosedInputSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function canonicalJsonEnvelope(): JsonPropertySchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      canonicalJson: STRING,
    },
    required: ["canonicalJson"],
  };
}

const ARTIFACT = canonicalJsonEnvelope();

const WRITE_COST: WorkCost = {
  concurrency: 1,
  upstream: 2,
  simulation: 0,
  queue: 1,
  responseBytes: 500_000,
  total: 5,
};

const VERIFY_COST: WorkCost = {
  concurrency: 1,
  upstream: 2,
  simulation: 0,
  queue: 1,
  responseBytes: 500_000,
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

const SUBMISSION_COST: WorkCost = {
  concurrency: 1,
  upstream: 1,
  simulation: 0,
  queue: 2,
  responseBytes: 500_000,
  total: 7,
};

const MARKET_COST: WorkCost = {
  concurrency: 1,
  upstream: 2,
  simulation: 0,
  queue: 1,
  responseBytes: 1_000_000,
  total: 6,
};

function exactSpendTools(
  profile: (typeof EXACT_SPEND_PROFILES)[number],
): readonly CapabilityToolDefinition[] {
  return [
    {
      name: `${profile.toolPrefix}.prepare.v1`,
      description: `Prepare the evidence-bound ${profile.label} exact-spend action.`,
      scope: "exact-spend:write",
      inputSchema: closedSchema(
        {
          intent: ARTIFACT,
          evidenceRoots: ARTIFACT,
          observations: ARTIFACT,
        },
        ["intent", "evidenceRoots", "observations"],
      ),
      costProfile: WRITE_COST,
      handlerKey: `${profile.key}-prepare`,
      capabilityId: profile.capabilityId,
    },
    {
      name: `${profile.toolPrefix}.finalize.v1`,
      description: `Reconstruct and freeze the ${profile.label} exact-spend action.`,
      scope: "exact-spend:write",
      inputSchema: closedSchema(
        {
          prepared: ARTIFACT,
          evidenceRoots: ARTIFACT,
          authorizationEvidence: ARTIFACT,
        },
        ["prepared", "evidenceRoots", "authorizationEvidence"],
      ),
      costProfile: VERIFY_COST,
      handlerKey: `${profile.key}-finalize`,
      capabilityId: profile.capabilityId,
    },
    {
      name: `${profile.toolPrefix}.simulate.v1`,
      description: `Advisorially simulate unchanged ${profile.label} execution bytes.`,
      scope: "exact-spend:simulate",
      inputSchema: closedSchema(
        {
          finalized: ARTIFACT,
          simulationOutcome: ARTIFACT,
        },
        ["finalized", "simulationOutcome"],
      ),
      costProfile: SIMULATION_COST,
      handlerKey: `${profile.key}-simulate`,
      capabilityId: profile.capabilityId,
    },
    {
      name: `${profile.toolPrefix}.reconcile.v1`,
      description: `Reconcile ${profile.label} against authoritative chain evidence.`,
      scope: "exact-spend:reconcile",
      inputSchema: closedSchema(
        {
          finalized: ARTIFACT,
          evidenceRoots: ARTIFACT,
          chainEvidence: ARTIFACT,
        },
        ["finalized", "evidenceRoots", "chainEvidence"],
      ),
      costProfile: VERIFY_COST,
      handlerKey: `${profile.key}-reconcile`,
      capabilityId: profile.capabilityId,
    },
  ];
}

export const EXACT_SPEND_TOOL_CATALOG =
  EXACT_SPEND_PROFILES.flatMap(exactSpendTools);

const LIMIT_ORDER_CAPABILITY = "cork.phoenix.limitOrders.v1";

export const LIMIT_ORDER_TOOL_CATALOG = [
  {
    name: "cork.phoenix.limitOrders.maker.prepare.v1",
    description: "Prepare an evidence-bound source-faithful 1inch maker order.",
    scope: "limit-orders:write",
    inputSchema: closedSchema(
      {
        intent: ARTIFACT,
        deploymentEvidence: ARTIFACT,
        inventory: ARTIFACT,
        identityState: ARTIFACT,
      },
      ["intent", "deploymentEvidence", "inventory", "identityState"],
    ),
    costProfile: WRITE_COST,
    handlerKey: "limit-order-maker-prepare",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
  {
    name: "cork.phoenix.limitOrders.maker.finalize.v1",
    description: "Reconstruct and finalize a caller-signed 1inch maker order.",
    scope: "limit-orders:write",
    inputSchema: closedSchema(
      {
        prepared: ARTIFACT,
        deploymentEvidence: ARTIFACT,
        signature: STRING,
      },
      ["prepared", "deploymentEvidence", "signature"],
    ),
    costProfile: VERIFY_COST,
    handlerKey: "limit-order-maker-finalize",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
  {
    name: "cork.phoenix.limitOrders.submit.v1",
    description:
      "Durably submit a verified signed order with byte-stable idempotency.",
    scope: "signed-orders:submit",
    inputSchema: closedSchema(
      {
        clientRequestId: STRING,
        finalizedOrder: ARTIFACT,
      },
      ["clientRequestId", "finalizedOrder"],
    ),
    costProfile: SUBMISSION_COST,
    handlerKey: "limit-order-submit",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
  {
    name: "cork.phoenix.limitOrders.taker.prepare.v1",
    description:
      "Prepare an exact 1inch taker fill or classic allowance prerequisite.",
    scope: "limit-orders:write",
    inputSchema: closedSchema(
      {
        intent: ARTIFACT,
        deploymentEvidence: ARTIFACT,
      },
      ["intent", "deploymentEvidence"],
    ),
    costProfile: WRITE_COST,
    handlerKey: "limit-order-taker-prepare",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
  {
    name: "cork.phoenix.limitOrders.cancel.prepare.v1",
    description:
      "Prepare exact per-order cancellation or one-bit invalidation bytes.",
    scope: "limit-orders:write",
    inputSchema: closedSchema(
      {
        signedOrder: ARTIFACT,
        deploymentEvidence: ARTIFACT,
        mode: {
          type: "string",
          enum: ["order-cancel", "bit-invalidate"],
        },
        currentInvalidatorRaw: STRING,
      },
      ["signedOrder", "deploymentEvidence", "mode", "currentInvalidatorRaw"],
    ),
    costProfile: WRITE_COST,
    handlerKey: "limit-order-cancel-prepare",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
  {
    name: "cork.phoenix.limitOrders.allowance.revoke.prepare.v1",
    description: "Prepare manifest-derived classic 1inch allowance revocation.",
    scope: "limit-orders:write",
    inputSchema: closedSchema(
      {
        market: ARTIFACT,
        owner: ARTIFACT,
        deploymentEvidence: ARTIFACT,
        role: { type: "string", enum: ["maker", "taker"] },
      },
      ["market", "owner", "deploymentEvidence", "role"],
    ),
    costProfile: WRITE_COST,
    handlerKey: "limit-order-allowance-revoke-prepare",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
  {
    name: "cork.phoenix.limitOrders.reconcile.v1",
    description:
      "Reconcile a verified signed order against service and chain evidence.",
    scope: "limit-orders:read",
    inputSchema: closedSchema(
      {
        signedOrder: ARTIFACT,
        deploymentEvidence: ARTIFACT,
        serviceEvidence: ARTIFACT,
        chainEvidence: ARTIFACT,
      },
      ["signedOrder", "deploymentEvidence", "serviceEvidence", "chainEvidence"],
    ),
    costProfile: VERIFY_COST,
    handlerKey: "limit-order-reconcile",
    capabilityId: LIMIT_ORDER_CAPABILITY,
  },
] as const satisfies readonly CapabilityToolDefinition[];

const MARKET_DEPLOYMENT_CAPABILITY = "cork.market.deploy.v1";

export const MARKET_DEPLOYMENT_TOOL_CATALOG = [
  {
    name: "cork.market.deploy.quote.v1",
    description:
      "Validate and preserve the immutable RFC 007 underwriting handoff.",
    scope: "market-deployment:write",
    inputSchema: closedSchema({ input: ARTIFACT }, ["input"]),
    costProfile: MARKET_COST,
    handlerKey: "market-deployment-quote",
    capabilityId: MARKET_DEPLOYMENT_CAPABILITY,
  },
  {
    name: "cork.market.deploy.prepare.v1",
    description:
      "Prepare the verified existing-wrapper path or two exact deployment calls.",
    scope: "market-deployment:write",
    inputSchema: closedSchema(
      {
        quote: ARTIFACT,
        deployment: ARTIFACT,
        facts: ARTIFACT,
      },
      ["quote", "deployment", "facts"],
    ),
    costProfile: MARKET_COST,
    handlerKey: "market-deployment-prepare",
    capabilityId: MARKET_DEPLOYMENT_CAPABILITY,
  },
  {
    name: "cork.market.deploy.simulate.v1",
    description:
      "Advisorially simulate every unchanged market-deployment call.",
    scope: "market-deployment:write",
    inputSchema: closedSchema(
      {
        prepared: ARTIFACT,
        calls: ARTIFACT,
        simulatedAt: STRING,
      },
      ["prepared", "calls", "simulatedAt"],
    ),
    costProfile: SIMULATION_COST,
    handlerKey: "market-deployment-simulate",
    capabilityId: MARKET_DEPLOYMENT_CAPABILITY,
  },
  {
    name: "cork.market.deploy.reconcile.v1",
    description:
      "Reconcile ordered deployment receipts with final same-block authority.",
    scope: "market-deployment:write",
    inputSchema: closedSchema(
      {
        prepared: ARTIFACT,
        quote: ARTIFACT,
        deployment: ARTIFACT,
        preparationFacts: ARTIFACT,
        finalFacts: ARTIFACT,
        receipts: ARTIFACT,
      },
      [
        "prepared",
        "quote",
        "deployment",
        "preparationFacts",
        "finalFacts",
        "receipts",
      ],
    ),
    costProfile: MARKET_COST,
    handlerKey: "market-deployment-reconcile",
    capabilityId: MARKET_DEPLOYMENT_CAPABILITY,
  },
] as const satisfies readonly CapabilityToolDefinition[];

export const CAPABILITY_TOOL_CATALOG = [
  ...EXACT_SPEND_TOOL_CATALOG,
  ...LIMIT_ORDER_TOOL_CATALOG,
  ...MARKET_DEPLOYMENT_TOOL_CATALOG,
] as const satisfies readonly CapabilityToolDefinition[];
