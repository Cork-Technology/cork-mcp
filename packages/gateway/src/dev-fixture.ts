import {
  createCappedInputCapabilityRecords,
  createCapabilityInventory,
  evaluateCapabilityMaturity,
  type CapabilityInventoryV1,
  type CapabilityMaturityV1,
  type Sha256Digest,
} from "@corkprotocol/operations";
import {
  WorkAdmissionController,
  type CredentialClaims,
  type HostedScope,
} from "./controls.js";
import { LOCAL_FIXTURE_NOTICE } from "./dev-constants.js";
import {
  LOCAL_SAFE_COVERAGE_TOOL,
  prepareLocalSafeCoverage,
} from "./dev-safe-coverage.js";
import {
  LOCAL_SAFE_TOOL_CATALOG,
  findLocalSafeTool,
  listLocalFixtureMarkets,
  prepareLocalSafeUnwind,
  type LocalSafeToolDefinition,
} from "./dev-safe-fixture.js";
import {
  STATIC_TOOL_CATALOG,
  ToolRouter,
  type HandlerKey,
  type RouterCallResult,
  type RouterErrorCode,
  type ToolDefinition,
  type ToolHandler,
  type ToolHandlers,
} from "./router.js";

const FIXTURE_DIGEST = `sha256:${"11".repeat(32)}` as Sha256Digest;
const FIXTURE_SOURCE_COMMIT = "22".repeat(20);
const LIVE_READ_HANDLER_KEYS = new Set<HandlerKey>([
  "phoenix-pools",
  "phoenix-pool-whitelists",
  "phoenix-flows",
  "phoenix-limit-order-markets",
  "phoenix-limit-order-orderbook",
  "phoenix-limit-order-fills",
]);

export { LOCAL_FIXTURE_NOTICE } from "./dev-constants.js";

function callableFixtureCapability(capabilityId: string): CapabilityMaturityV1 {
  const definition = {
    capabilityId,
    version: "1",
    specified: true as const,
    commonProfileDigest: FIXTURE_DIGEST,
    capabilityProfileDigest: FIXTURE_DIGEST,
    vectorSetDigest: FIXTURE_DIGEST,
  };
  return evaluateCapabilityMaturity(definition, {
    implementation: {
      commonProfileDigest: FIXTURE_DIGEST,
      capabilityProfileDigest: FIXTURE_DIGEST,
      vectorSetDigest: FIXTURE_DIGEST,
    },
    operatorIntent: {
      deploymentId: "local-fixture-deployment",
      generation: "1",
    },
    evidence: {
      deploymentId: "local-fixture-deployment",
      generation: "1",
      status: "active" as const,
    },
    healthy: true,
  });
}

function unavailableFixtureCapability(
  capabilityId: string,
): CapabilityMaturityV1 {
  const definition = {
    capabilityId,
    version: "1",
    specified: true as const,
    commonProfileDigest: FIXTURE_DIGEST,
    capabilityProfileDigest: FIXTURE_DIGEST,
    vectorSetDigest: FIXTURE_DIGEST,
  };
  return evaluateCapabilityMaturity(definition, { healthy: false });
}

function createFixtureInventory(input: {
  readonly packageVersion: string;
  readonly callableCapabilityIds: ReadonlySet<string>;
}): CapabilityInventoryV1 {
  const capabilityIds = new Set(
    STATIC_TOOL_CATALOG.flatMap((tool) =>
      tool.capabilityId === undefined ? [] : [tool.capabilityId],
    ),
  );
  const capabilities = [
    ...[...capabilityIds].map((capabilityId) =>
      input.callableCapabilityIds.has(capabilityId)
        ? callableFixtureCapability(capabilityId)
        : unavailableFixtureCapability(capabilityId),
    ),
    ...createCappedInputCapabilityRecords(FIXTURE_DIGEST),
  ].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  return createCapabilityInventory(
    {
      packageVersion: input.packageVersion,
      sourceCommit: FIXTURE_SOURCE_COMMIT,
      schemaDigest: FIXTURE_DIGEST,
    },
    capabilities,
  );
}

export function createLocalFixtureInventory(): CapabilityInventoryV1 {
  const callableIds = new Set(
    STATIC_TOOL_CATALOG.flatMap((tool) =>
      tool.capabilityId === undefined ? [] : [tool.capabilityId],
    ),
  );
  return createFixtureInventory({
    packageVersion: "0.1.0-local-fixture",
    callableCapabilityIds: callableIds,
  });
}

export function createLocalLiveReadInventory(): CapabilityInventoryV1 {
  const callableIds = new Set(
    STATIC_TOOL_CATALOG.flatMap((tool) =>
      tool.capabilityId !== undefined &&
      LIVE_READ_HANDLER_KEYS.has(tool.handlerKey)
        ? [tool.capabilityId]
        : [],
    ),
  );
  return createFixtureInventory({
    packageVersion: "0.1.0-local-live-read",
    callableCapabilityIds: callableIds,
  });
}

export function createLocalFixturePrincipal(): CredentialClaims {
  const scopes = [
    ...new Set<HostedScope>(STATIC_TOOL_CATALOG.map((tool) => tool.scope)),
  ].sort();
  return Object.freeze({
    credentialId: "local-fixture-credential",
    principalId: "local-fixture-principal",
    ownerId: "local-fixture-owner",
    environment: "local-fixture",
    trafficClass: "first-party",
    scopes,
    issuedAtMs: 0,
    revocationId: "local-fixture-revocation",
  });
}

export function createLocalLiveReadPrincipal(): CredentialClaims {
  return Object.freeze({
    credentialId: "local-live-read-credential",
    principalId: "local-live-read-principal",
    ownerId: "local-live-read-owner",
    environment: "local-live-read",
    trafficClass: "first-party",
    scopes: ["capabilities:read", "phoenix:read", "limit-orders:read"] as const,
    issuedAtMs: 0,
    revocationId: "local-live-read-revocation",
  });
}

export function createFixtureHandlers(
  inventory: CapabilityInventoryV1,
): ToolHandlers {
  const handlers = new Map<HandlerKey, ToolHandler>();
  for (const tool of STATIC_TOOL_CATALOG) {
    if (handlers.has(tool.handlerKey)) {
      continue;
    }
    const handlerKey = tool.handlerKey;
    handlers.set(handlerKey, async (input) => ({
      fixtureOnly: true,
      notice: LOCAL_FIXTURE_NOTICE,
      handler: handlerKey,
      input,
      ...(handlerKey === "capability-inventory" ? { inventory } : {}),
    }));
  }
  return Object.freeze(Object.fromEntries(handlers)) as ToolHandlers;
}

export function createFixtureAdmissionController(): WorkAdmissionController {
  return new WorkAdmissionController({
    perPrincipal: {
      concurrency: 100,
      upstream: 100,
      simulation: 100,
      queue: 100,
      responseBytes: 100_000_000,
      total: 1_000,
    },
    global: {
      concurrency: 100,
      upstream: 100,
      simulation: 100,
      queue: 100,
      responseBytes: 100_000_000,
      total: 1_000,
    },
    firstPartyReserve: {
      concurrency: 1,
      upstream: 1,
      simulation: 1,
      queue: 1,
    },
  });
}

export interface LocalFixtureGateway {
  readonly inventory: CapabilityInventoryV1;
  readonly principal: CredentialClaims;
  readonly router: LocalFixtureRouter;
}

type LocalFixtureToolDefinition = ToolDefinition | LocalSafeToolDefinition;

export const LOCAL_FIXTURE_TOOL_CATALOG: readonly LocalSafeToolDefinition[] =
  Object.freeze([...LOCAL_SAFE_TOOL_CATALOG, LOCAL_SAFE_COVERAGE_TOOL]);

function findLocalFixtureTool(
  name: string,
): LocalSafeToolDefinition | undefined {
  return (
    findLocalSafeTool(name) ??
    (LOCAL_SAFE_COVERAGE_TOOL.name === name
      ? LOCAL_SAFE_COVERAGE_TOOL
      : undefined)
  );
}

function localToolError(
  code: RouterErrorCode,
  message: string,
): RouterCallResult {
  return { ok: false, error: { code, message } };
}

export class LocalFixtureRouter {
  readonly #base: ToolRouter;

  public constructor(base: ToolRouter) {
    this.#base = base;
  }

  public listTools(
    principal: CredentialClaims,
  ): readonly LocalFixtureToolDefinition[] {
    const localTools =
      principal.environment === "local-fixture"
        ? LOCAL_FIXTURE_TOOL_CATALOG.filter((tool) =>
            principal.scopes.includes(tool.scope),
          )
        : [];
    return [...this.#base.listTools(principal), ...localTools];
  }

  public async call(input: {
    readonly name: string;
    readonly arguments: unknown;
    readonly principal: CredentialClaims;
    readonly signal?: AbortSignal;
    readonly deadlineAtMs?: number;
  }): Promise<RouterCallResult> {
    const tool = findLocalFixtureTool(input.name);
    if (tool === undefined) {
      return this.#base.call(input);
    }
    if (
      input.principal.environment !== "local-fixture" ||
      !input.principal.scopes.includes(tool.scope)
    ) {
      return localToolError(
        "AUTHENTICATION_SCOPE_DENIED",
        "credential lacks access to local fixture tools",
      );
    }
    if (input.signal?.aborted === true) {
      return localToolError("REQUEST_CANCELLED", "request was cancelled");
    }
    if (input.deadlineAtMs !== undefined && Date.now() >= input.deadlineAtMs) {
      return localToolError("DEADLINE_EXCEEDED", "request deadline elapsed");
    }
    try {
      let coreResult: unknown;
      switch (input.name) {
        case "cork.local.markets.list.v1":
          coreResult = listLocalFixtureMarkets(input.arguments);
          break;
        case "cork.local.safe.unwind.prepare.v1":
          coreResult = prepareLocalSafeUnwind(input.arguments);
          break;
        case "cork.local.safe.coverage.v1":
          coreResult = prepareLocalSafeCoverage(input.arguments);
          break;
        default:
          return localToolError("UNKNOWN_TOOL", "tool is not registered");
      }
      if (
        input.deadlineAtMs !== undefined &&
        Date.now() >= input.deadlineAtMs
      ) {
        return localToolError("DEADLINE_EXCEEDED", "request deadline elapsed");
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
    } catch (error: unknown) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return localToolError("INVALID_INPUT", error.message);
      }
      return localToolError(
        "HANDLER_FAILED",
        "local fixture transaction construction failed",
      );
    }
  }
}

export function createLocalFixtureGateway(): LocalFixtureGateway {
  const inventory = createLocalFixtureInventory();
  const principal = createLocalFixturePrincipal();
  const base = new ToolRouter({
    capabilityInventory: () => inventory,
    handlers: createFixtureHandlers(inventory),
    admission: createFixtureAdmissionController(),
    clock: { nowMs: () => Date.now() },
  });
  return Object.freeze({
    inventory,
    principal,
    router: new LocalFixtureRouter(base),
  });
}
