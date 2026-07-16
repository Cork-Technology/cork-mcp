import {
  assertClosedObject,
  assertSha256Digest,
  canonicalizeJson,
  deepFreeze,
  sha256CanonicalJson,
  type JsonValue,
  type Sha256Digest,
} from "./kernel.js";

export interface DirectPackageCapabilityV1 {
  readonly capabilityId: string;
  readonly capabilitySchemaDigest: Sha256Digest;
  readonly capabilityProfileDigest: Sha256Digest;
  readonly vectorSetDigest: Sha256Digest;
}

export interface DirectPackageCandidateV1 {
  readonly schemaVersion: "cork.direct-package-candidate/v1";
  readonly packageName: "@corkprotocol/operations";
  readonly packagePath: string;
  readonly releaseIdentity: string;
  readonly packageArtifactDigest: Sha256Digest;
  readonly sourceCommit: string;
  readonly commonSchemaDigest: Sha256Digest;
  readonly coreBuildDigest: Sha256Digest;
  readonly capabilities: readonly DirectPackageCapabilityV1[];
  readonly candidateDigest: Sha256Digest;
}

const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

export function createDirectPackageCandidate(
  input: Omit<
    DirectPackageCandidateV1,
    "schemaVersion" | "packageName" | "candidateDigest"
  >,
): DirectPackageCandidateV1 {
  assertClosedObject(input, "package candidate input", [
    "packagePath",
    "releaseIdentity",
    "packageArtifactDigest",
    "sourceCommit",
    "commonSchemaDigest",
    "coreBuildDigest",
    "capabilities",
  ]);
  assertNonEmptyString(input.packagePath, "packagePath");
  if (
    !input.packagePath.startsWith("/") ||
    input.packagePath.includes("/../") ||
    input.packagePath.endsWith("/")
  ) {
    throw new TypeError("packagePath must be an exact immutable absolute path");
  }
  assertNonEmptyString(input.releaseIdentity, "releaseIdentity");
  assertSha256Digest(input.packageArtifactDigest, "packageArtifactDigest");
  if (
    typeof input.sourceCommit !== "string" ||
    !SOURCE_COMMIT.test(input.sourceCommit)
  ) {
    throw new TypeError(
      "sourceCommit must be 40 lowercase hexadecimal characters",
    );
  }
  assertSha256Digest(input.commonSchemaDigest, "commonSchemaDigest");
  assertSha256Digest(input.coreBuildDigest, "coreBuildDigest");
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) {
    throw new TypeError("capabilities must be a non-empty closed set");
  }
  const ids = new Set<string>();
  const capabilities = input.capabilities.map((capability, index) => {
    assertClosedObject(capability, `capabilities[${index}]`, [
      "capabilityId",
      "capabilitySchemaDigest",
      "capabilityProfileDigest",
      "vectorSetDigest",
    ]);
    assertNonEmptyString(
      capability.capabilityId,
      `capabilities[${index}].capabilityId`,
    );
    if (ids.has(capability.capabilityId)) {
      throw new TypeError("capability identifiers must be unique");
    }
    ids.add(capability.capabilityId);
    assertSha256Digest(
      capability.capabilitySchemaDigest,
      `capabilities[${index}].capabilitySchemaDigest`,
    );
    assertSha256Digest(
      capability.capabilityProfileDigest,
      `capabilities[${index}].capabilityProfileDigest`,
    );
    assertSha256Digest(
      capability.vectorSetDigest,
      `capabilities[${index}].vectorSetDigest`,
    );
    return {
      capabilityId: capability.capabilityId,
      capabilitySchemaDigest: capability.capabilitySchemaDigest,
      capabilityProfileDigest: capability.capabilityProfileDigest,
      vectorSetDigest: capability.vectorSetDigest,
    };
  });
  const ordered = [...capabilities].sort((left, right) =>
    left.capabilityId.localeCompare(right.capabilityId),
  );
  if (
    ordered.some(
      (capability, index) =>
        capability.capabilityId !== capabilities[index]?.capabilityId,
    )
  ) {
    throw new TypeError("capabilities must be ordered by capabilityId");
  }
  const withoutDigest: Omit<DirectPackageCandidateV1, "candidateDigest"> = {
    schemaVersion: "cork.direct-package-candidate/v1",
    packageName: "@corkprotocol/operations",
    packagePath: input.packagePath,
    releaseIdentity: input.releaseIdentity,
    packageArtifactDigest: input.packageArtifactDigest,
    sourceCommit: input.sourceCommit,
    commonSchemaDigest: input.commonSchemaDigest,
    coreBuildDigest: input.coreBuildDigest,
    capabilities,
  };
  canonicalizeJson(withoutDigest as unknown as JsonValue);
  return deepFreeze({
    ...withoutDigest,
    candidateDigest: sha256CanonicalJson(withoutDigest as unknown as JsonValue),
  }) as DirectPackageCandidateV1;
}

export function validateDirectPackageCandidate(
  value: unknown,
): DirectPackageCandidateV1 {
  assertClosedObject(value, "direct package candidate", [
    "schemaVersion",
    "packageName",
    "packagePath",
    "releaseIdentity",
    "packageArtifactDigest",
    "sourceCommit",
    "commonSchemaDigest",
    "coreBuildDigest",
    "capabilities",
    "candidateDigest",
  ]);
  if (
    value.schemaVersion !== "cork.direct-package-candidate/v1" ||
    value.packageName !== "@corkprotocol/operations"
  ) {
    throw new TypeError("direct package candidate identity is invalid");
  }
  assertSha256Digest(value.candidateDigest, "candidateDigest");
  const candidate = createDirectPackageCandidate({
    packagePath: value.packagePath as string,
    releaseIdentity: value.releaseIdentity as string,
    packageArtifactDigest: value.packageArtifactDigest as Sha256Digest,
    sourceCommit: value.sourceCommit as string,
    commonSchemaDigest: value.commonSchemaDigest as Sha256Digest,
    coreBuildDigest: value.coreBuildDigest as Sha256Digest,
    capabilities: value.capabilities as readonly DirectPackageCapabilityV1[],
  });
  if (candidate.candidateDigest !== value.candidateDigest) {
    throw new TypeError("direct package candidate digest does not match");
  }
  return candidate;
}
