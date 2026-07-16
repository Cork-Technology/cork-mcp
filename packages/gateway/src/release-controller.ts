import {
  assertClosedObject,
  assertSha256Digest,
  assertUint256Decimal,
  deepFreeze,
  sha256CanonicalJson,
  validateCapabilityInventory,
  validateDirectPackageCandidate,
  verifyGenerationEvidenceRoots,
  type BrowserSignatureVerifierV1,
  type CapabilityInventoryV1,
  type DirectPackageCandidateV1,
  type JsonValue,
  type Sha256Digest,
  type VerifiedGenerationRootsV1,
} from "@corkprotocol/operations";

export interface ReleaseConformanceV1 {
  readonly schemaVersion: "cork.release-conformance/v1";
  readonly capabilityId: string;
  readonly packageName: "@corkprotocol/operations";
  readonly packagePath: string;
  readonly releaseIdentity: string;
  readonly packageArtifactDigest: Sha256Digest;
  readonly coreBuildDigest: Sha256Digest;
  readonly commonSchemaDigest: Sha256Digest;
  readonly capabilitySchemaDigest: Sha256Digest;
  readonly capabilityProfileDigest: Sha256Digest;
  readonly vectorSetDigest: Sha256Digest;
  readonly deploymentPayloadDigest: Sha256Digest;
  readonly policyRequired: boolean;
  readonly policyPayloadDigest: Sha256Digest;
  readonly rootsDigest: Sha256Digest;
  readonly conformanceDigest: Sha256Digest;
}

export interface ReleaseHealthEvidenceV1 {
  readonly schemaVersion: "cork.release-health/v1";
  readonly capabilityId: string;
  readonly producer: ReleaseHealthProducerIdentityV1;
  readonly observedAt: string;
  readonly expectedIdentity: ReleaseHealthIdentityV1;
  readonly observedIdentity: ReleaseHealthIdentityV1;
  readonly checks: readonly ReleaseHealthCheckV1[];
  readonly outcome: "healthy" | "unhealthy";
  readonly evidenceDigest: Sha256Digest;
  readonly producerProof: string;
}

export interface ReleaseHealthProducerIdentityV1 {
  readonly producerId: string;
  readonly keyId: string;
}

export interface ReleaseHealthIdentityV1 {
  readonly releaseIdentity: string;
  readonly rootsDigest: Sha256Digest;
  readonly candidateDigest: Sha256Digest;
  readonly conformanceDigest: Sha256Digest;
}

export interface ReleaseHealthCheckV1 {
  readonly checkId: string;
  readonly expectedDigest: Sha256Digest;
  readonly observedDigest: Sha256Digest;
}

export interface ReleaseHealthProducerVerificationInputV1 {
  readonly producer: ReleaseHealthProducerIdentityV1;
  readonly observedAt: string;
  readonly evidenceDigest: Sha256Digest;
  readonly producerProof: string;
}

export interface ReleaseHealthProducerVerifierV1 {
  verify(input: ReleaseHealthProducerVerificationInputV1): boolean;
}

export interface VerifiedReleaseHealthEvidenceV1 {
  readonly evidence: ReleaseHealthEvidenceV1;
  readonly healthy: boolean;
}

export interface ReleaseOperatorIntentV1 {
  readonly schemaVersion: "cork.release-operator-intent/v1";
  readonly capabilityId: string;
  readonly deploymentId: string;
  readonly deploymentGeneration: string;
  readonly deploymentPayloadDigest: Sha256Digest;
  readonly policyId: string;
  readonly policyGeneration: string;
  readonly policyPayloadDigest: Sha256Digest;
  readonly candidateDigest: Sha256Digest;
  readonly conformanceDigest: Sha256Digest;
  readonly decidedAt: string;
  readonly intentDigest: Sha256Digest;
}

export interface ReleaseOperatorIntentStore {
  get(capabilityId: string): ReleaseOperatorIntentV1 | undefined;
  put(intent: ReleaseOperatorIntentV1): void;
  clear(capabilityId: string): void;
}

export interface ReleaseCapabilityStateV1 {
  readonly capabilityId: string;
  readonly implemented: boolean;
  readonly activated: boolean;
  readonly healthy: boolean;
  readonly callable: boolean;
  readonly reason:
    | "callable"
    | "not-activated"
    | "unhealthy"
    | "generation-changed"
    | "terminal-generation";
  readonly operatorIntent?: ReleaseOperatorIntentV1;
}

export interface ReleaseControllerInputV1 {
  readonly roots: {
    readonly deployment: unknown;
    readonly policy: unknown;
  };
  readonly candidate: unknown;
  readonly conformance: ReleaseConformanceV1;
  readonly health: ReleaseHealthEvidenceV1;
}

export interface VerifiedReleaseControllerInputV1 {
  readonly roots: VerifiedGenerationRootsV1;
  readonly candidate: DirectPackageCandidateV1;
  readonly conformance: ReleaseConformanceV1;
  readonly health: VerifiedReleaseHealthEvidenceV1;
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be non-empty`);
  }
}

function validateConformance(value: unknown): ReleaseConformanceV1 {
  assertClosedObject(value, "release conformance", [
    "schemaVersion",
    "capabilityId",
    "packageName",
    "packagePath",
    "releaseIdentity",
    "packageArtifactDigest",
    "coreBuildDigest",
    "commonSchemaDigest",
    "capabilitySchemaDigest",
    "capabilityProfileDigest",
    "vectorSetDigest",
    "deploymentPayloadDigest",
    "policyRequired",
    "policyPayloadDigest",
    "rootsDigest",
    "conformanceDigest",
  ]);
  if (
    value["schemaVersion"] !== "cork.release-conformance/v1" ||
    value["packageName"] !== "@corkprotocol/operations" ||
    typeof value["policyRequired"] !== "boolean"
  ) {
    throw new TypeError("release conformance identity is invalid");
  }
  for (const field of [
    "capabilityId",
    "packagePath",
    "releaseIdentity",
  ] as const) {
    nonEmpty(value[field], field);
  }
  for (const field of [
    "packageArtifactDigest",
    "coreBuildDigest",
    "commonSchemaDigest",
    "capabilitySchemaDigest",
    "capabilityProfileDigest",
    "vectorSetDigest",
    "deploymentPayloadDigest",
    "policyPayloadDigest",
    "rootsDigest",
    "conformanceDigest",
  ] as const) {
    assertSha256Digest(value[field], field);
  }
  const withoutDigest = { ...value } as Record<string, unknown>;
  delete withoutDigest["conformanceDigest"];
  if (
    sha256CanonicalJson(withoutDigest as JsonValue) !==
    value["conformanceDigest"]
  ) {
    throw new TypeError("release conformance digest does not match");
  }
  return value as unknown as ReleaseConformanceV1;
}

function validateHealthIdentity(
  value: unknown,
  label: string,
): ReleaseHealthIdentityV1 {
  assertClosedObject(value, label, [
    "releaseIdentity",
    "rootsDigest",
    "candidateDigest",
    "conformanceDigest",
  ]);
  nonEmpty(value["releaseIdentity"], `${label}.releaseIdentity`);
  for (const field of [
    "rootsDigest",
    "candidateDigest",
    "conformanceDigest",
  ] as const) {
    assertSha256Digest(value[field], `${label}.${field}`);
  }
  return value as unknown as ReleaseHealthIdentityV1;
}

function validateHealth(
  value: unknown,
  verifier: ReleaseHealthProducerVerifierV1,
): VerifiedReleaseHealthEvidenceV1 {
  assertClosedObject(value, "release health", [
    "schemaVersion",
    "capabilityId",
    "producer",
    "observedAt",
    "expectedIdentity",
    "observedIdentity",
    "checks",
    "outcome",
    "evidenceDigest",
    "producerProof",
  ]);
  if (
    value["schemaVersion"] !== "cork.release-health/v1" ||
    (value["outcome"] !== "healthy" && value["outcome"] !== "unhealthy")
  ) {
    throw new TypeError("release health evidence is invalid");
  }
  nonEmpty(value["capabilityId"], "health.capabilityId");
  assertClosedObject(value["producer"], "health.producer", [
    "producerId",
    "keyId",
  ]);
  nonEmpty(value["producer"]["producerId"], "health.producer.producerId");
  nonEmpty(value["producer"]["keyId"], "health.producer.keyId");
  assertUint256Decimal(value["observedAt"], "health.observedAt");
  const expectedIdentity = validateHealthIdentity(
    value["expectedIdentity"],
    "health.expectedIdentity",
  );
  const observedIdentity = validateHealthIdentity(
    value["observedIdentity"],
    "health.observedIdentity",
  );
  if (!Array.isArray(value["checks"]) || value["checks"].length === 0) {
    throw new TypeError("health.checks must be a non-empty array");
  }
  const checkIds = new Set<string>();
  const checks = value["checks"].map((check, index) => {
    const label = `health.checks[${index}]`;
    assertClosedObject(check, label, [
      "checkId",
      "expectedDigest",
      "observedDigest",
    ]);
    nonEmpty(check["checkId"], `${label}.checkId`);
    if (checkIds.has(check["checkId"])) {
      throw new TypeError("health check identifiers must be unique");
    }
    checkIds.add(check["checkId"]);
    assertSha256Digest(check["expectedDigest"], `${label}.expectedDigest`);
    assertSha256Digest(check["observedDigest"], `${label}.observedDigest`);
    return check as unknown as ReleaseHealthCheckV1;
  });
  assertSha256Digest(value["evidenceDigest"], "health.evidenceDigest");
  nonEmpty(value["producerProof"], "health.producerProof");
  const projection = {
    schemaVersion: "cork.release-health/v1" as const,
    capabilityId: value["capabilityId"],
    producer: value["producer"] as unknown as ReleaseHealthProducerIdentityV1,
    observedAt: value["observedAt"],
    expectedIdentity,
    observedIdentity,
    checks,
    outcome: value["outcome"],
  };
  if (
    sha256CanonicalJson(projection as unknown as JsonValue) !==
    value["evidenceDigest"]
  ) {
    throw new TypeError("release health evidence digest does not match");
  }
  const evidence = deepFreeze({
    ...projection,
    evidenceDigest: value["evidenceDigest"],
    producerProof: value["producerProof"],
  }) as ReleaseHealthEvidenceV1;
  if (
    verifier.verify({
      producer: evidence.producer,
      observedAt: evidence.observedAt,
      evidenceDigest: evidence.evidenceDigest,
      producerProof: evidence.producerProof,
    }) !== true
  ) {
    throw new TypeError("release health producer verification failed");
  }
  const identitiesMatch =
    expectedIdentity.releaseIdentity === observedIdentity.releaseIdentity &&
    expectedIdentity.rootsDigest === observedIdentity.rootsDigest &&
    expectedIdentity.candidateDigest === observedIdentity.candidateDigest &&
    expectedIdentity.conformanceDigest === observedIdentity.conformanceDigest;
  const checksMatch = checks.every(
    (check) => check.expectedDigest === check.observedDigest,
  );
  const healthy = identitiesMatch && checksMatch;
  if ((evidence.outcome === "healthy") !== healthy) {
    throw new TypeError(
      "release health outcome does not match observed identities and checks",
    );
  }
  return deepFreeze({ evidence, healthy });
}

function validateInput(
  input: ReleaseControllerInputV1,
  verifier: BrowserSignatureVerifierV1,
  healthVerifier: ReleaseHealthProducerVerifierV1,
): VerifiedReleaseControllerInputV1 {
  assertClosedObject(input, "release controller input", [
    "roots",
    "candidate",
    "conformance",
    "health",
  ]);
  const roots = verifyGenerationEvidenceRoots(input.roots, verifier);
  const candidate = validateDirectPackageCandidate(input.candidate);
  const conformance = validateConformance(input.conformance);
  const health = validateHealth(input.health, healthVerifier);
  const capability = candidate.capabilities.find(
    (item) => item.capabilityId === conformance.capabilityId,
  );
  if (
    candidate.packageName !== conformance.packageName ||
    candidate.packagePath !== conformance.packagePath ||
    candidate.releaseIdentity !== conformance.releaseIdentity ||
    candidate.packageArtifactDigest !== conformance.packageArtifactDigest ||
    candidate.coreBuildDigest !== conformance.coreBuildDigest ||
    candidate.commonSchemaDigest !== conformance.commonSchemaDigest ||
    capability === undefined ||
    capability.capabilitySchemaDigest !== conformance.capabilitySchemaDigest ||
    capability.capabilityProfileDigest !==
      conformance.capabilityProfileDigest ||
    capability.vectorSetDigest !== conformance.vectorSetDigest ||
    roots.deployment.payloadDigest !== conformance.deploymentPayloadDigest ||
    roots.policy.payloadDigest !== conformance.policyPayloadDigest ||
    roots.rootsDigest !== conformance.rootsDigest ||
    health.evidence.capabilityId !== conformance.capabilityId ||
    health.evidence.expectedIdentity.releaseIdentity !==
      conformance.releaseIdentity ||
    health.evidence.expectedIdentity.rootsDigest !== roots.rootsDigest ||
    health.evidence.expectedIdentity.candidateDigest !==
      candidate.candidateDigest ||
    health.evidence.expectedIdentity.conformanceDigest !==
      conformance.conformanceDigest
  ) {
    throw new TypeError(
      "roots, package candidate, conformance, and health are not exact",
    );
  }
  return { roots, candidate, conformance, health };
}

function intentFor(
  input: VerifiedReleaseControllerInputV1,
  decidedAt: string,
): ReleaseOperatorIntentV1 {
  assertUint256Decimal(decidedAt, "decidedAt");
  const base = {
    schemaVersion: "cork.release-operator-intent/v1" as const,
    capabilityId: input.conformance.capabilityId,
    deploymentId: input.roots.deployment.identity.generationId,
    deploymentGeneration: input.roots.deployment.identity.generation,
    deploymentPayloadDigest: input.roots.deployment.payloadDigest,
    policyId: input.roots.policy.identity.generationId,
    policyGeneration: input.roots.policy.identity.generation,
    policyPayloadDigest: input.roots.policy.payloadDigest,
    candidateDigest: input.candidate.candidateDigest,
    conformanceDigest: input.conformance.conformanceDigest,
    decidedAt,
  };
  return deepFreeze({
    ...base,
    intentDigest: sha256CanonicalJson(base as unknown as JsonValue),
  });
}

function sameIntent(
  intent: ReleaseOperatorIntentV1,
  input: VerifiedReleaseControllerInputV1,
): boolean {
  return (
    intent.deploymentId === input.roots.deployment.identity.generationId &&
    intent.deploymentGeneration ===
      input.roots.deployment.identity.generation &&
    intent.deploymentPayloadDigest === input.roots.deployment.payloadDigest &&
    intent.policyId === input.roots.policy.identity.generationId &&
    intent.policyGeneration === input.roots.policy.identity.generation &&
    intent.policyPayloadDigest === input.roots.policy.payloadDigest &&
    intent.candidateDigest === input.candidate.candidateDigest &&
    intent.conformanceDigest === input.conformance.conformanceDigest
  );
}

export class ReleaseController {
  readonly #store: ReleaseOperatorIntentStore;
  readonly #verifier: BrowserSignatureVerifierV1;
  readonly #healthVerifier: ReleaseHealthProducerVerifierV1;

  public constructor(
    store: ReleaseOperatorIntentStore,
    verifier: BrowserSignatureVerifierV1,
    healthVerifier: ReleaseHealthProducerVerifierV1,
  ) {
    this.#store = store;
    this.#verifier = verifier;
    this.#healthVerifier = healthVerifier;
  }

  public verify(
    input: ReleaseControllerInputV1,
  ): VerifiedReleaseControllerInputV1 {
    return validateInput(input, this.#verifier, this.#healthVerifier);
  }

  public activate(
    input: ReleaseControllerInputV1,
    decidedAt: string,
  ): ReleaseCapabilityStateV1 {
    const verified = this.verify(input);
    if (
      verified.roots.deployment.payload.status !== "active" ||
      (verified.conformance.policyRequired &&
        verified.roots.policy.payload.status !== "active")
    ) {
      throw new TypeError("only current active generations may be activated");
    }
    this.#store.put(intentFor(verified, decidedAt));
    return this.#evaluateVerified(verified);
  }

  public evaluate(input: ReleaseControllerInputV1): ReleaseCapabilityStateV1 {
    return this.#evaluateVerified(this.verify(input));
  }

  #evaluateVerified(
    input: VerifiedReleaseControllerInputV1,
  ): ReleaseCapabilityStateV1 {
    const { conformance, health } = input;
    const capabilityId = conformance.capabilityId;
    const intent = this.#store.get(capabilityId);
    const deploymentStatus = input.roots.deployment.payload.status;
    const policyStatus = input.roots.policy.payload.status;
    const terminal =
      deploymentStatus === "retired" ||
      deploymentStatus === "emergency-disabled" ||
      (conformance.policyRequired &&
        (policyStatus === "retired" || policyStatus === "emergency-disabled"));
    if (terminal) {
      this.#store.clear(capabilityId);
      return deepFreeze({
        capabilityId,
        implemented: true,
        activated: false,
        healthy: health.healthy,
        callable: false,
        reason: "terminal-generation",
      });
    }
    const active =
      deploymentStatus === "active" &&
      (!conformance.policyRequired || policyStatus === "active");
    const bound = intent !== undefined && sameIntent(intent, input);
    if (intent !== undefined && !bound) this.#store.clear(capabilityId);
    const activated = active && bound;
    const callable = activated && health.healthy;
    return deepFreeze({
      capabilityId,
      implemented: true,
      activated,
      healthy: health.healthy,
      callable,
      reason: callable
        ? "callable"
        : !activated
          ? intent === undefined
            ? "not-activated"
            : "generation-changed"
          : "unhealthy",
      ...(activated && intent !== undefined ? { operatorIntent: intent } : {}),
    });
  }

  public deactivate(capabilityId: string): void {
    nonEmpty(capabilityId, "capabilityId");
    this.#store.clear(capabilityId);
  }
}

export interface ReleaseRuntimeRefreshInputV1 {
  readonly inventory: unknown;
  readonly releases: readonly ReleaseControllerInputV1[];
  readonly refreshedAt: string;
}

interface ReleaseRuntimeSnapshotV1 {
  readonly inventory: CapabilityInventoryV1;
  readonly refreshedAt: string;
}

function assertInventoryReleaseMatch(
  inventory: CapabilityInventoryV1,
  verified: VerifiedReleaseControllerInputV1,
  state: ReleaseCapabilityStateV1,
): void {
  const record = inventory.capabilities.find(
    (capability) => capability.capabilityId === state.capabilityId,
  );
  const candidateCapability = verified.candidate.capabilities.find(
    (capability) => capability.capabilityId === state.capabilityId,
  );
  if (record === undefined || candidateCapability === undefined) {
    throw new TypeError(
      "every runtime inventory capability requires exact release evidence",
    );
  }
  if (
    inventory.coreBuild.sourceCommit !== verified.candidate.sourceCommit ||
    inventory.coreBuild.schemaDigest !==
      verified.candidate.commonSchemaDigest ||
    record.capabilityProfileDigest !==
      candidateCapability.capabilityProfileDigest ||
    record.vectorSetDigest !== candidateCapability.vectorSetDigest ||
    record.implemented !== state.implemented ||
    record.activated !== state.activated ||
    record.healthy !== state.healthy ||
    record.callable !== state.callable
  ) {
    throw new TypeError(
      "runtime inventory does not exactly project the verified release state",
    );
  }
  const deployment = verified.roots.deployment;
  if (
    record.evidence === undefined ||
    record.evidence.deploymentId !== deployment.identity.generationId ||
    record.evidence.generation !== deployment.identity.generation ||
    record.evidence.status !== deployment.payload.status
  ) {
    throw new TypeError(
      "runtime inventory evidence does not match the verified deployment root",
    );
  }
  const intent = state.operatorIntent;
  if (
    (intent === undefined) !== (record.operatorBinding === undefined) ||
    (intent !== undefined &&
      (record.operatorBinding?.deploymentId !== intent.deploymentId ||
        record.operatorBinding.generation !== intent.deploymentGeneration))
  ) {
    throw new TypeError(
      "runtime inventory operator binding does not match the release decision",
    );
  }
}

export class AtomicReleaseRuntime {
  readonly #controller: ReleaseController;
  readonly #maxAgeSeconds: bigint;
  #current: ReleaseRuntimeSnapshotV1 | undefined;

  public constructor(controller: ReleaseController, maxAgeSeconds: string) {
    assertUint256Decimal(maxAgeSeconds, "maxAgeSeconds");
    this.#controller = controller;
    this.#maxAgeSeconds = BigInt(maxAgeSeconds);
  }

  public refresh(input: ReleaseRuntimeRefreshInputV1): CapabilityInventoryV1 {
    assertClosedObject(input, "release runtime refresh", [
      "inventory",
      "releases",
      "refreshedAt",
    ]);
    assertUint256Decimal(input.refreshedAt, "refreshedAt");
    if (!Array.isArray(input.releases)) {
      throw new TypeError("releases must be an array");
    }
    const inventory = validateCapabilityInventory(input.inventory);
    if (input.releases.length !== inventory.capabilities.length) {
      throw new TypeError(
        "runtime refresh requires one release per inventory capability",
      );
    }
    const releaseIds = new Set<string>();
    for (const release of input.releases) {
      const verified = this.#controller.verify(release);
      const state = this.#controller.evaluate(release);
      if (releaseIds.has(state.capabilityId)) {
        throw new TypeError(
          "runtime release capability identifiers must be unique",
        );
      }
      releaseIds.add(state.capabilityId);
      assertInventoryReleaseMatch(inventory, verified, state);
    }
    if (
      inventory.capabilities.some(
        (capability) => !releaseIds.has(capability.capabilityId),
      )
    ) {
      throw new TypeError(
        "runtime inventory contains a capability without release evidence",
      );
    }
    this.#current = deepFreeze({
      inventory,
      refreshedAt: input.refreshedAt,
    });
    return inventory;
  }

  public clear(): void {
    this.#current = undefined;
  }

  public snapshot(observedAt: string): CapabilityInventoryV1 {
    assertUint256Decimal(observedAt, "observedAt");
    const current = this.#current;
    if (current === undefined) {
      throw new TypeError("release runtime snapshot is absent");
    }
    const observed = BigInt(observedAt);
    const refreshed = BigInt(current.refreshedAt);
    if (observed < refreshed) {
      throw new TypeError("release runtime observation precedes its refresh");
    }
    if (observed - refreshed > this.#maxAgeSeconds) {
      throw new TypeError("release runtime snapshot is stale");
    }
    return current.inventory;
  }
}
