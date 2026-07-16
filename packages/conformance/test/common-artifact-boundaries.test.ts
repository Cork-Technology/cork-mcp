import { describe, expect, it } from "vitest";

import * as operations from "@corkprotocol/operations";
import * as limitOrderLifecycle from "@corkprotocol/operations/limit-order-lifecycle";
import {
  canonicalizeJson,
  generationPayloadDigest,
  sha256CanonicalJson,
  verifyGenerationEvidenceRoots,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type Sha256Digest,
} from "@corkprotocol/operations";

import {
  PUBLIC_PACKAGE_SPECIFIERS,
  assertSeparateRoots,
  canonicalBytes,
  resolvePublicArtifact,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;

function generation(
  rootKind: GenerationRootKindV1,
  keyPrefix: string,
): GenerationEvidenceV1 {
  const deployment = rootKind === "deployment";
  const generationId = deployment
    ? "fixture-deployment"
    : "fixture-security-policy";
  const repository = deployment
    ? "Cork-Technology/cork-deployments"
    : "Cork-Technology/cork-signing-gate";
  const directory = deployment ? "generations" : "policy-generations";
  const path = `${directory}/${generationId}/7/`;
  const releaseIdentity = `${generationId}-release-7`;
  const payload: GenerationPayloadV1 = {
    schemaVersion: deployment
      ? "cork.deployment-generation/v1"
      : "cork.signing-policy-generation/v1",
    rootKind,
    generationId,
    generation: "7",
    status: "active",
    releaseIdentity,
    contentDigest: digest(deployment ? "1" : "2"),
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
      tag: "fixture-v7",
      repositoryCommit: "ab".repeat(20),
      releasedAt: "3",
    },
    payload,
    payloadDigest,
    reviewPromotion: {
      reviewedByRole: deployment
        ? "fixture-release-reviewer"
        : "fixture-security-reviewer",
      reviewedAt: "1",
      promotedByRole: deployment
        ? "fixture-release-promoter"
        : "fixture-security-promoter",
      promotedAt: "2",
    },
    publisher: {
      identity: deployment
        ? "fixture-release-publisher"
        : "fixture-security-publisher",
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
      predecessorPayloadDigest: digest("3"),
    },
    signatures: [0, 1].map((order) => ({
      order: String(order),
      keyId: `${keyPrefix}-${order}`,
      algorithm: "ed25519" as const,
      rootKind,
      payloadDigest,
      signedAt: String(4 + order),
      signature: `${keyPrefix}-fixture-signature-${order}`,
    })),
  };
}

describe("public artifact and common evidence boundaries", () => {
  it("resolves only package export maps to built public entrypoints", async () => {
    for (const specifier of PUBLIC_PACKAGE_SPECIFIERS) {
      const resolved = resolvePublicArtifact(specifier);
      expect(resolved).toMatch(/\/dist\/index\.js$/u);
      expect(resolved).not.toMatch(/\/src\/|\/test\//u);
      expect(Object.keys(await import(specifier)).length).toBeGreaterThan(0);
    }
  });

  it("exposes limit-order mutation only through the signed-evidence facade", async () => {
    const bypassSymbols = [
      "prepareLimitOrderMaker",
      "finalizeLimitOrderMaker",
      "prepareLimitOrderTaker",
      "prepareLimitOrderCancellation",
      "prepareLimitOrderAllowanceRevocation",
    ] as const;
    for (const symbol of bypassSymbols) {
      expect(operations).not.toHaveProperty(symbol);
      expect(limitOrderLifecycle).not.toHaveProperty(symbol);
    }
    expect(limitOrderLifecycle.DirectLimitOrderLifecycleV1).toBeTypeOf(
      "function",
    );
    const privateSpecifier: string = "@corkprotocol/operations/limit-orders";
    await expect(import(privateSpecifier)).rejects.toThrow(
      /missing ".\/limit-orders" specifier|not defined by "exports"|not exported/iu,
    );
  });

  it("keeps canonical bytes and digests stable through public exports", () => {
    const left = { z: ["fixture", 2], a: { enabled: true } };
    const right = { a: { enabled: true }, z: ["fixture", 2] };
    expect(canonicalizeJson(left)).toBe(canonicalizeJson(right));
    expect(canonicalBytes(left)).toEqual(canonicalBytes(right));
    expect(sha256CanonicalJson(left)).toBe(sha256CanonicalJson(right));
  });

  it("keeps publication, canonical payload, and verified roots distinct", () => {
    const deployment = generation("deployment", "fixture-release-key");
    const policy = generation("signing-policy", "fixture-security-key");
    assertSeparateRoots(deployment, policy);
    const roots = verifyGenerationEvidenceRoots(
      { deployment, policy },
      { verify: () => true },
    );
    expect(roots.deployment.payload).not.toBe(roots.deployment);
    expect(roots.deployment.payloadDigest).toBe(
      generationPayloadDigest(roots.deployment.payload),
    );
    expect(roots.rootsDigest).not.toBe(roots.deployment.payloadDigest);
    expect(roots.rootsDigest).not.toBe(roots.policy.payloadDigest);

    expect(() =>
      verifyGenerationEvidenceRoots(
        { deployment, policy: deployment },
        { verify: () => true },
      ),
    ).toThrow(/cannot be merged|root kind/u);
    expect(() =>
      assertSeparateRoots(deployment, {
        ...policy,
        publisher: deployment.publisher,
      }),
    ).toThrow(/not separate/u);
  });
});
