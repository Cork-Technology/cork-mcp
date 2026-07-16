import { describe, expect, it } from "vitest";

import {
  authorizeSafePermitMessages,
  createCappedInputCapabilityRecords,
  createCappedInputUnavailableActions,
  createSafeExecutionWrapper,
  finalizePairedSharesUnwind,
  preparePairedSharesUnwind,
  type ApprovedSafePolicyV1,
  type SafeConfigurationV1,
  type Sha256Digest,
} from "@corkprotocol/operations";
import {
  createFixtureGenerationRoots,
  fixtureEvidenceVerifier,
} from "./generation-roots-fixture.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (byte: string) => `0x${byte.repeat(40)}`;
const bytes32 = (byte: string) => `0x${byte.repeat(64)}`;

const POLICY: ApprovedSafePolicyV1 = {
  schemaVersion: "cork.safe-policy/v1",
  singletonAddress: address("4"),
  singletonCodeHash: bytes32("a"),
  safeVersion: "fixture-1.4.1",
  fallbackHandlerAddress: address("5"),
  fallbackHandlerCodeHash: bytes32("b"),
  policyDigest: digest("1"),
};

const EVIDENCE_ROOTS = createFixtureGenerationRoots({
  deploymentId: "fixture-deployment",
  chainId: "31337",
  poolId: bytes32("c"),
  collateralAsset: address("e"),
  referenceAsset: address("f"),
  cptAddress: address("9"),
  cstAddress: address("d"),
  limitOrderProtocolAddress: address("1"),
});

function configuration(): SafeConfigurationV1 {
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
    nonce: "7",
  };
}

function prepared() {
  return preparePairedSharesUnwind(
    {
      intent: {
        schemaVersion: "cork.operation/v1",
        action: "phoenix.unwind-mint",
        clientRequestId: "fixture-unwind",
        account: { kind: "safe", address: address("a") },
        chainId: "31337",
        deploymentId: "fixture-deployment",
        poolId: bytes32("c"),
        requestedSharesIn: "1000000000000",
        receiver: address("b"),
        minCollateralAssetsOut: "10",
        deadline: "2000",
      },
      bindings: {
        evidenceRoots: EVIDENCE_ROOTS,
        liveCollateralDecimals: "6",
        preparedAt: "1000",
        adapterStartingBalancesDigest: digest("4"),
      },
    },
    fixtureEvidenceVerifier,
  );
}

describe("action, Safe, and capped-input boundaries", () => {
  it("keeps funding, signatures, wrapper construction, and confirmations separate", () => {
    const action = prepared();
    expect(action.callTemplates).toHaveLength(3);
    expect(action.authorizations).toHaveLength(2);
    expect(JSON.stringify(action)).not.toContain("signatureBlob");

    const finalized = finalizePairedSharesUnwind(
      {
        prepared: action,
        evidenceRoots: EVIDENCE_ROOTS,
        signatures: [
          { id: "permit-cpt", signature: "0x11" },
          { id: "permit-cst", signature: "0x22" },
        ],
        finalizedAt: "1100",
      },
      { verify: () => true },
      fixtureEvidenceVerifier,
    );
    expect(finalized.execution.value).toBe("0");
    expect(finalized.calls.every((call) => call.value === "0")).toBe(true);

    const verificationInputs: unknown[] = [];
    const authorization = authorizeSafePermitMessages(
      {
        configuration: configuration(),
        policy: POLICY,
        requirements: action.authorizations,
        signatureArtifacts: [
          { id: "permit-cpt", signatureBlob: "0xaa" },
          { id: "permit-cst", signatureBlob: "0xbb" },
        ],
      },
      {
        verify: (input) => {
          verificationInputs.push(input);
          return "0x1626ba7e";
        },
      },
    );
    expect(verificationInputs).toHaveLength(2);
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
        chainId: "31337",
        bundler3: address("4"),
        bundlerData: finalized.execution.data,
      },
      { verify: () => "0x1626ba7e" },
    );
    expect(wrapper.safeTxHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(wrapper.transactionAuthorization).toBe("caller-owned-not-collected");
    expect(JSON.stringify(wrapper)).not.toContain("confirmations");
  });

  it("keeps all capped-input surfaces unavailable and material-free", () => {
    const actions = createCappedInputUnavailableActions();
    const records = createCappedInputCapabilityRecords(digest("e"));
    expect(actions).toHaveLength(7);
    expect(records).toHaveLength(7);
    for (const value of [...actions, ...records]) {
      expect(value).toMatchObject({
        implemented: false,
        activated: false,
        callable: false,
      });
      const serialized = JSON.stringify(value).toLowerCase();
      for (const forbidden of [
        "approvaltransaction",
        "signaturerequest",
        "calltemplate",
        "calldata",
        "executablebytes",
        "signingmaterial",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});
