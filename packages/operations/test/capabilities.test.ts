import { describe, expect, it } from "vitest";

import {
  CAPPED_INPUT_CAPABILITY_IDS,
  createCapabilityInventory,
  createCappedInputCapabilityRecords,
  evaluateCapabilityMaturity,
  filterCallableCapabilities,
  type CapabilityDefinitionV1,
  type CapabilitySnapshotV1,
  type CoreBuildV1,
  type Sha256Digest,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const COMMON = digest("1");
const PROFILE = digest("2");
const VECTORS = digest("3");
const CORE_BUILD: CoreBuildV1 = {
  packageVersion: "0.1.0",
  sourceCommit: "ab".repeat(20),
  schemaDigest: COMMON,
};
const DEFINITION: CapabilityDefinitionV1 = {
  capabilityId: "cork.phoenix.unwind.paired-shares-in.v1",
  version: "1",
  specified: true,
  commonProfileDigest: COMMON,
  capabilityProfileDigest: PROFILE,
  vectorSetDigest: VECTORS,
};
const IMPLEMENTATION = {
  commonProfileDigest: COMMON,
  capabilityProfileDigest: PROFILE,
  vectorSetDigest: VECTORS,
};
const ACTIVE: CapabilitySnapshotV1 = {
  implementation: IMPLEMENTATION,
  operatorIntent: { deploymentId: "phoenix-mainnet", generation: "7" },
  evidence: {
    deploymentId: "phoenix-mainnet",
    generation: "7",
    status: "active",
  },
  healthy: true,
};

describe("capability-local maturity", () => {
  it("requires exact profile-local release digests", () => {
    const implemented = evaluateCapabilityMaturity(DEFINITION, ACTIVE);
    const unrelated = evaluateCapabilityMaturity(
      {
        ...DEFINITION,
        capabilityId: "cork.market.deploy.v1",
        capabilityProfileDigest: digest("4"),
      },
      ACTIVE,
    );
    expect(implemented.implemented).toBe(true);
    expect(implemented.callable).toBe(true);
    expect(unrelated.implemented).toBe(false);
    expect(unrelated.callable).toBe(false);
  });

  it("keeps activation while recoverable health changes and recovers callability", () => {
    const unhealthy = evaluateCapabilityMaturity(DEFINITION, {
      ...ACTIVE,
      healthy: false,
      healthReason: {
        code: "PROVIDER_OUTAGE",
        message: "Provider unavailable.",
        remediation: "Restore the same provider binding.",
      },
    });
    const recovered = evaluateCapabilityMaturity(DEFINITION, ACTIVE);
    expect(unhealthy).toMatchObject({
      implemented: true,
      activated: true,
      healthy: false,
      callable: false,
    });
    expect(recovered).toMatchObject({
      implemented: true,
      activated: true,
      healthy: true,
      callable: true,
    });
  });

  it("clears activation terminally for retirement and emergency disable", () => {
    for (const status of ["retired", "emergency-disabled"] as const) {
      const record = evaluateCapabilityMaturity(DEFINITION, {
        ...ACTIVE,
        evidence: { ...ACTIVE.evidence!, status },
        healthy: true,
      });
      expect(record.activated).toBe(false);
      expect(record.callable).toBe(false);
      expect(record.unavailableReason?.code).toMatch(
        status === "retired" ? /RETIRED/u : /EMERGENCY_DISABLED/u,
      );
    }
  });

  it("never inherits activation into a higher generation", () => {
    const higher = evaluateCapabilityMaturity(DEFINITION, {
      ...ACTIVE,
      evidence: {
        deploymentId: "phoenix-mainnet",
        generation: "8",
        status: "active",
      },
    });
    expect(higher.activated).toBe(false);
    expect(higher.unavailableReason?.code).toBe(
      "ACTIVATION_GENERATION_MISMATCH",
    );
  });

  it("filters callable discovery exactly", () => {
    const callable = evaluateCapabilityMaturity(DEFINITION, ACTIVE);
    const unavailable = evaluateCapabilityMaturity(
      { ...DEFINITION, capabilityId: "cork.phoenix.mint.collateral-in.v1" },
      { ...ACTIVE, healthy: false },
    );
    const inventory = createCapabilityInventory(CORE_BUILD, [
      unavailable,
      callable,
    ]);
    expect(inventory.callableCapabilityIds).toEqual([
      "cork.phoenix.unwind.paired-shares-in.v1",
    ]);
    expect(filterCallableCapabilities(inventory)).toEqual([callable]);
  });
});

describe("capped-input records", () => {
  it("returns exactly seven stable specified non-callable records", () => {
    const records = createCappedInputCapabilityRecords(COMMON);
    expect(records).toHaveLength(7);
    expect(records.map((record) => record.capabilityId)).toEqual(
      CAPPED_INPUT_CAPABILITY_IDS,
    );
    for (const record of records) {
      expect(record).toMatchObject({
        specified: true,
        implemented: false,
        activated: false,
        healthy: false,
        callable: false,
        unavailableReason: {
          code: "CAPPED_INPUT_PROTOCOL_UNAVAILABLE",
        },
      });
      const serialized = JSON.stringify(record);
      for (const forbidden of [
        "approval",
        "signingRequest",
        "transactionTemplate",
        "executableBytes",
        "fallback",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});
