import {
  assertClosedObject,
  assertCoreBuild,
  assertSha256Digest,
  assertUint256Decimal,
  deepFreeze,
  sha256CanonicalJson,
  type CoreBuildV1,
  type Sha256Digest,
} from "./kernel.js";

export const EVIDENCE_STATUSES = [
  "staged",
  "active",
  "retired",
  "emergency-disabled",
] as const;

export type EvidenceStatusV1 = (typeof EVIDENCE_STATUSES)[number];

export interface CapabilityDefinitionV1 {
  readonly capabilityId: string;
  readonly version: string;
  readonly specified: true;
  readonly commonProfileDigest: Sha256Digest;
  readonly capabilityProfileDigest: Sha256Digest;
  readonly vectorSetDigest: Sha256Digest;
}

export interface CapabilityReleaseDigestsV1 {
  readonly commonProfileDigest: Sha256Digest;
  readonly capabilityProfileDigest: Sha256Digest;
  readonly vectorSetDigest: Sha256Digest;
}

export interface ActivationBindingV1 {
  readonly deploymentId: string;
  readonly generation: string;
}

export interface EvidenceBindingV1 extends ActivationBindingV1 {
  readonly status: EvidenceStatusV1;
}

export interface CapabilityUnavailableReasonV1 {
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
}

export interface CapabilitySnapshotV1 {
  readonly implementation?: CapabilityReleaseDigestsV1;
  readonly operatorIntent?: ActivationBindingV1;
  readonly evidence?: EvidenceBindingV1;
  readonly healthy: boolean;
  readonly healthReason?: CapabilityUnavailableReasonV1;
}

export interface CapabilityMaturityV1 extends CapabilityDefinitionV1 {
  readonly implemented: boolean;
  readonly activated: boolean;
  readonly healthy: boolean;
  readonly callable: boolean;
  readonly operatorBinding?: ActivationBindingV1;
  readonly evidence?: EvidenceBindingV1;
  readonly unavailableReason?: CapabilityUnavailableReasonV1;
}

export interface CapabilityInventoryV1 {
  readonly schemaVersion: "cork.capabilities/v1";
  readonly coreBuild: CoreBuildV1;
  readonly capabilities: readonly CapabilityMaturityV1[];
  readonly callableCapabilityIds: readonly string[];
}

export const CAPPED_INPUT_CAPABILITY_IDS = [
  "cork.phoenix.exercise.swap-token-in.v1",
  "cork.phoenix.exercise.reference-asset-in.v1",
  "cork.phoenix.exercise.collateral-out.v1",
  "cork.phoenix.repurchase.swap-token-out.v1",
  "cork.phoenix.repurchase.reference-asset-out.v1",
  "cork.phoenix.redeem.collateral-out.v1",
  "cork.phoenix.redeem.reference-asset-out.v1",
] as const;

const CAPPED_INPUT_REASON: CapabilityUnavailableReasonV1 = {
  code: "CAPPED_INPUT_PROTOCOL_UNAVAILABLE",
  message: "The exact capped-input onchain protocol is not available.",
  remediation:
    "Release the separate protocol specification, audited implementation, deployed evidence, operation profile, and cross-language signing-gate vectors for this exact variant.",
};

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function validateDefinition(value: unknown): CapabilityDefinitionV1 {
  assertClosedObject(value, "capability definition", [
    "capabilityId",
    "version",
    "specified",
    "commonProfileDigest",
    "capabilityProfileDigest",
    "vectorSetDigest",
  ]);
  assertNonEmptyString(value.capabilityId, "capabilityId");
  assertNonEmptyString(value.version, "version");
  if (value.specified !== true) {
    throw new TypeError("specified must be true");
  }
  assertSha256Digest(value.commonProfileDigest, "commonProfileDigest");
  assertSha256Digest(value.capabilityProfileDigest, "capabilityProfileDigest");
  assertSha256Digest(value.vectorSetDigest, "vectorSetDigest");
  return {
    capabilityId: value.capabilityId,
    version: value.version,
    specified: true,
    commonProfileDigest: value.commonProfileDigest,
    capabilityProfileDigest: value.capabilityProfileDigest,
    vectorSetDigest: value.vectorSetDigest,
  };
}

function validateReleaseDigests(value: unknown): CapabilityReleaseDigestsV1 {
  assertClosedObject(value, "implementation", [
    "commonProfileDigest",
    "capabilityProfileDigest",
    "vectorSetDigest",
  ]);
  assertSha256Digest(
    value.commonProfileDigest,
    "implementation.commonProfileDigest",
  );
  assertSha256Digest(
    value.capabilityProfileDigest,
    "implementation.capabilityProfileDigest",
  );
  assertSha256Digest(value.vectorSetDigest, "implementation.vectorSetDigest");
  return {
    commonProfileDigest: value.commonProfileDigest,
    capabilityProfileDigest: value.capabilityProfileDigest,
    vectorSetDigest: value.vectorSetDigest,
  };
}

function validateActivationBinding(
  value: unknown,
  label: string,
): ActivationBindingV1 {
  assertClosedObject(value, label, ["deploymentId", "generation"]);
  assertNonEmptyString(value.deploymentId, `${label}.deploymentId`);
  assertUint256Decimal(value.generation, `${label}.generation`);
  return {
    deploymentId: value.deploymentId,
    generation: value.generation,
  };
}

function validateEvidence(value: unknown): EvidenceBindingV1 {
  assertClosedObject(value, "evidence", [
    "deploymentId",
    "generation",
    "status",
  ]);
  const binding = validateActivationBinding(
    { deploymentId: value.deploymentId, generation: value.generation },
    "evidence binding",
  );
  if (
    typeof value.status !== "string" ||
    !EVIDENCE_STATUSES.includes(value.status as EvidenceStatusV1)
  ) {
    throw new TypeError("evidence.status is not supported");
  }
  return { ...binding, status: value.status as EvidenceStatusV1 };
}

function validateUnavailableReason(
  value: unknown,
  label: string,
): CapabilityUnavailableReasonV1 {
  assertClosedObject(value, label, ["code", "message", "remediation"]);
  assertNonEmptyString(value.code, `${label}.code`);
  assertNonEmptyString(value.message, `${label}.message`);
  assertNonEmptyString(value.remediation, `${label}.remediation`);
  return {
    code: value.code,
    message: value.message,
    remediation: value.remediation,
  };
}

function sameRelease(
  definition: CapabilityDefinitionV1,
  implementation: CapabilityReleaseDigestsV1 | undefined,
): boolean {
  return (
    implementation !== undefined &&
    implementation.commonProfileDigest === definition.commonProfileDigest &&
    implementation.capabilityProfileDigest ===
      definition.capabilityProfileDigest &&
    implementation.vectorSetDigest === definition.vectorSetDigest
  );
}

function sameBinding(
  left: ActivationBindingV1 | undefined,
  right: ActivationBindingV1 | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.deploymentId === right.deploymentId &&
    left.generation === right.generation
  );
}

function unavailableReason(
  implemented: boolean,
  activated: boolean,
  healthy: boolean,
  snapshot: CapabilitySnapshotV1,
): CapabilityUnavailableReasonV1 | undefined {
  if (!implemented) {
    return {
      code: "CAPABILITY_NOT_IMPLEMENTED",
      message:
        "The exact common, capability, and vector releases do not match.",
      remediation:
        "Install the exact capability-local released profile and vectors.",
    };
  }
  if (!activated) {
    if (snapshot.evidence?.status === "retired") {
      return {
        code: "MANIFEST_RETIRED",
        message: "The operator-bound evidence generation is retired.",
        remediation:
          "Explicitly activate a higher active generation after conformance.",
      };
    }
    if (snapshot.evidence?.status === "emergency-disabled") {
      return {
        code: "MANIFEST_EMERGENCY_DISABLED",
        message:
          "The operator-bound evidence generation is emergency-disabled.",
        remediation:
          "Explicitly activate a higher active generation after conformance.",
      };
    }
    if (
      snapshot.operatorIntent !== undefined &&
      snapshot.evidence !== undefined &&
      !sameBinding(snapshot.operatorIntent, snapshot.evidence)
    ) {
      return {
        code: "ACTIVATION_GENERATION_MISMATCH",
        message:
          "Evidence does not match the exact operator-bound deployment generation.",
        remediation:
          "Create a new explicit activation decision for the intended generation.",
      };
    }
    return {
      code: "CAPABILITY_NOT_ACTIVATED",
      message:
        "No exact active evidence generation is bound by operator intent.",
      remediation:
        "Explicitly bind an active conformance-proven deployment generation.",
    };
  }
  if (!healthy) {
    return (
      snapshot.healthReason ?? {
        code: "CAPABILITY_UNHEALTHY",
        message: "A recoverable runtime dependency is unhealthy.",
        remediation:
          "Restore the runtime dependency under the same active generation.",
      }
    );
  }
  return undefined;
}

export function evaluateCapabilityMaturity(
  definitionInput: CapabilityDefinitionV1,
  snapshotInput: CapabilitySnapshotV1,
): CapabilityMaturityV1 {
  const definition = validateDefinition(definitionInput);
  assertClosedObject(
    snapshotInput,
    "capability snapshot",
    ["healthy"],
    ["implementation", "operatorIntent", "evidence", "healthReason"],
  );
  if (typeof snapshotInput.healthy !== "boolean") {
    throw new TypeError("healthy must be a boolean");
  }
  const implementation =
    snapshotInput.implementation === undefined
      ? undefined
      : validateReleaseDigests(snapshotInput.implementation);
  const operatorBinding =
    snapshotInput.operatorIntent === undefined
      ? undefined
      : validateActivationBinding(
          snapshotInput.operatorIntent,
          "operatorIntent",
        );
  const evidence =
    snapshotInput.evidence === undefined
      ? undefined
      : validateEvidence(snapshotInput.evidence);
  const healthReason =
    snapshotInput.healthReason === undefined
      ? undefined
      : validateUnavailableReason(snapshotInput.healthReason, "healthReason");
  const snapshot: CapabilitySnapshotV1 = {
    healthy: snapshotInput.healthy,
    ...(implementation === undefined ? {} : { implementation }),
    ...(operatorBinding === undefined
      ? {}
      : { operatorIntent: operatorBinding }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(healthReason === undefined ? {} : { healthReason }),
  };

  const implemented = sameRelease(definition, implementation);
  const activated =
    sameBinding(operatorBinding, evidence) && evidence?.status === "active";
  const callable = implemented && activated && snapshot.healthy;
  const reason = unavailableReason(
    implemented,
    activated,
    snapshot.healthy,
    snapshot,
  );
  return deepFreeze({
    ...definition,
    implemented,
    activated,
    healthy: snapshot.healthy,
    callable,
    ...(operatorBinding === undefined ? {} : { operatorBinding }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(reason === undefined ? {} : { unavailableReason: reason }),
  }) as CapabilityMaturityV1;
}

export function createCapabilityInventory(
  coreBuildInput: CoreBuildV1,
  capabilitiesInput: readonly CapabilityMaturityV1[],
): CapabilityInventoryV1 {
  assertCoreBuild(coreBuildInput);
  if (!Array.isArray(capabilitiesInput)) {
    throw new TypeError("capabilities must be an array");
  }
  const ids = new Set<string>();
  const capabilities = capabilitiesInput.map((record, index) => {
    validateCapabilityRecord(record, `capabilities[${index}]`);
    if (ids.has(record.capabilityId)) {
      throw new TypeError(`duplicate capabilityId ${record.capabilityId}`);
    }
    ids.add(record.capabilityId);
    return record;
  });
  const sorted = [...capabilities].sort((left, right) =>
    left.capabilityId < right.capabilityId
      ? -1
      : left.capabilityId > right.capabilityId
        ? 1
        : 0,
  );
  return deepFreeze({
    schemaVersion: "cork.capabilities/v1",
    coreBuild: {
      packageVersion: coreBuildInput.packageVersion,
      sourceCommit: coreBuildInput.sourceCommit,
      schemaDigest: coreBuildInput.schemaDigest,
    },
    capabilities: sorted,
    callableCapabilityIds: sorted
      .filter((capability) => capability.callable)
      .map((capability) => capability.capabilityId),
  }) as CapabilityInventoryV1;
}

function validateCapabilityRecord(value: unknown, label: string): void {
  assertClosedObject(
    value,
    label,
    [
      "capabilityId",
      "version",
      "specified",
      "commonProfileDigest",
      "capabilityProfileDigest",
      "vectorSetDigest",
      "implemented",
      "activated",
      "healthy",
      "callable",
    ],
    ["operatorBinding", "evidence", "unavailableReason"],
  );
  validateDefinition({
    capabilityId: value.capabilityId,
    version: value.version,
    specified: value.specified,
    commonProfileDigest: value.commonProfileDigest,
    capabilityProfileDigest: value.capabilityProfileDigest,
    vectorSetDigest: value.vectorSetDigest,
  } as CapabilityDefinitionV1);
  for (const key of [
    "implemented",
    "activated",
    "healthy",
    "callable",
  ] as const) {
    if (typeof value[key] !== "boolean") {
      throw new TypeError(`${label}.${key} must be a boolean`);
    }
  }
  if (
    value.callable !== (value.implemented && value.activated && value.healthy)
  ) {
    throw new TypeError(
      `${label}.callable must equal implemented && activated && healthy`,
    );
  }
  const operatorBinding =
    value.operatorBinding === undefined
      ? undefined
      : validateActivationBinding(
          value.operatorBinding,
          `${label}.operatorBinding`,
        );
  const evidence =
    value.evidence === undefined ? undefined : validateEvidence(value.evidence);
  if (value.activated) {
    if (
      operatorBinding === undefined ||
      evidence === undefined ||
      evidence.status !== "active" ||
      !sameBinding(operatorBinding, evidence)
    ) {
      throw new TypeError(
        `${label}.activated requires the exact active bound generation`,
      );
    }
  }
  const unavailable = !(value.implemented && value.activated && value.healthy);
  if (unavailable !== (value.unavailableReason !== undefined)) {
    throw new TypeError(
      `${label}.unavailableReason has invalid conditional presence`,
    );
  }
  if (value.unavailableReason !== undefined) {
    validateUnavailableReason(
      value.unavailableReason,
      `${label}.unavailableReason`,
    );
  }
}

export function filterCallableCapabilities(
  inventory: CapabilityInventoryV1,
): readonly CapabilityMaturityV1[] {
  validateCapabilityInventory(inventory);
  return deepFreeze(
    inventory.capabilities.filter((capability) => capability.callable),
  ) as readonly CapabilityMaturityV1[];
}

export function validateCapabilityInventory(
  value: unknown,
): CapabilityInventoryV1 {
  assertClosedObject(value, "capability inventory", [
    "schemaVersion",
    "coreBuild",
    "capabilities",
    "callableCapabilityIds",
  ]);
  if (value.schemaVersion !== "cork.capabilities/v1") {
    throw new TypeError("capability inventory schemaVersion is invalid");
  }
  assertCoreBuild(value.coreBuild);
  if (
    !Array.isArray(value.capabilities) ||
    !Array.isArray(value.callableCapabilityIds)
  ) {
    throw new TypeError("capability arrays are required");
  }
  const seen = new Set<string>();
  value.capabilities.forEach((record, index) => {
    validateCapabilityRecord(record, `capabilities[${index}]`);
    if (seen.has(record.capabilityId)) {
      throw new TypeError(`duplicate capabilityId ${record.capabilityId}`);
    }
    seen.add(record.capabilityId);
  });
  const expectedCallable = value.capabilities
    .filter((record) => record.callable)
    .map((record) => record.capabilityId);
  if (
    value.callableCapabilityIds.length !== expectedCallable.length ||
    value.callableCapabilityIds.some(
      (id, index) => id !== expectedCallable[index],
    )
  ) {
    throw new TypeError(
      "callableCapabilityIds must exactly project callable records",
    );
  }
  const clone = JSON.parse(JSON.stringify(value)) as CapabilityInventoryV1;
  return deepFreeze(clone) as CapabilityInventoryV1;
}

export function createCappedInputCapabilityRecords(
  commonProfileDigest: Sha256Digest,
): readonly CapabilityMaturityV1[] {
  assertSha256Digest(commonProfileDigest, "commonProfileDigest");
  return deepFreeze(
    CAPPED_INPUT_CAPABILITY_IDS.map((capabilityId) => {
      const capabilityProfileDigest = sha256CanonicalJson({
        schemaVersion: "cork.capability-profile/v1",
        capabilityId,
        status: "unreleased-capped-input",
      });
      const vectorSetDigest = sha256CanonicalJson({
        schemaVersion: "cork.vector-set/v1",
        capabilityId,
        status: "unreleased-capped-input",
      });
      return {
        capabilityId,
        version: "1",
        specified: true,
        commonProfileDigest,
        capabilityProfileDigest,
        vectorSetDigest,
        implemented: false,
        activated: false,
        healthy: false,
        callable: false,
        unavailableReason: CAPPED_INPUT_REASON,
      };
    }),
  ) as readonly CapabilityMaturityV1[];
}
