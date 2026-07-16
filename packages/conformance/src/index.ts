import { createRequire } from "node:module";

import {
  canonicalizeJson,
  type DirectPackageCandidateV1,
  type GenerationEvidenceV1,
  type JsonValue,
} from "@corkprotocol/operations";

export const PUBLIC_PACKAGE_SPECIFIERS = [
  "@corkprotocol/operations",
  "@corkprotocol/operations-node",
  "@corkprotocol/gateway",
] as const;

export function resolvePublicArtifact(specifier: string): string {
  const resolved = createRequire(import.meta.url).resolve(specifier);
  if (
    !resolved.endsWith("/dist/index.js") ||
    resolved.includes("/src/") ||
    resolved.includes("/test/")
  ) {
    throw new TypeError(
      `${specifier} did not resolve to a built public entrypoint`,
    );
  }
  return resolved;
}

export function canonicalBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalizeJson(value));
}

export function assertCanonicalEqual(
  left: JsonValue,
  right: JsonValue,
  label: string,
): void {
  const leftBytes = canonicalBytes(left);
  const rightBytes = canonicalBytes(right);
  if (
    leftBytes.length !== rightBytes.length ||
    leftBytes.some((byte, index) => byte !== rightBytes[index])
  ) {
    throw new TypeError(`${label} canonical bytes differ`);
  }
}

export function assertExactCandidate(
  candidate: DirectPackageCandidateV1,
  expected: DirectPackageCandidateV1,
): void {
  assertCanonicalEqual(
    candidate as unknown as JsonValue,
    expected as unknown as JsonValue,
    "direct package candidate",
  );
}

export function assertCandidateConformanceIdentity(
  candidate: DirectPackageCandidateV1,
  conformance: Readonly<Record<string, unknown>>,
  capabilityId: string,
): void {
  const capability = candidate.capabilities.find(
    (entry) => entry.capabilityId === capabilityId,
  );
  if (
    capability === undefined ||
    conformance["packagePath"] !== candidate.packagePath ||
    conformance["releaseIdentity"] !== candidate.releaseIdentity ||
    conformance["packageArtifactDigest"] !== candidate.packageArtifactDigest ||
    conformance["coreBuildDigest"] !== candidate.coreBuildDigest ||
    conformance["commonSchemaDigest"] !== candidate.commonSchemaDigest ||
    conformance["capabilitySchemaDigest"] !==
      capability.capabilitySchemaDigest ||
    conformance["capabilityProfileDigest"] !==
      capability.capabilityProfileDigest ||
    conformance["vectorSetDigest"] !== capability.vectorSetDigest
  ) {
    throw new TypeError("candidate and conformance identity differ");
  }
}

export function assertSeparateRoots(
  deployment: GenerationEvidenceV1,
  policy: GenerationEvidenceV1,
): void {
  const deploymentKeys = new Set(
    deployment.signatures.map((signature) => signature.keyId),
  );
  if (
    deployment.rootKind !== "deployment" ||
    policy.rootKind !== "signing-policy" ||
    deployment.repository === policy.repository ||
    deployment.path === policy.path ||
    deployment.publisher.repository === policy.publisher.repository ||
    deployment.publisher.path === policy.publisher.path ||
    deployment.publisher.identity === policy.publisher.identity ||
    deployment.reviewPromotion.reviewedByRole ===
      policy.reviewPromotion.reviewedByRole ||
    deployment.reviewPromotion.promotedByRole ===
      policy.reviewPromotion.promotedByRole ||
    deployment.payloadDigest === policy.payloadDigest ||
    policy.signatures.some((signature) => deploymentKeys.has(signature.keyId))
  ) {
    throw new TypeError(
      "deployment and policy evidence roots are not separate",
    );
  }
}
