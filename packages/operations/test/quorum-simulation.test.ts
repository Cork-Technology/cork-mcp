import { describe, expect, it } from "vitest";

import {
  createFrozenExecution,
  createSimulationAttestation,
  establishPureQuorum,
  evaluateFieldFreshness,
  refreshSimulationAttestation,
  type CoreBuildV1,
  type RawObservationSuccessV1,
  type Sha256Digest,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const blockHash = (byte: string) => `0x${byte.repeat(64)}`;

function observation(
  providerId: string,
  administrationId: string,
  value: RawObservationSuccessV1["value"],
): RawObservationSuccessV1 {
  return {
    schemaVersion: "cork.raw-observation/v1",
    kind: "success",
    providerId,
    administrationId,
    sourceId: "chain-reader-v1",
    requestDigest: digest("1"),
    sourceCommit: "ab".repeat(20),
    sourceSchemaDigest: digest("2"),
    observedAt: "1000",
    block: {
      kind: "independently-pinned",
      blockNumber: "100",
      blockHash: blockHash("a"),
      parentBlockHash: blockHash("b"),
    },
    value,
  };
}

const CORE_BUILD: CoreBuildV1 = {
  packageVersion: "0.1.0",
  sourceCommit: "cd".repeat(20),
  schemaDigest: digest("3"),
};

describe("pure quorum, field freshness, and advisory simulation", () => {
  it("requires independent same-binding raw observations and rejects verdict fields", () => {
    const quorum = establishPureQuorum([
      observation("provider-a", "operator-a", { amount: "10", set: false }),
      observation("provider-b", "operator-b", { set: false, amount: "10" }),
    ]);
    expect(quorum).toMatchObject({
      outcome: "authoritative",
      binding: {
        blockNumber: "100",
        providerIds: ["provider-a", "provider-b"],
      },
      value: { amount: "10", set: false },
    });

    expect(
      establishPureQuorum([
        { ...observation("provider-a", "operator-a", "10"), verdict: "valid" },
        observation("provider-b", "operator-b", "10"),
      ]),
    ).toEqual({
      schemaVersion: "cork.quorum/v1",
      outcome: "unavailable",
      code: "INVALID_OBSERVATION",
    });
    expect(
      establishPureQuorum([
        observation("provider-a", "same-operator", "10"),
        observation("provider-b", "same-operator", "10"),
      ]),
    ).toMatchObject({ outcome: "unavailable", code: "INDEPENDENCE_REQUIRED" });
  });

  it("applies distinct age, head, threshold, fixed-bit, and authority rules", () => {
    const quorum = establishPureQuorum([
      observation("provider-a", "operator-a", "10"),
      observation("provider-b", "operator-b", "10"),
    ]);
    expect(quorum.outcome).toBe("authoritative");
    if (quorum.outcome !== "authoritative") return;

    const fresh = evaluateFieldFreshness({
      binding: quorum.binding,
      currentHead: "102",
      currentTime: "1060",
      checks: [
        {
          kind: "exact-binding",
          field: "runtime-code",
          bound: blockHash("c"),
          current: blockHash("c"),
        },
        {
          kind: "sufficient-threshold",
          field: "balance",
          minimum: "10",
          current: "11",
        },
        {
          kind: "fixed-bit",
          field: "permit2-role-bit",
          bitPosition: "1",
          expectedSet: false,
          currentBitmapWord: "4",
        },
        {
          kind: "exact-authority",
          field: "safe-owners",
          bound: ["0x1", "0x2"],
          current: ["0x1", "0x2"],
        },
      ],
    });
    expect(fresh.outcome).toBe("fresh");

    const stale = evaluateFieldFreshness({
      binding: quorum.binding,
      currentHead: "103",
      currentTime: "1061",
      checks: [
        {
          kind: "sufficient-threshold",
          field: "balance",
          minimum: "10",
          current: "9",
        },
        {
          kind: "exact-authority",
          field: "safe-threshold",
          bound: "2",
          current: "1",
        },
      ],
    });
    expect(stale.failures.map((failure) => failure.code)).toEqual([
      "OBSERVATION_TOO_MANY_HEADS_BEHIND",
      "OBSERVATION_TOO_OLD",
      "THRESHOLD_NOT_MET",
      "AUTHORITY_CHANGED",
    ]);
  });

  it("keeps all simulation outcomes separate from unchanged frozen bytes", () => {
    const execution = createFrozenExecution({
      schemaVersion: "cork.frozen-execution/v1",
      sender: `0x${"11".repeat(20)}`,
      target: `0x${"22".repeat(20)}`,
      value: "0",
      calldata: "0x1234",
      deploymentGeneration: {
        deploymentId: "phoenix-mainnet",
        generation: "7",
        payloadDigest: digest("4"),
      },
      currentBindings: [
        { field: "market", value: digest("5") },
        { field: "runtime", value: blockHash("d") },
      ],
      accountWrapper: {
        kind: "externally-owned-account",
        from: `0x${"11".repeat(20)}`,
      },
    });
    const success = createSimulationAttestation({
      producerBuild: CORE_BUILD,
      providerIds: ["simulator-a", "simulator-b"],
      block: { blockNumber: "100", blockHash: blockHash("a") },
      simulatedAt: "1001",
      execution,
      outcome: {
        status: "success",
        traceDigest: digest("6"),
        gasUsed: "100000",
        callResultDigests: [digest("7")],
        deltasDigest: digest("8"),
        assertionDigests: [digest("9")],
      },
    });
    const unavailable = refreshSimulationAttestation(success, {
      producerBuild: CORE_BUILD,
      providerIds: ["simulator-a", "simulator-b"],
      simulatedAt: "1002",
      execution,
      outcome: {
        status: "unavailable",
        reason: {
          code: "PROVIDER_DISAGREEMENT",
          message: "Simulators disagreed.",
        },
        remediation: {
          action: "refresh",
          message: "Request new evidence for the same frozen bytes.",
        },
      },
    });
    expect(unavailable.outcome.status).toBe("unavailable");
    expect(unavailable.execution).toEqual(success.execution);
    expect(unavailable.execution.calldata).toBe("0x1234");

    expect(() =>
      refreshSimulationAttestation(success, {
        producerBuild: CORE_BUILD,
        providerIds: ["simulator-a"],
        simulatedAt: "1003",
        execution: { ...execution, calldata: "0xabcd" },
        outcome: {
          status: "revert",
          revertData: "0x",
        },
      }),
    ).toThrow(/payload digest/u);
  });
});
