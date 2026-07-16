import { describe, expect, it } from "vitest";

import * as gateway from "@corkprotocol/gateway";
import {
  createCapabilityInventory,
  createDirectPackageCandidate,
  evaluateCapabilityMaturity,
  generationPayloadDigest,
  sha256CanonicalJson,
  verifyGenerationEvidenceRoots,
  type BrowserSignatureVerifierV1,
  type CapabilityDefinitionV1,
  type CapabilitySnapshotV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type Sha256Digest,
} from "@corkprotocol/operations";

import { assertCandidateConformanceIdentity } from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const CAPABILITY = "cork.fixture.market-deploy.v1";
const VERIFIER: BrowserSignatureVerifierV1 = { verify: () => true };
const HEALTH_VERIFIER: gateway.ReleaseHealthProducerVerifierV1 = {
  verify: (input) =>
    input.producer.producerId === "fixture-health-watcher" &&
    input.producer.keyId === "fixture-health-key" &&
    input.producerProof === "fixture-health-proof",
};

class MemoryIntentStore implements gateway.ReleaseOperatorIntentStore {
  readonly values = new Map<string, gateway.ReleaseOperatorIntentV1>();

  get(capabilityId: string): gateway.ReleaseOperatorIntentV1 | undefined {
    return this.values.get(capabilityId);
  }

  put(intent: gateway.ReleaseOperatorIntentV1): void {
    this.values.set(intent.capabilityId, intent);
  }

  clear(capabilityId: string): void {
    this.values.delete(capabilityId);
  }
}

function generationEvidence(
  rootKind: GenerationRootKindV1,
  keyPrefix: string,
): GenerationEvidenceV1 {
  const generationId =
    rootKind === "deployment" ? "fixture-deployment" : "fixture-policy";
  const repository =
    rootKind === "deployment"
      ? "Cork-Technology/cork-deployments"
      : "Cork-Technology/cork-signing-gate";
  const directory =
    rootKind === "deployment" ? "generations" : "policy-generations";
  const path = `${directory}/${generationId}/7/`;
  const releaseIdentity = `${generationId}-release-7`;
  const payload: GenerationPayloadV1 = {
    schemaVersion:
      rootKind === "deployment"
        ? "cork.deployment-generation/v1"
        : "cork.signing-policy-generation/v1",
    rootKind,
    generationId,
    generation: "7",
    status: "active",
    releaseIdentity,
    contentDigest: digest(rootKind === "deployment" ? "8" : "9"),
    claims: [],
  };
  const payloadDigest = generationPayloadDigest(payload);
  return {
    schemaVersion: "cork.generation-evidence/v1",
    rootKind,
    repository,
    path,
    identity: { generationId, generation: "7" },
    repositoryCommit: "ab".repeat(20),
    release: {
      identity: releaseIdentity,
      tag: "v7.0.0",
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
      recordId: `${generationId}-record`,
      repository,
      path,
      payloadDigest,
    },
    continuity: {
      kind: "successor",
      predecessorGeneration: "6",
      predecessorPayloadDigest: digest("a"),
    },
    signatures: [0, 1].map((order) => ({
      order: String(order),
      keyId: `${keyPrefix}-${order}`,
      algorithm: "ed25519" as const,
      rootKind,
      payloadDigest,
      signedAt: String(4 + order),
      signature: `${keyPrefix}-${order}`,
    })),
  };
}

const DEFINITION: CapabilityDefinitionV1 = {
  capabilityId: CAPABILITY,
  version: "1",
  specified: true,
  commonProfileDigest: digest("1"),
  capabilityProfileDigest: digest("2"),
  vectorSetDigest: digest("3"),
};

const ACTIVE: CapabilitySnapshotV1 = {
  implementation: {
    commonProfileDigest: DEFINITION.commonProfileDigest,
    capabilityProfileDigest: DEFINITION.capabilityProfileDigest,
    vectorSetDigest: DEFINITION.vectorSetDigest,
  },
  operatorIntent: {
    deploymentId: "fixture-deployment",
    generation: "7",
  },
  evidence: {
    deploymentId: "fixture-deployment",
    generation: "7",
    status: "active",
  },
  healthy: true,
};

describe("public release lifecycle boundary", () => {
  it("exports a verified controller and atomically refreshes the router inventory", () => {
    const candidate = createDirectPackageCandidate({
      packagePath: "/fixture/releases/market-deploy.tgz",
      releaseIdentity: "fixture-market-release",
      packageArtifactDigest: digest("4"),
      sourceCommit: "ab".repeat(20),
      commonSchemaDigest: digest("5"),
      coreBuildDigest: digest("6"),
      capabilities: [
        {
          capabilityId: CAPABILITY,
          capabilitySchemaDigest: digest("7"),
          capabilityProfileDigest: DEFINITION.capabilityProfileDigest,
          vectorSetDigest: DEFINITION.vectorSetDigest,
        },
      ],
    });
    const roots = {
      deployment: generationEvidence("deployment", "deployment"),
      policy: generationEvidence("signing-policy", "policy"),
    };
    const verifiedRoots = verifyGenerationEvidenceRoots(roots, VERIFIER);
    const candidateCapability = candidate.capabilities[0]!;
    const conformanceBase = {
      schemaVersion: "cork.release-conformance/v1" as const,
      capabilityId: CAPABILITY,
      packageName: "@corkprotocol/operations" as const,
      packagePath: candidate.packagePath,
      releaseIdentity: candidate.releaseIdentity,
      packageArtifactDigest: candidate.packageArtifactDigest,
      coreBuildDigest: candidate.coreBuildDigest,
      commonSchemaDigest: candidate.commonSchemaDigest,
      capabilitySchemaDigest: candidateCapability.capabilitySchemaDigest,
      capabilityProfileDigest: candidateCapability.capabilityProfileDigest,
      vectorSetDigest: candidateCapability.vectorSetDigest,
      deploymentPayloadDigest: verifiedRoots.deployment.payloadDigest,
      policyRequired: true,
      policyPayloadDigest: verifiedRoots.policy.payloadDigest,
      rootsDigest: verifiedRoots.rootsDigest,
    };
    const releaseConformance = {
      ...conformanceBase,
      conformanceDigest: sha256CanonicalJson(conformanceBase),
    };
    const healthProjection = {
      schemaVersion: "cork.release-health/v1" as const,
      capabilityId: CAPABILITY,
      producer: {
        producerId: "fixture-health-watcher",
        keyId: "fixture-health-key",
      },
      observedAt: "98",
      expectedIdentity: {
        releaseIdentity: releaseConformance.releaseIdentity,
        rootsDigest: verifiedRoots.rootsDigest,
        candidateDigest: candidate.candidateDigest,
        conformanceDigest: releaseConformance.conformanceDigest,
      },
      observedIdentity: {
        releaseIdentity: releaseConformance.releaseIdentity,
        rootsDigest: verifiedRoots.rootsDigest,
        candidateDigest: candidate.candidateDigest,
        conformanceDigest: releaseConformance.conformanceDigest,
      },
      checks: [
        {
          checkId: "runtime-code",
          expectedDigest: candidate.coreBuildDigest,
          observedDigest: candidate.coreBuildDigest,
        },
      ],
      outcome: "healthy" as const,
    };
    const release = {
      roots,
      candidate,
      conformance: releaseConformance,
      health: {
        ...healthProjection,
        evidenceDigest: sha256CanonicalJson(healthProjection),
        producerProof: "fixture-health-proof",
      },
    };
    assertCandidateConformanceIdentity(
      candidate,
      {
        packagePath: candidate.packagePath,
        releaseIdentity: candidate.releaseIdentity,
        packageArtifactDigest: candidate.packageArtifactDigest,
        coreBuildDigest: candidate.coreBuildDigest,
        commonSchemaDigest: candidate.commonSchemaDigest,
        capabilitySchemaDigest:
          candidate.capabilities[0]!.capabilitySchemaDigest,
        capabilityProfileDigest:
          candidate.capabilities[0]!.capabilityProfileDigest,
        vectorSetDigest: candidate.capabilities[0]!.vectorSetDigest,
        deploymentRootDigest: digest("8"),
        policyRootDigest: digest("9"),
        healthDigest: digest("a"),
      },
      CAPABILITY,
    );
    const controller = new gateway.ReleaseController(
      new MemoryIntentStore(),
      VERIFIER,
      HEALTH_VERIFIER,
    );
    expect(controller.activate(release, "99").callable).toBe(true);

    const inventory = createCapabilityInventory(
      {
        packageVersion: "0.1.0",
        sourceCommit: candidate.sourceCommit,
        schemaDigest: candidate.commonSchemaDigest,
      },
      [
        {
          ...DEFINITION,
          implemented: true,
          activated: true,
          healthy: true,
          callable: true,
          operatorBinding: {
            deploymentId: "fixture-deployment",
            generation: "7",
          },
          evidence: {
            deploymentId: "fixture-deployment",
            generation: "7",
            status: "active",
          },
        },
      ],
    );
    const runtime = new gateway.AtomicReleaseRuntime(controller, "5");
    runtime.refresh({
      inventory,
      releases: [release],
      refreshedAt: "100",
    });
    const committedInventory = runtime.snapshot("100");
    let observedAt = "101";
    const handlers = Object.fromEntries(
      gateway.STATIC_TOOL_CATALOG.map((tool) => [
        tool.handlerKey,
        async () => ({}),
      ]),
    ) as unknown as gateway.ToolHandlers;
    const router = new gateway.ToolRouter({
      capabilityInventory: () => runtime.snapshot(observedAt),
      handlers,
      admission: new gateway.WorkAdmissionController({
        perPrincipal: {
          concurrency: 10,
          upstream: 10,
          simulation: 10,
          queue: 10,
          responseBytes: 1_000_000,
          total: 100,
        },
        global: {
          concurrency: 10,
          upstream: 10,
          simulation: 10,
          queue: 10,
          responseBytes: 1_000_000,
          total: 100,
        },
        firstPartyReserve: {
          concurrency: 1,
          upstream: 1,
          simulation: 1,
          queue: 1,
        },
      }),
      clock: { nowMs: () => 101_000 },
    });
    const principal: gateway.CredentialClaims = {
      credentialId: "fixture-credential",
      principalId: "fixture-principal",
      ownerId: "fixture-owner",
      environment: "fixture",
      trafficClass: "public",
      scopes: ["capabilities:read"],
      issuedAtMs: 0,
      revocationId: "fixture-revocation",
    };
    expect(router.listTools(principal).map((tool) => tool.name)).toEqual([
      "cork.capabilities.v1",
    ]);
    const mismatchedInventory = createCapabilityInventory(inventory.coreBuild, [
      { ...inventory.capabilities[0]!, vectorSetDigest: digest("f") },
    ]);
    expect(() =>
      runtime.refresh({
        inventory: mismatchedInventory,
        releases: [release],
        refreshedAt: "102",
      }),
    ).toThrow(/exactly project/u);
    expect(runtime.snapshot("102")).toBe(committedInventory);
    observedAt = "106";
    expect(() => router.listTools(principal)).toThrow(/stale/u);
    runtime.clear();
    expect(() => runtime.snapshot("101")).toThrow(/absent/u);
  });

  it("proves public maturity health recovery and generation-terminal behavior", () => {
    const active = evaluateCapabilityMaturity(DEFINITION, ACTIVE);
    const unhealthy = evaluateCapabilityMaturity(DEFINITION, {
      ...ACTIVE,
      healthy: false,
      healthReason: {
        code: "FIXTURE_PROVIDER_OUTAGE",
        message: "Fixture provider unavailable.",
        remediation: "Restore the same fixture evidence generation.",
      },
    });
    const recovered = evaluateCapabilityMaturity(DEFINITION, ACTIVE);
    expect(active).toMatchObject({
      implemented: true,
      activated: true,
      healthy: true,
      callable: true,
    });
    expect(unhealthy).toMatchObject({
      implemented: true,
      activated: true,
      healthy: false,
      callable: false,
    });
    expect(recovered.callable).toBe(true);

    const deactivated = evaluateCapabilityMaturity(DEFINITION, {
      implementation: ACTIVE.implementation!,
      evidence: ACTIVE.evidence!,
      healthy: true,
    });
    expect(deactivated).toMatchObject({
      activated: false,
      callable: false,
    });

    for (const status of ["retired", "emergency-disabled"] as const) {
      const terminal = evaluateCapabilityMaturity(DEFINITION, {
        ...ACTIVE,
        evidence: { ...ACTIVE.evidence!, status },
        healthy: true,
      });
      expect(terminal.activated).toBe(false);
      expect(terminal.callable).toBe(false);
      const recoveredHealth = evaluateCapabilityMaturity(DEFINITION, {
        ...ACTIVE,
        evidence: { ...ACTIVE.evidence!, status },
        healthy: true,
      });
      expect(recoveredHealth.activated).toBe(false);
    }

    const higher = evaluateCapabilityMaturity(DEFINITION, {
      ...ACTIVE,
      evidence: {
        deploymentId: "fixture-deployment",
        generation: "8",
        status: "active",
      },
    });
    expect(higher).toMatchObject({
      activated: false,
      callable: false,
      unavailableReason: { code: "ACTIVATION_GENERATION_MISMATCH" },
    });
    const explicitlyActivatedHigher = evaluateCapabilityMaturity(DEFINITION, {
      ...ACTIVE,
      operatorIntent: {
        deploymentId: "fixture-deployment",
        generation: "8",
      },
      evidence: {
        deploymentId: "fixture-deployment",
        generation: "8",
        status: "active",
      },
    });
    expect(explicitlyActivatedHigher.callable).toBe(true);
  });
});
