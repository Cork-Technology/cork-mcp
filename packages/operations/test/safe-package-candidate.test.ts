import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  authorizeSafePermitMessages,
  createDirectPackageCandidate,
  createSafeExecutionWrapper,
  rebuildSafeWrapperForNonce,
  type ApprovedSafePolicyV1,
  type PermitAuthorizationRequestV1,
  type SafeConfigurationV1,
  type Sha256Digest,
} from "../src/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (nibble: string) => `0x${nibble.repeat(40)}`;
const bytes32 = (nibble: string) => `0x${nibble.repeat(64)}`;

const POLICY: ApprovedSafePolicyV1 = {
  schemaVersion: "cork.safe-policy/v1",
  singletonAddress: address("4"),
  singletonCodeHash: bytes32("a"),
  safeVersion: "1.4.1",
  fallbackHandlerAddress: address("5"),
  fallbackHandlerCodeHash: bytes32("b"),
  policyDigest: digest("1"),
};

function configuration(nonce = "7"): SafeConfigurationV1 {
  return {
    safeAddress: address("a"),
    singletonAddress: POLICY.singletonAddress,
    singletonCodeHash: POLICY.singletonCodeHash,
    safeVersion: POLICY.safeVersion,
    owners: [address("1"), address("2"), address("3")],
    threshold: "2",
    fallbackHandlerAddress: POLICY.fallbackHandlerAddress,
    fallbackHandlerCodeHash: POLICY.fallbackHandlerCodeHash,
    guardAddress: address("0"),
    enabledModules: [],
    nonce,
  };
}

function safeRequirements() {
  const requirement = (
    role: "cpt" | "cst",
    nonce: string,
  ): PermitAuthorizationRequestV1 => ({
    id: role === "cpt" ? "permit-cpt" : "permit-cst",
    tokenRole: role,
    signer: address("a"),
    validationMode: "safe-contract-signature",
    typedData: {
      domain: {
        name: "Permit2",
        chainId: "1",
        verifyingContract: address("6"),
      },
      primaryType: "PermitTransferFrom",
      permitted: {
        token: role === "cpt" ? address("9") : address("d"),
        amount: "1000000000000",
      },
      spender: address("8"),
      nonce,
      deadline: "2000",
    },
    typedDataDigest: digest(role === "cpt" ? "3" : "4"),
    nonce,
    wordPosition: "0",
    bitPosition: nonce,
    insertion: {
      callIndex: role === "cpt" ? "0" : "1",
      abiField: "signature",
    },
  });
  return [requirement("cpt", "0"), requirement("cst", "1")] as const;
}

function assertClosedObjects(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertClosedObjects(entry, `${path}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "object") {
    expect(record.additionalProperties, `${path} must fail closed`).toBe(false);
  }
  for (const [key, child] of Object.entries(record)) {
    assertClosedObjects(child, `${path}.${key}`);
  }
}

describe("Safe separation and immutable direct package identity", () => {
  it("validates two distinct Safe messages before creating a caller-owned wrapper", () => {
    const verifyCalls: unknown[] = [];
    const authorization = authorizeSafePermitMessages(
      {
        configuration: configuration(),
        policy: POLICY,
        requirements: safeRequirements(),
        signatureArtifacts: [
          { id: "permit-cpt", signatureBlob: "0x11" },
          { id: "permit-cst", signatureBlob: "0x22" },
        ],
      },
      {
        verify: (input) => {
          verifyCalls.push(input);
          return "0x1626ba7e";
        },
      },
    );
    expect(verifyCalls).toHaveLength(2);
    expect(authorization.messages[0].permitDigest).not.toBe(
      authorization.messages[1].permitDigest,
    );
    expect(authorization.transactionAuthorization).toBe(
      "caller-owned-not-collected",
    );

    const wrapper = createSafeExecutionWrapper(
      {
        configuration: configuration(),
        policy: POLICY,
        authorization,
        chainId: "1",
        bundler3: address("7"),
        bundlerData: "0x1234",
      },
      { verify: () => "0x1626ba7e" },
    );
    expect(wrapper).toMatchObject({
      value: "0",
      operation: "call",
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      transactionAuthorization: "caller-owned-not-collected",
    });
  });

  it("rebuilds nonce-only wrapper fields and rejects authority changes", () => {
    const authorization = authorizeSafePermitMessages(
      {
        configuration: configuration(),
        policy: POLICY,
        requirements: safeRequirements(),
        signatureArtifacts: [
          { id: "permit-cpt", signatureBlob: "0x11" },
          { id: "permit-cst", signatureBlob: "0x22" },
        ],
      },
      { verify: () => "0x1626ba7e" },
    );
    const wrapper = createSafeExecutionWrapper(
      {
        configuration: configuration(),
        policy: POLICY,
        authorization,
        chainId: "1",
        bundler3: address("7"),
        bundlerData: "0x1234",
      },
      { verify: () => "0x1626ba7e" },
    );
    const rebuilt = rebuildSafeWrapperForNonce(
      wrapper,
      {
        configuration: configuration("8"),
        policy: POLICY,
        chainId: "1",
      },
      { verify: () => "0x1626ba7e" },
    );
    expect(rebuilt.data).toBe(wrapper.data);
    expect(rebuilt.permitAuthorization.messages).toEqual(
      wrapper.permitAuthorization.messages,
    );
    expect(rebuilt.safeTxHash).not.toBe(wrapper.safeTxHash);
    expect(rebuilt.nonce).toBe("8");

    expect(() =>
      rebuildSafeWrapperForNonce(
        wrapper,
        {
          configuration: {
            ...configuration("8"),
            owners: [address("1"), address("2"), address("4")],
          },
          policy: POLICY,
          chainId: "1",
        },
        { verify: () => "0x1626ba7e" },
      ),
    ).toThrow(/authority changed/u);
  });

  it("freezes supplied package identity and proves schema and browser closure", () => {
    const candidate = createDirectPackageCandidate({
      packagePath: "/immutable/releases/corkprotocol-operations-0.2.0.tgz",
      releaseIdentity: "operations-actions-v0.2.0",
      packageArtifactDigest: digest("5"),
      sourceCommit: "ab".repeat(20),
      commonSchemaDigest: digest("6"),
      coreBuildDigest: digest("7"),
      capabilities: [
        {
          capabilityId: "cork.phoenix.authority.v1",
          capabilitySchemaDigest: digest("8"),
          capabilityProfileDigest: digest("9"),
          vectorSetDigest: digest("a"),
        },
        {
          capabilityId: "cork.phoenix.unwind.paired-shares-in.v1",
          capabilitySchemaDigest: digest("b"),
          capabilityProfileDigest: digest("c"),
          vectorSetDigest: digest("d"),
        },
      ],
    });
    expect(candidate.packageName).toBe("@corkprotocol/operations");
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.capabilities)).toBe(true);
    expect(() =>
      createDirectPackageCandidate({
        ...candidate,
        unexpected: true,
      } as never),
    ).toThrow(/not allowed/u);

    const schema = JSON.parse(
      readFileSync(
        join(PACKAGE_ROOT, "schemas", "v1", "actions.schema.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    assertClosedObjects(schema);

    for (const file of [
      "authority.ts",
      "safe.ts",
      "actions.ts",
      "package-candidate.ts",
    ]) {
      const source = readFileSync(join(PACKAGE_ROOT, "src", file), "utf8");
      for (const forbidden of [
        /\bnode:/u,
        /\bBuffer\b/u,
        /\bprocess\b/u,
        /\bsetTimeout\b/u,
        /\bsetInterval\b/u,
        /\bfetch\s*\(/u,
        /\blocalStorage\b/u,
        /\bsessionStorage\b/u,
      ]) {
        expect(source, `${file} contains ${forbidden}`).not.toMatch(forbidden);
      }
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
        expect(match[1], `${file} has a non-local import`).toMatch(/^\.\//u);
      }
    }
  });
});
