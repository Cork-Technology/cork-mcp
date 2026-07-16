import { describe, expect, it } from "vitest";

import {
  createCappedInputCapabilityRecords,
  createCapabilityInventory,
  createDirectPackageCandidate,
  type JsonValue,
  type Sha256Digest,
} from "@corkprotocol/operations";
import {
  RELEASE_CANDIDATE_ADAPTER_STATUS,
  REQUIRED_RELEASE_CANDIDATE_SDK_VERSION,
  STATIC_TOOL_CATALOG,
  ToolRouter,
  WorkAdmissionController,
  startReleaseCandidateServer,
  type CredentialClaims,
  type ToolHandlers,
} from "@corkprotocol/gateway";

import {
  assertCandidateConformanceIdentity,
  assertCanonicalEqual,
  assertExactCandidate,
  resolvePublicArtifact,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;

function candidate() {
  return createDirectPackageCandidate({
    packagePath: "/fixture/releases/operations-0.1.0.tgz",
    releaseIdentity: "fixture-operations-release",
    packageArtifactDigest: digest("1"),
    sourceCommit: "ab".repeat(20),
    commonSchemaDigest: digest("2"),
    coreBuildDigest: digest("3"),
    capabilities: [
      {
        capabilityId: "cork.fixture.alpha.v1",
        capabilitySchemaDigest: digest("4"),
        capabilityProfileDigest: digest("5"),
        vectorSetDigest: digest("6"),
      },
      {
        capabilityId: "cork.fixture.beta.v1",
        capabilitySchemaDigest: digest("7"),
        capabilityProfileDigest: digest("8"),
        vectorSetDigest: digest("9"),
      },
    ],
  });
}

const PRINCIPAL: CredentialClaims = {
  credentialId: "fixture-credential",
  principalId: "fixture-principal",
  ownerId: "fixture-owner",
  environment: "fixture",
  trafficClass: "public",
  scopes: ["capabilities:read"],
  issuedAtMs: 0,
  revocationId: "fixture-revocation",
};

function router(coreResult: JsonValue): ToolRouter {
  const handlers = Object.fromEntries(
    STATIC_TOOL_CATALOG.map((tool) => [
      tool.handlerKey,
      async () => coreResult,
    ]),
  ) as unknown as ToolHandlers;
  return new ToolRouter({
    capabilityInventory: () =>
      createCapabilityInventory(
        {
          packageVersion: "0.1.0",
          sourceCommit: "cd".repeat(20),
          schemaDigest: digest("a"),
        },
        createCappedInputCapabilityRecords(digest("a")),
      ),
    handlers,
    admission: new WorkAdmissionController({
      perPrincipal: {
        concurrency: 10,
        upstream: 10,
        simulation: 10,
        queue: 10,
        responseBytes: 1_000_000,
        total: 1_000,
      },
      global: {
        concurrency: 10,
        upstream: 10,
        simulation: 10,
        queue: 10,
        responseBytes: 1_000_000,
        total: 1_000,
      },
      firstPartyReserve: {
        concurrency: 1,
        upstream: 1,
        simulation: 1,
        queue: 1,
      },
    }),
    clock: { nowMs: () => 100 },
  });
}

describe("candidate-format identity and router pass-through", () => {
  it("binds every candidate-format and conformance identity field", () => {
    const direct = candidate();
    expect(direct.capabilities.map((entry) => entry.capabilityId)).toEqual([
      "cork.fixture.alpha.v1",
      "cork.fixture.beta.v1",
    ]);
    assertExactCandidate(direct, candidate());
    assertCandidateConformanceIdentity(
      direct,
      {
        packagePath: direct.packagePath,
        releaseIdentity: direct.releaseIdentity,
        packageArtifactDigest: direct.packageArtifactDigest,
        coreBuildDigest: direct.coreBuildDigest,
        commonSchemaDigest: direct.commonSchemaDigest,
        capabilitySchemaDigest: direct.capabilities[0]!.capabilitySchemaDigest,
        capabilityProfileDigest:
          direct.capabilities[0]!.capabilityProfileDigest,
        vectorSetDigest: direct.capabilities[0]!.vectorSetDigest,
      },
      "cork.fixture.alpha.v1",
    );
    expect(() =>
      assertExactCandidate(direct, {
        ...candidate(),
        packageArtifactDigest: digest("f"),
      }),
    ).toThrow(/canonical bytes differ/u);
    expect(() =>
      assertCandidateConformanceIdentity(
        direct,
        {
          packagePath: "/fixture/workspace/src/index.ts",
          releaseIdentity: direct.releaseIdentity,
        },
        "cork.fixture.alpha.v1",
      ),
    ).toThrow(/identity differ/u);
    expect(resolvePublicArtifact("@corkprotocol/operations")).not.toContain(
      "/src/",
    );
  });

  it("keeps hosted transport metadata outside identical canonical core bytes", async () => {
    const direct = candidate() as unknown as JsonValue;
    const result = await router(direct).call({
      name: "cork.capabilities.v1",
      arguments: {},
      principal: PRINCIPAL,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assertCanonicalEqual(
      direct,
      result.coreResult as JsonValue,
      "hosted/direct result",
    );
    expect(result.transportMetadata).toEqual({
      principalId: "fixture-principal",
      environment: "fixture",
      scope: "capabilities:read",
    });
    expect(JSON.stringify(result.coreResult)).not.toContain(
      "transportMetadata",
    );
  });

  it("fails closed while the exact release-candidate SDK is unpublished", () => {
    expect(REQUIRED_RELEASE_CANDIDATE_SDK_VERSION).toBe("2.0.0-beta.4");
    expect(RELEASE_CANDIDATE_ADAPTER_STATUS).toEqual({
      available: false,
      requiredVersion: "2.0.0-beta.4",
      code: "RELEASE_CANDIDATE_SDK_UNPUBLISHED",
      message:
        "The exact @modelcontextprotocol/sdk 2.0.0-beta.4 release is unpublished; no substitute adapter is permitted.",
    });
    expect(() => startReleaseCandidateServer()).toThrow(
      /RELEASE_CANDIDATE_SDK_UNPUBLISHED/u,
    );
  });
});
