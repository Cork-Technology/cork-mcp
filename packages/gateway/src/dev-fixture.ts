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
import {
  STATIC_TOOL_CATALOG,
  ToolRouter,
  type HandlerKey,
  type ToolHandler,
  type ToolHandlers,
} from "./router.js";

const FIXTURE_DIGEST = `sha256:${"11".repeat(32)}` as Sha256Digest;
const FIXTURE_SOURCE_COMMIT = "22".repeat(20);

export const LOCAL_FIXTURE_NOTICE =
  "Local fixture only: no network request, signing, transaction construction, submission, or persistence occurred." as const;

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

export function createLocalFixtureInventory(): CapabilityInventoryV1 {
  const callableIds = new Set(
    STATIC_TOOL_CATALOG.flatMap((tool) =>
      tool.capabilityId === undefined ? [] : [tool.capabilityId],
    ),
  );
  const capabilities = [
    ...[...callableIds].map((capabilityId) =>
      callableFixtureCapability(capabilityId),
    ),
    ...createCappedInputCapabilityRecords(FIXTURE_DIGEST),
  ].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  return createCapabilityInventory(
    {
      packageVersion: "0.1.0-local-fixture",
      sourceCommit: FIXTURE_SOURCE_COMMIT,
      schemaDigest: FIXTURE_DIGEST,
    },
    capabilities,
  );
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

function createFixtureHandlers(inventory: CapabilityInventoryV1): ToolHandlers {
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

function createFixtureAdmissionController(): WorkAdmissionController {
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
  readonly router: ToolRouter;
}

export function createLocalFixtureGateway(): LocalFixtureGateway {
  const inventory = createLocalFixtureInventory();
  const principal = createLocalFixturePrincipal();
  return Object.freeze({
    inventory,
    principal,
    router: new ToolRouter({
      capabilityInventory: () => inventory,
      handlers: createFixtureHandlers(inventory),
      admission: createFixtureAdmissionController(),
      clock: { nowMs: () => Date.now() },
    }),
  });
}
