import { describe, expect, it } from "vitest";

import {
  createDirectPackageCandidate,
  generationPayloadDigest,
  sha256CanonicalJson,
  verifyGenerationEvidenceRoots,
  type BrowserSignatureVerifierV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type Sha256Digest,
} from "../src/index.js";
import {
  ReleaseController,
  type ReleaseConformanceV1,
  type ReleaseHealthEvidenceV1,
  type ReleaseHealthProducerVerifierV1,
  type ReleaseOperatorIntentStore,
  type ReleaseOperatorIntentV1,
} from "../../gateway/src/release-controller.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const CAPABILITY = "cork.market.deploy.v1";
const VERIFIER: BrowserSignatureVerifierV1 = { verify: () => true };
const HEALTH_VERIFIER: ReleaseHealthProducerVerifierV1 = {
  verify: (input) =>
    input.producer.producerId === "fixture-health-watcher" &&
    input.producer.keyId === "fixture-health-key" &&
    input.producerProof === "fixture-health-proof",
};

class MemoryIntentStore implements ReleaseOperatorIntentStore {
  readonly values = new Map<string, ReleaseOperatorIntentV1>();

  get(capabilityId: string): ReleaseOperatorIntentV1 | undefined {
    return this.values.get(capabilityId);
  }

  put(intent: ReleaseOperatorIntentV1): void {
    this.values.set(intent.capabilityId, intent);
  }

  clear(capabilityId: string): void {
    this.values.delete(capabilityId);
  }
}

function generationEvidence(
  rootKind: GenerationRootKindV1,
  generation: string,
  status: "staged" | "active" | "retired" | "emergency-disabled",
  keyPrefix: string,
): GenerationEvidenceV1 {
  const generationId =
    rootKind === "deployment" ? "cork-mainnet" : "security-policy";
  const repository =
    rootKind === "deployment"
      ? "Cork-Technology/cork-deployments"
      : "Cork-Technology/cork-signing-gate";
  const directory =
    rootKind === "deployment" ? "generations" : "policy-generations";
  const path = `${directory}/${generationId}/${generation}/`;
  const releaseIdentity = `${generationId}-release-${generation}`;
  const contentDigest = digest(rootKind === "deployment" ? "1" : "2");
  const payload: GenerationPayloadV1 = {
    schemaVersion:
      rootKind === "deployment"
        ? "cork.deployment-generation/v1"
        : "cork.signing-policy-generation/v1",
    rootKind,
    generationId,
    generation,
    status,
    releaseIdentity,
    contentDigest,
    claims: [],
  };
  const payloadDigest = generationPayloadDigest(payload);
  const terminal = status === "emergency-disabled";
  return {
    schemaVersion: "cork.generation-evidence/v1",
    rootKind,
    repository,
    path,
    identity: { generationId, generation },
    repositoryCommit: "ab".repeat(20),
    release: {
      identity: releaseIdentity,
      tag: `v${generation}.0.0`,
      repositoryCommit: "ab".repeat(20),
      releasedAt: "3",
    },
    payload,
    payloadDigest,
    reviewPromotion: {
      reviewedByRole: "reviewer",
      reviewedAt: "1",
      promotedByRole: "promoter",
      promotedAt: "2",
    },
    publisher: {
      identity: "release-bot",
      repository,
      path,
      publishedAt: "6",
    },
    transparency: {
      recordId: `${generationId}-${generation}`,
      repository,
      path,
      payloadDigest,
    },
    continuity: terminal
      ? {
          kind: "tombstone",
          targetGeneration: generation,
          priorContentDigest: contentDigest,
          reason: "fixture emergency disable",
        }
      : BigInt(generation) === 0n
        ? { kind: "successor" }
        : {
            kind: "successor",
            predecessorGeneration: String(BigInt(generation) - 1n),
            predecessorPayloadDigest: digest("3"),
          },
    signatures: (terminal ? [0] : [0, 1]).map((order) => ({
      order: String(order),
      keyId: `${keyPrefix}-${order}`,
      algorithm: "ed25519" as const,
      rootKind,
      payloadDigest,
      signedAt: String(4 + order),
      signature: `${keyPrefix}-signature-${order}`,
    })),
  };
}

function roots(
  generation = "7",
  deploymentStatus:
    | "staged"
    | "active"
    | "retired"
    | "emergency-disabled" = "active",
  policyStatus:
    | "staged"
    | "active"
    | "retired"
    | "emergency-disabled" = "active",
): {
  readonly deployment: GenerationEvidenceV1;
  readonly policy: GenerationEvidenceV1;
} {
  return {
    deployment: generationEvidence(
      "deployment",
      generation,
      deploymentStatus,
      "deployment",
    ),
    policy: generationEvidence("signing-policy", "3", policyStatus, "policy"),
  };
}

const candidate = createDirectPackageCandidate({
  packagePath: "/releases/cork-operation-core/market-v1.tgz",
  releaseIdentity: "operations-market-v1",
  packageArtifactDigest: digest("4"),
  sourceCommit: "ab".repeat(20),
  commonSchemaDigest: digest("5"),
  coreBuildDigest: digest("6"),
  capabilities: [
    {
      capabilityId: CAPABILITY,
      capabilitySchemaDigest: digest("7"),
      capabilityProfileDigest: digest("a"),
      vectorSetDigest: digest("b"),
    },
  ],
});

function conformance(
  evidence = roots(),
  override: Partial<ReleaseConformanceV1> = {},
): ReleaseConformanceV1 {
  const verified = verifyGenerationEvidenceRoots(evidence, VERIFIER);
  const capability = candidate.capabilities[0]!;
  const base = {
    schemaVersion: "cork.release-conformance/v1" as const,
    capabilityId: CAPABILITY,
    packageName: "@corkprotocol/operations" as const,
    packagePath: candidate.packagePath,
    releaseIdentity: candidate.releaseIdentity,
    packageArtifactDigest: candidate.packageArtifactDigest,
    coreBuildDigest: candidate.coreBuildDigest,
    commonSchemaDigest: candidate.commonSchemaDigest,
    capabilitySchemaDigest: capability.capabilitySchemaDigest,
    capabilityProfileDigest: capability.capabilityProfileDigest,
    vectorSetDigest: capability.vectorSetDigest,
    deploymentPayloadDigest: verified.deployment.payloadDigest,
    policyRequired: true,
    policyPayloadDigest: verified.policy.payloadDigest,
    rootsDigest: verified.rootsDigest,
    ...override,
  };
  return {
    ...base,
    conformanceDigest: sha256CanonicalJson(base),
  };
}

function health(
  healthy: boolean,
  evidence = roots(),
  releaseConformance = conformance(evidence),
): ReleaseHealthEvidenceV1 {
  const expectedIdentity = {
    releaseIdentity: releaseConformance.releaseIdentity,
    rootsDigest: releaseConformance.rootsDigest,
    candidateDigest: candidate.candidateDigest,
    conformanceDigest: releaseConformance.conformanceDigest,
  };
  const observedIdentity = healthy
    ? expectedIdentity
    : { ...expectedIdentity, candidateDigest: digest("0") };
  const checks = [
    {
      checkId: "runtime-code",
      expectedDigest: candidate.coreBuildDigest,
      observedDigest: healthy ? candidate.coreBuildDigest : digest("0"),
    },
  ];
  const projection = {
    schemaVersion: "cork.release-health/v1" as const,
    capabilityId: CAPABILITY,
    producer: {
      producerId: "fixture-health-watcher",
      keyId: "fixture-health-key",
    },
    observedAt: "1000",
    expectedIdentity,
    observedIdentity,
    checks,
    outcome: healthy ? ("healthy" as const) : ("unhealthy" as const),
  };
  return {
    ...projection,
    evidenceDigest: sha256CanonicalJson(projection),
    producerProof: "fixture-health-proof",
  };
}

function redigestHealth(
  evidence: ReleaseHealthEvidenceV1,
  override: Partial<
    Omit<ReleaseHealthEvidenceV1, "evidenceDigest" | "producerProof">
  >,
): ReleaseHealthEvidenceV1 {
  const { evidenceDigest: _digest, producerProof, ...projection } = evidence;
  const changed = { ...projection, ...override };
  return {
    ...changed,
    evidenceDigest: sha256CanonicalJson(changed),
    producerProof,
  };
}

describe("generation-bound market release control", () => {
  it("requires exact roots, package, conformance, profile, vectors, and health", () => {
    const store = new MemoryIntentStore();
    const controller = new ReleaseController(store, VERIFIER, HEALTH_VERIFIER);
    const evidence = roots();
    const input = {
      roots: evidence,
      candidate,
      conformance: conformance(evidence),
      health: health(true),
    };
    expect(controller.evaluate(input)).toMatchObject({
      implemented: true,
      activated: false,
      healthy: true,
      callable: false,
    });
    expect(controller.activate(input, "1000")).toMatchObject({
      implemented: true,
      activated: true,
      healthy: true,
      callable: true,
      operatorIntent: {
        deploymentId: "cork-mainnet",
        deploymentGeneration: "7",
      },
    });
    expect(() =>
      controller.evaluate({
        ...input,
        conformance: conformance(evidence, {
          vectorSetDigest: digest("e"),
        }),
      }),
    ).toThrow(/exact/u);
    expect(() =>
      controller.evaluate({
        ...input,
        candidate: { ...candidate, candidateDigest: digest("f") },
      }),
    ).toThrow(/candidate digest/u);
    expect(() =>
      new ReleaseController(
        store,
        { verify: () => false },
        HEALTH_VERIFIER,
      ).evaluate(input),
    ).toThrow(/signature verification/u);
  });

  it("requires canonical producer-verified health before recovery", () => {
    const store = new MemoryIntentStore();
    const controller = new ReleaseController(store, VERIFIER, HEALTH_VERIFIER);
    const evidence = roots();
    const base = {
      roots: evidence,
      candidate,
      conformance: conformance(evidence),
    };
    controller.activate({ ...base, health: health(true) }, "1000");
    const unhealthy = health(false);
    expect(controller.evaluate({ ...base, health: unhealthy })).toMatchObject({
      activated: true,
      healthy: false,
      callable: false,
      reason: "unhealthy",
    });

    const flippedOutcome = redigestHealth(unhealthy, { outcome: "healthy" });
    expect(() =>
      controller.evaluate({ ...base, health: flippedOutcome }),
    ).toThrow(/outcome does not match/u);
    expect(() =>
      controller.evaluate({
        ...base,
        health: { ...health(true), observedAt: "1001" },
      }),
    ).toThrow(/digest does not match/u);
    expect(() =>
      controller.evaluate({
        ...base,
        health: { ...health(true), evidenceDigest: digest("e") },
      }),
    ).toThrow(/digest does not match/u);
    expect(() =>
      new ReleaseController(store, VERIFIER, { verify: () => false }).evaluate({
        ...base,
        health: health(true),
      }),
    ).toThrow(/producer verification/u);
    expect(
      controller.evaluate({ ...base, health: health(true) }),
    ).toMatchObject({
      activated: true,
      healthy: true,
      callable: true,
    });
  });

  it("clears intent on deactivation, retirement, and emergency tombstone", () => {
    const store = new MemoryIntentStore();
    const controller = new ReleaseController(store, VERIFIER, HEALTH_VERIFIER);
    const active = roots();
    const activeInput = {
      roots: active,
      candidate,
      conformance: conformance(active),
      health: health(true),
    };
    controller.activate(activeInput, "1000");
    controller.deactivate(CAPABILITY);
    expect(controller.evaluate(activeInput).activated).toBe(false);

    controller.activate(activeInput, "1001");
    const retired = roots("7", "retired");
    expect(
      controller.evaluate({
        ...activeInput,
        roots: retired,
        conformance: conformance(retired),
        health: health(true, retired, conformance(retired)),
      }),
    ).toMatchObject({
      activated: false,
      callable: false,
      reason: "terminal-generation",
    });
    expect(store.values.size).toBe(0);

    controller.activate(activeInput, "1002");
    const tombstone = roots("7", "emergency-disabled");
    expect(
      controller.evaluate({
        ...activeInput,
        roots: tombstone,
        conformance: conformance(tombstone),
        health: health(true, tombstone, conformance(tombstone)),
      }),
    ).toMatchObject({ activated: false, reason: "terminal-generation" });
    expect(
      controller.evaluate({ ...activeInput, health: health(true) }).activated,
    ).toBe(false);
  });

  it("requires a new explicit decision for a higher active generation", () => {
    const controller = new ReleaseController(
      new MemoryIntentStore(),
      VERIFIER,
      HEALTH_VERIFIER,
    );
    const current = roots();
    controller.activate(
      {
        roots: current,
        candidate,
        conformance: conformance(current),
        health: health(true),
      },
      "1000",
    );
    const higher = roots("8");
    const higherInput = {
      roots: higher,
      candidate,
      conformance: conformance(higher),
      health: health(true, higher, conformance(higher)),
    };
    expect(controller.evaluate(higherInput)).toMatchObject({
      activated: false,
      callable: false,
      reason: "generation-changed",
    });
    expect(controller.evaluate(higherInput).activated).toBe(false);
    expect(controller.activate(higherInput, "1001")).toMatchObject({
      activated: true,
      callable: true,
      operatorIntent: { deploymentGeneration: "8" },
    });
  });
});
