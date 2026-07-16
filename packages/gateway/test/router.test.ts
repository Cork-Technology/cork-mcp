import {
  CAPPED_INPUT_CAPABILITY_IDS,
  createCapabilityInventory,
  evaluateCapabilityMaturity,
  finalizeMintCollateralIn,
  quoteMarketDeployment,
  type CapabilityInventoryV1,
  type CapabilityMaturityV1,
} from "@corkprotocol/operations";
import { DirectLimitOrderLifecycleV1 } from "@corkprotocol/operations/limit-order-lifecycle";
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_TOOL_CATALOG,
  EXACT_SPEND_TOOL_CATALOG,
  LIMIT_ORDER_TOOL_CATALOG,
  MARKET_DEPLOYMENT_TOOL_CATALOG,
  STATIC_TOOL_CATALOG,
  RELEASE_CANDIDATE_ADAPTER_STATUS,
  ToolRouter,
  WorkAdmissionController,
  cappedInputToolsAreOmitted,
  startStdioServer,
  type CredentialClaims,
  type HandlerKey,
  type JsonPropertySchema,
  type ToolHandlers,
} from "../src/index.js";

const DIGEST = `sha256:${"11".repeat(32)}`;
const SOURCE_COMMIT = "22".repeat(20);

function capability(
  capabilityId: string,
  callable: boolean,
): CapabilityMaturityV1 {
  const definition = {
    capabilityId,
    version: "1",
    specified: true as const,
    commonProfileDigest: DIGEST,
    capabilityProfileDigest: DIGEST,
    vectorSetDigest: DIGEST,
  };
  return evaluateCapabilityMaturity(definition, {
    implementation: {
      commonProfileDigest: DIGEST,
      capabilityProfileDigest: DIGEST,
      vectorSetDigest: DIGEST,
    },
    ...(callable
      ? {
          operatorIntent: { deploymentId: "deployment-a", generation: "1" },
          evidence: {
            deploymentId: "deployment-a",
            generation: "1",
            status: "active" as const,
          },
        }
      : {}),
    healthy: callable,
  });
}

function inventory(nonCallable: readonly string[] = []): CapabilityInventoryV1 {
  const ids = new Set(
    STATIC_TOOL_CATALOG.flatMap((tool) =>
      tool.capabilityId === undefined ? [] : [tool.capabilityId],
    ),
  );
  for (const id of CAPPED_INPUT_CAPABILITY_IDS) {
    ids.add(id);
  }
  return createCapabilityInventory(
    {
      packageVersion: "0.1.0",
      sourceCommit: SOURCE_COMMIT,
      schemaDigest: DIGEST,
    },
    [...ids].map((id) =>
      capability(
        id,
        !nonCallable.includes(id) &&
          !CAPPED_INPUT_CAPABILITY_IDS.includes(
            id as (typeof CAPPED_INPUT_CAPABILITY_IDS)[number],
          ),
      ),
    ),
  );
}

const PRINCIPAL: CredentialClaims = {
  credentialId: "credential-a",
  principalId: "principal-a",
  ownerId: "owner-a",
  environment: "test",
  trafficClass: "public",
  scopes: [
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
  ],
  issuedAtMs: 0,
  revocationId: "revocation-a",
};

function admission(globalTotal = 1_000): WorkAdmissionController {
  return new WorkAdmissionController({
    perPrincipal: {
      concurrency: 100,
      upstream: 100,
      simulation: 100,
      queue: 100,
      responseBytes: 100_000_000,
      total: globalTotal,
    },
    global: {
      concurrency: 100,
      upstream: 100,
      simulation: 100,
      queue: 100,
      responseBytes: 100_000_000,
      total: globalTotal,
    },
    firstPartyReserve: {
      concurrency: 1,
      upstream: 1,
      simulation: 1,
      queue: 1,
    },
  });
}

function handlers(
  implementation: (
    key: HandlerKey,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<unknown> = async (key, input) => ({ key, input }),
): ToolHandlers {
  return Object.fromEntries(
    STATIC_TOOL_CATALOG.map((tool) => [
      tool.handlerKey,
      (input: Readonly<Record<string, unknown>>) =>
        implementation(tool.handlerKey, input),
    ]),
  ) as unknown as ToolHandlers;
}

function router(input?: {
  readonly nonCallable?: readonly string[];
  readonly handlers?: ToolHandlers;
  readonly admission?: WorkAdmissionController;
  readonly nowMs?: () => number;
}): ToolRouter {
  return new ToolRouter({
    capabilityInventory: () => inventory(input?.nonCallable),
    handlers: input?.handlers ?? handlers(),
    admission: input?.admission ?? admission(),
    clock: { nowMs: input?.nowMs ?? (() => 100) },
  });
}

const EXACT_SPEND_PROFILE_TOOLS = [
  {
    prefix: "cork.phoenix.mint.collateral-in",
    capabilityId: "cork.phoenix.mint.collateral-in.v1",
  },
  {
    prefix: "cork.phoenix.mint.paired-shares-out",
    capabilityId: "cork.phoenix.mint.paired-shares-out.v1",
  },
  {
    prefix: "cork.phoenix.repurchase.collateral-in-for-swap",
    capabilityId: "cork.phoenix.repurchase.collateral-in-for-swap.v1",
  },
  {
    prefix: "cork.phoenix.unwind.collateral-out",
    capabilityId: "cork.phoenix.unwind.collateral-out.v1",
  },
  {
    prefix: "cork.phoenix.redeem.principal-token-in",
    capabilityId: "cork.phoenix.redeem.principal-token-in.v1",
  },
] as const;

const REQUIRED_NEW_TOOL_NAMES = [
  ...EXACT_SPEND_PROFILE_TOOLS.flatMap(({ prefix }) =>
    ["prepare", "finalize", "simulate", "reconcile"].map(
      (lifecycle) => `${prefix}.${lifecycle}.v1`,
    ),
  ),
  "cork.phoenix.limitOrders.maker.prepare.v1",
  "cork.phoenix.limitOrders.maker.finalize.v1",
  "cork.phoenix.limitOrders.submit.v1",
  "cork.phoenix.limitOrders.taker.prepare.v1",
  "cork.phoenix.limitOrders.cancel.prepare.v1",
  "cork.phoenix.limitOrders.allowance.revoke.prepare.v1",
  "cork.phoenix.limitOrders.reconcile.v1",
  "cork.market.deploy.quote.v1",
  "cork.market.deploy.prepare.v1",
  "cork.market.deploy.simulate.v1",
  "cork.market.deploy.reconcile.v1",
] as const;

function expectEveryObjectSchemaClosed(schema: JsonPropertySchema): void {
  if (schema.type === "object") {
    expect(schema.additionalProperties).toBe(false);
    for (const property of Object.values(schema.properties ?? {})) {
      expectEveryObjectSchemaClosed(property);
    }
  }
  if (schema.type === "array" && schema.items !== undefined) {
    expectEveryObjectSchemaClosed(schema.items);
  }
}

describe("ToolRouter catalog and filtering", () => {
  it("contains only static named tools and omits all capped-input and generic surfaces", () => {
    expect(cappedInputToolsAreOmitted()).toBe(true);
    expect(new Set(STATIC_TOOL_CATALOG.map((tool) => tool.name)).size).toBe(
      STATIC_TOOL_CATALOG.length,
    );
    for (const tool of STATIC_TOOL_CATALOG) {
      expect(tool.name.startsWith("cork.")).toBe(true);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.handlerKey.length).toBeGreaterThan(0);
      expect(tool.costProfile.total).toBeGreaterThan(0);
      expect(tool.name).not.toMatch(
        /generic|proxy|arbitrary|contract|selector|profile\.select/,
      );
    }
    for (const capped of CAPPED_INPUT_CAPABILITY_IDS) {
      expect(
        STATIC_TOOL_CATALOG.some((tool) => tool.name.startsWith(capped)),
      ).toBe(false);
    }
  });

  it("registers every required complete lifecycle exactly once with local scopes and capabilities", () => {
    expect(CAPABILITY_TOOL_CATALOG).toHaveLength(31);
    expect(EXACT_SPEND_TOOL_CATALOG).toHaveLength(20);
    expect(LIMIT_ORDER_TOOL_CATALOG).toHaveLength(7);
    expect(MARKET_DEPLOYMENT_TOOL_CATALOG).toHaveLength(4);
    expect(CAPABILITY_TOOL_CATALOG.map((tool) => tool.name).sort()).toEqual(
      [...REQUIRED_NEW_TOOL_NAMES].sort(),
    );

    const allNames = STATIC_TOOL_CATALOG.map((tool) => tool.name);
    for (const name of REQUIRED_NEW_TOOL_NAMES) {
      expect(allNames.filter((candidate) => candidate === name)).toHaveLength(
        1,
      );
    }
    for (const profile of EXACT_SPEND_PROFILE_TOOLS) {
      for (const lifecycle of [
        "prepare",
        "finalize",
        "simulate",
        "reconcile",
      ] as const) {
        const tool = STATIC_TOOL_CATALOG.find(
          (candidate) => candidate.name === `${profile.prefix}.${lifecycle}.v1`,
        );
        expect(tool?.capabilityId).toBe(profile.capabilityId);
        expect(tool?.scope).toBe(
          lifecycle === "simulate"
            ? "exact-spend:simulate"
            : lifecycle === "reconcile"
              ? "exact-spend:reconcile"
              : "exact-spend:write",
        );
      }
    }
    for (const tool of LIMIT_ORDER_TOOL_CATALOG) {
      expect(tool.capabilityId).toBe("cork.phoenix.limitOrders.v1");
      expect(tool.scope).toBe(
        tool.name.endsWith(".submit.v1")
          ? "signed-orders:submit"
          : tool.name.endsWith(".reconcile.v1")
            ? "limit-orders:read"
            : "limit-orders:write",
      );
    }
    for (const tool of MARKET_DEPLOYMENT_TOOL_CATALOG) {
      expect(tool.capabilityId).toBe("cork.market.deploy.v1");
      expect(tool.scope).toBe("market-deployment:write");
    }
  });

  it("keeps every object schema closed and every tool cost finite and nonzero", () => {
    for (const tool of STATIC_TOOL_CATALOG) {
      expectEveryObjectSchemaClosed(tool.inputSchema);
      expect(Number.isSafeInteger(tool.costProfile.total)).toBe(true);
      expect(tool.costProfile.total).toBeGreaterThan(0);
      for (const value of Object.values(tool.costProfile)) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("filters listing by hosted scope and canonical capability callability", () => {
    const principal: CredentialClaims = {
      ...PRINCIPAL,
      scopes: ["capabilities:read", "phoenix:read"],
    };
    const result = router({
      nonCallable: ["cork.phoenix.flows.list.v1"],
    }).listTools(principal);
    expect(result.map((tool) => tool.name)).toContain("cork.capabilities.v1");
    expect(result.map((tool) => tool.name)).toContain(
      "cork.phoenix.pools.list.v1",
    );
    expect(result.map((tool) => tool.name)).not.toContain(
      "cork.phoenix.flows.list.v1",
    );
    expect(result.every((tool) => principal.scopes.includes(tool.scope))).toBe(
      true,
    );
  });

  it("omits every tool for a non-callable lifecycle while discovery retains its record", async () => {
    const capabilityId = "cork.phoenix.mint.collateral-in.v1";
    const canonical = inventory([capabilityId]);
    const hosted = router({
      nonCallable: [capabilityId],
      handlers: handlers(async (key) =>
        key === "capability-inventory" ? canonical : null,
      ),
    });
    expect(
      hosted
        .listTools(PRINCIPAL)
        .some((tool) => tool.capabilityId === capabilityId),
    ).toBe(false);
    const result = await hosted.call({
      name: "cork.capabilities.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const record = (
        result.coreResult as CapabilityInventoryV1
      ).capabilities.find(
        (capability) => capability.capabilityId === capabilityId,
      );
      expect(record).toMatchObject({ capabilityId, callable: false });
    }
  });

  it("keeps capped records visible only through injected capability discovery", async () => {
    const canonical = inventory();
    const customHandlers = handlers(async (key) =>
      key === "capability-inventory" ? canonical : null,
    );
    const result = await router({ handlers: customHandlers }).call({
      name: "cork.capabilities.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const discovered = result.coreResult as CapabilityInventoryV1;
      expect(
        CAPPED_INPUT_CAPABILITY_IDS.every((id) =>
          discovered.capabilities.some(
            (record) => record.capabilityId === id && !record.callable,
          ),
        ),
      ).toBe(true);
    }
  });
});

describe("ToolRouter calls", () => {
  it("routes exact input only through the injected handler", async () => {
    let captured: unknown;
    const customHandlers = handlers(async (key, input) => {
      captured = { key, input };
      return { raw: "observation" };
    });
    const result = await router({ handlers: customHandlers }).call({
      name: "cork.phoenix.pools.list.v1",
      arguments: { chainId: 1, maxPages: 2, maxItems: 10 },
      principal: PRINCIPAL,
    });
    expect(result.ok).toBe(true);
    expect(captured).toEqual({
      key: "phoenix-pools",
      input: { chainId: 1, maxPages: 2, maxItems: 10 },
    });
    if (result.ok) {
      expect(result.coreResult).toEqual({ raw: "observation" });
    }
  });

  it("returns the exact injected canonical result and executable bytes for every new family", async () => {
    const canonicalResults = {
      "exact-mint-collateral-in-finalize": {
        lifecycle: "exact-spend",
        execution: { calldata: "0x1234", payloadDigest: "keccak256:exact" },
      },
      "limit-order-taker-prepare": {
        lifecycle: "limit-order",
        transaction: { data: "0x5678", dataDigest: "keccak256:order" },
      },
      "market-deployment-prepare": {
        lifecycle: "market-deployment",
        transactions: [{ data: "0x9abc", dataDigest: "keccak256:market" }],
      },
    } as const;
    const customHandlers = handlers(async (key) => {
      const result = canonicalResults[key as keyof typeof canonicalResults];
      return result ?? { key };
    });
    const artifact = (canonicalJson: string) => ({ canonicalJson });
    const cases = [
      {
        name: "cork.phoenix.mint.collateral-in.finalize.v1",
        arguments: {
          prepared: artifact('{"bundlerData":"0x1234"}'),
          evidenceRoots: artifact('{"generation":"1"}'),
          authorizationEvidence: artifact('{"verified":true}'),
        },
        handlerKey: "exact-mint-collateral-in-finalize",
      },
      {
        name: "cork.phoenix.limitOrders.taker.prepare.v1",
        arguments: {
          intent: artifact('{"signedOrder":{"bytes":"0x5678"}}'),
          deploymentEvidence: artifact('{"generation":"1"}'),
        },
        handlerKey: "limit-order-taker-prepare",
      },
      {
        name: "cork.market.deploy.prepare.v1",
        arguments: {
          quote: artifact('{"quoteDigest":"sha256:quote"}'),
          deployment: artifact('{"registryData":"0x9abc"}'),
          facts: artifact('{"blockNumber":"100"}'),
        },
        handlerKey: "market-deployment-prepare",
      },
    ] as const;
    for (const item of cases) {
      const result = await router({ handlers: customHandlers }).call({
        name: item.name,
        arguments: item.arguments,
        principal: PRINCIPAL,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.coreResult).toBe(
          canonicalResults[item.handlerKey as keyof typeof canonicalResults],
        );
      }
    }
    expect(JSON.stringify(canonicalResults)).toContain("0x1234");
    expect(JSON.stringify(canonicalResults)).toContain("0x5678");
    expect(JSON.stringify(canonicalResults)).toContain("0x9abc");
  });

  it("exposes every direct lifecycle through supported package exports", () => {
    expect(typeof finalizeMintCollateralIn).toBe("function");
    expect(typeof DirectLimitOrderLifecycleV1).toBe("function");
    expect(typeof quoteMarketDeployment).toBe("function");
  });

  it("returns closed errors for unknown, scope, callability, invalid input, and handler failure", async () => {
    const unknown = await router().call({
      name: "cork.proxy.call.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(unknown).toEqual({
      ok: false,
      error: { code: "UNKNOWN_TOOL", message: "unknown hosted tool" },
    });

    const denied = await router().call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {},
      principal: { ...PRINCIPAL, scopes: ["capabilities:read"] },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe("AUTHENTICATION_SCOPE_DENIED");
    }

    const unavailable = await router({
      nonCallable: ["cork.phoenix.pools.list.v1"],
    }).call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.error.code).toBe("CAPABILITY_NOT_CALLABLE");
    }

    const invalid = await router().call({
      name: "cork.phoenix.pools.list.v1",
      arguments: { host: "https://attacker.example" },
      principal: PRINCIPAL,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe("INVALID_INPUT");
    }

    const failed = await router({
      handlers: handlers(async () => {
        throw new Error("secret handler detail");
      }),
    }).call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(failed).toEqual({
      ok: false,
      error: {
        code: "HANDLER_FAILED",
        message: "injected operation handler failed",
      },
    });
  });

  it("handles cancellation, deadlines, and bounded-work rejection with deterministic release", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await router().call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {},
      principal: PRINCIPAL,
      signal: controller.signal,
    });
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.error.code).toBe("REQUEST_CANCELLED");
    }

    const deadline = await router().call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {},
      principal: PRINCIPAL,
      deadlineAtMs: 100,
    });
    expect(deadline.ok).toBe(false);
    if (!deadline.ok) {
      expect(deadline.error.code).toBe("DEADLINE_EXCEEDED");
    }

    const limited = admission(1);
    const bounded = await router({ admission: limited }).call({
      name: "cork.phoenix.pools.list.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(bounded.ok).toBe(false);
    if (!bounded.ok) {
      expect(bounded.error.code).toBe("BOUNDED_WORK_REJECTED");
    }
    expect(limited.snapshot().global.total).toBe(0);
  });
});

describe("protocol adapters", () => {
  it("wires the stable adapter through an injected SDK loader without an installed SDK", async () => {
    const listSchema = { kind: "list" };
    const callSchema = { kind: "call" };
    const registered = new Map<
      unknown,
      (request: {
        readonly params?: {
          readonly name?: unknown;
          readonly arguments?: unknown;
        };
      }) => Promise<unknown>
    >();
    let connected = false;
    class FakeServer {
      public constructor(_info: unknown, _options: unknown) {}

      public setRequestHandler(
        schema: unknown,
        handler: (request: {
          readonly params?: {
            readonly name?: unknown;
            readonly arguments?: unknown;
          };
        }) => Promise<unknown>,
      ): void {
        registered.set(schema, handler);
      }

      public async connect(_transport: unknown): Promise<void> {
        connected = true;
      }
    }
    class FakeTransport {}

    await startStdioServer({
      router: router(),
      principal: PRINCIPAL,
      loader: {
        load: async () => ({
          Server: FakeServer,
          StdioServerTransport: FakeTransport,
          ListToolsRequestSchema: listSchema,
          CallToolRequestSchema: callSchema,
        }),
      },
    });
    expect(connected).toBe(true);
    const listed = await registered.get(listSchema)?.({});
    expect(JSON.stringify(listed)).toContain("cork.capabilities.v1");
    expect(JSON.stringify(listed)).toContain(
      "cork.phoenix.mint.collateral-in.prepare.v1",
    );
    expect(JSON.stringify(listed)).toContain(
      "cork.phoenix.limitOrders.submit.v1",
    );
    expect(JSON.stringify(listed)).toContain("cork.market.deploy.quote.v1");
    const called = await registered.get(callSchema)?.({
      params: {
        name: "cork.market.deploy.quote.v1",
        arguments: {
          input: { canonicalJson: '{"handoff":{"bytes":"0x1234"}}' },
        },
      },
    });
    expect(JSON.stringify(called)).toContain('"isError":false');
    expect(JSON.stringify(called)).toContain("market-deployment-quote");
  });

  it("keeps the exact unpublished release-candidate adapter fail closed", () => {
    expect(RELEASE_CANDIDATE_ADAPTER_STATUS).toEqual({
      available: false,
      requiredVersion: "2.0.0-beta.4",
      code: "RELEASE_CANDIDATE_SDK_UNPUBLISHED",
      message:
        "The exact @modelcontextprotocol/sdk 2.0.0-beta.4 release is unpublished; no substitute adapter is permitted.",
    });
  });
});
