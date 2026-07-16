import { describe, expect, it } from "vitest";

import {
  OPERATION_STATES,
  canonicalizeJson,
  createOperationResult,
  deriveOperationId,
  keccak256Digest,
  sha256CanonicalJson,
  validateOperationResult,
  type CoreBuildV1,
  type JsonValue,
  type OperationResultBuilderInput,
  type Sha256Digest,
} from "../src/index.js";

const SHA = `sha256:${"11".repeat(32)}` as Sha256Digest;
const OTHER_SHA = `sha256:${"22".repeat(32)}` as Sha256Digest;
const KECCAK = `keccak256:${"33".repeat(32)}` as const;
const CORE_BUILD: CoreBuildV1 = {
  packageVersion: "0.1.0",
  sourceCommit: "ab".repeat(20),
  schemaDigest: SHA,
};
const IDENTITY = {
  intent: {
    amount: "100",
    variant: "paired-shares-in",
  },
  account: {
    kind: "externally-owned-account" as const,
    address: `0x${"11".repeat(20)}`,
  },
  deploymentId: "deployment-mainnet",
  chainId: "1",
  clientRequestId: "client-001",
};

describe("canonical JSON and cryptographic kernel", () => {
  it("uses UTF-16 key order, exact escaping, and shortest ECMAScript numbers", () => {
    expect(
      canonicalizeJson({
        "\u20ac": "Euro",
        "\r": "CR",
        "\ufb33": "Hebrew",
        "1": [333333333.33333329, 1e30, 4.5, 0.002, 1e-27, -0],
        "\ud83d\ude00": '"\\\b\t\n\f\r',
      }),
    ).toBe(
      '{"\\r":"CR","1":[333333333.3333333,1e+30,4.5,0.002,1e-27,0],"€":"Euro","😀":"\\"\\\\\\b\\t\\n\\f\\r","דּ":"Hebrew"}',
    );
  });

  it("rejects values outside validated Internet JSON", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = new Array(2);
    sparse[0] = 1;
    const symbolKey = { a: 1 } as Record<PropertyKey, unknown>;
    symbolKey[Symbol("hidden")] = 2;

    for (const value of [
      { value: undefined },
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: new Date(0) },
      { value: "\ud800" },
      cycle,
      sparse,
      symbolKey,
    ]) {
      expect(() => canonicalizeJson(value as JsonValue)).toThrow();
    }
  });

  it("matches published Secure Hash Algorithm 256 and Ethereum Keccak vectors", () => {
    expect(sha256CanonicalJson({ a: 1 })).toBe(
      "sha256:015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    );
    expect(keccak256Digest(new Uint8Array())).toBe(
      "keccak256:c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("matches an independently generated operation identifier vector", () => {
    const intentDigest = sha256CanonicalJson(IDENTITY.intent);
    expect(intentDigest).toBe(
      "sha256:724a4d577a73c67abd54b4877e0e5c540c84ffbbb1d77874b191abbd2907aed3",
    );
    expect(
      deriveOperationId({
        account: IDENTITY.account,
        deploymentId: IDENTITY.deploymentId,
        chainId: IDENTITY.chainId,
        clientRequestId: IDENTITY.clientRequestId,
        intentDigest,
      }),
    ).toBe("op_9020edcf1b30a48f9ced538cd19fc55d");
  });

  it("strictly rejects non-canonical identity fields", () => {
    expect(() =>
      deriveOperationId({
        account: {
          kind: "externally-owned-account",
          address: `0x${"AA".repeat(20)}`,
        },
        deploymentId: "deployment-mainnet",
        chainId: "01",
        clientRequestId: "client-001",
        intentDigest: SHA,
      }),
    ).toThrow();
    expect(() =>
      deriveOperationId({
        account: {
          kind: "externally-owned-account",
          address: `0x${"11".repeat(20)}`,
        },
        deploymentId: "deployment-mainnet",
        chainId: "1",
        clientRequestId: "client-001",
        intentDigest: "sha256:ABC" as Sha256Digest,
      }),
    ).toThrow();
  });
});

describe("closed immutable operation results", () => {
  it("constructs and validates all ten closed states", () => {
    const common = { coreBuild: CORE_BUILD, createdAt: "1700000000" };
    const inputs: readonly OperationResultBuilderInput[] = [
      { ...common, state: "read-result", resultDigest: SHA },
      {
        ...common,
        state: "invalid",
        receivedInput: { bad: true },
        issues: [
          {
            code: "INVALID",
            path: "$.bad",
            message: "Invalid input.",
            expected: "false",
            actual: "true",
            retryable: false,
          },
        ],
      },
      {
        ...common,
        state: "unavailable",
        identity: IDENTITY,
        affectedArtifactDigest: SHA,
        reason: {
          code: "UPSTREAM_UNHEALTHY",
          message: "Unavailable.",
          dependency: "provider",
          retryable: true,
          retryAfter: "10",
        },
      },
      {
        ...common,
        state: "prerequisite",
        identity: IDENTITY,
        artifactDigest: SHA,
      },
      { ...common, state: "prepared", identity: IDENTITY, artifactDigest: SHA },
      {
        ...common,
        state: "finalized",
        identity: IDENTITY,
        artifactDigest: SHA,
        executionDigest: KECCAK,
      },
      {
        ...common,
        state: "executable",
        identity: IDENTITY,
        artifactDigest: SHA,
        executionDigest: KECCAK,
        certificateDigest: OTHER_SHA,
      },
      {
        ...common,
        state: "permit2-revocation",
        identity: IDENTITY,
        artifactDigest: SHA,
        executionDigest: KECCAK,
      },
      { ...common, state: "submitted", submissionDigest: SHA },
      { ...common, state: "reconciled", reconciliationDigest: SHA },
    ];

    const results = inputs.map((input) => createOperationResult(input));
    expect(results.map((result) => result.state)).toEqual(OPERATION_STATES);
    for (const result of results) {
      expect(validateOperationResult(result)).toEqual(result);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.coreBuild)).toBe(true);
    }
  });

  it("deep-freezes nested output and rejects unknown fields", () => {
    const result = createOperationResult({
      state: "prepared",
      coreBuild: CORE_BUILD,
      createdAt: "1700000000",
      identity: IDENTITY,
      artifactDigest: SHA,
      warnings: [{ code: "NOTICE", message: "Immutable." }],
    });
    expect(Object.isFrozen(result.account)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(Object.isFrozen(result.warnings?.[0])).toBe(true);
    expect(() => {
      (result.account as { address: string }).address = `0x${"22".repeat(20)}`;
    }).toThrow();

    expect(() =>
      validateOperationResult({ ...result, lookupKey: "forbidden" }),
    ).toThrow(/not allowed/u);
    expect(() =>
      createOperationResult({
        state: "read-result",
        coreBuild: CORE_BUILD,
        createdAt: "1",
        resultDigest: SHA,
        lookupKey: "forbidden",
      } as never),
    ).toThrow(/not allowed/u);
  });

  it("does not let caller intent supply derived envelope fields", () => {
    expect(() =>
      createOperationResult({
        state: "prepared",
        coreBuild: CORE_BUILD,
        createdAt: "1",
        identity: {
          ...IDENTITY,
          intent: { ...IDENTITY.intent, operationId: "caller-controlled" },
        },
        artifactDigest: SHA,
      }),
    ).toThrow(/derived field/u);
  });
});
