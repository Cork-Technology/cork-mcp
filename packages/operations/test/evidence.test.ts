import { describe, expect, it, vi } from "vitest";

import {
  generationPayloadDigest,
  verifyGenerationEvidenceRoots,
  type BrowserSignatureVerifierV1,
  type GenerationClaimV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type Sha256Digest,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;

function generation(
  rootKind: GenerationRootKindV1,
  keyPrefix: string,
  claims: readonly GenerationClaimV1[] = [],
): GenerationEvidenceV1 {
  const generationId =
    rootKind === "deployment" ? "phoenix-mainnet" : "signer-policy";
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
    contentDigest: digest(rootKind === "deployment" ? "1" : "2"),
    claims,
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
      predecessorPayloadDigest: digest("3"),
    },
    signatures: [0, 1].map((order) => ({
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

describe("separate immutable evidence roots", () => {
  it("uses only injected signature verification and binds both roots", () => {
    const verify = vi.fn(() => true);
    const verifier: BrowserSignatureVerifierV1 = { verify };
    const roots = verifyGenerationEvidenceRoots(
      {
        deployment: generation("deployment", "release"),
        policy: generation("signing-policy", "security"),
      },
      verifier,
    );
    expect(roots.deployment.repository).toBe(
      "Cork-Technology/cork-deployments",
    );
    expect(roots.policy.repository).toBe("Cork-Technology/cork-signing-gate");
    expect(verify).toHaveBeenCalledTimes(4);
    expect(Object.isFrozen(roots)).toBe(true);
  });

  it("rejects merged keys, wrong paths, invalid signatures, and forged verdicts", () => {
    const accepting: BrowserSignatureVerifierV1 = { verify: () => true };
    expect(() =>
      verifyGenerationEvidenceRoots(
        {
          deployment: generation("deployment", "shared"),
          policy: generation("signing-policy", "shared"),
        },
        accepting,
      ),
    ).toThrow(/reused across roots/u);

    const wrongPath = {
      ...generation("deployment", "release"),
      path: "generations/phoenix-mainnet/latest/",
    };
    expect(() =>
      verifyGenerationEvidenceRoots(
        {
          deployment: wrongPath,
          policy: generation("signing-policy", "security"),
        },
        accepting,
      ),
    ).toThrow(/path/u);

    expect(() =>
      verifyGenerationEvidenceRoots(
        {
          deployment: generation("deployment", "release"),
          policy: generation("signing-policy", "security"),
        },
        { verify: () => false },
      ),
    ).toThrow(/verification failed/u);

    const handBuilt = {
      ...generation("deployment", "release"),
      verified: true,
    };
    expect(() =>
      verifyGenerationEvidenceRoots(
        {
          deployment: handBuilt,
          policy: generation("signing-policy", "security"),
        },
        accepting,
      ),
    ).toThrow(/verified is not allowed/u);
  });
});
