import { describe, expect, it } from "vitest";

import {
  createCappedInputUnavailableActions,
  createCorkDeploymentManifest,
  finalizeMintCollateralIn,
  finalizeMintPairedSharesOut,
  finalizePairedSharesUnwind,
  finalizeRedeemPrincipalTokenIn,
  finalizeRepurchaseCollateralInForSwap,
  finalizeUnwindCollateralOut,
  generationPayloadDigest,
  prepareMintCollateralIn,
  prepareMintPairedSharesOut,
  preparePairedSharesUnwind,
  prepareRedeemPrincipalTokenIn,
  prepareRepurchaseCollateralInForSwap,
  prepareUnwindCollateralOut,
  reconcileMintCollateralIn,
  reconcileMintPairedSharesOut,
  reconcileRedeemPrincipalTokenIn,
  reconcileRepurchaseCollateralInForSwap,
  reconcileUnwindCollateralOut,
  sha256CanonicalJson,
  simulateMintCollateralIn,
  simulateMintPairedSharesOut,
  simulateRedeemPrincipalTokenIn,
  simulateRepurchaseCollateralInForSwap,
  simulateUnwindCollateralOut,
  type BrowserSignatureVerifierV1,
  type ContractBindingV1,
  type CoreBuildV1,
  type ExactSpendFinalizationVerifierV1,
  type ExactSpendContextInputV1,
  type FinalizedExactSpendActionV1,
  type GenerationEvidenceV1,
  type GenerationPayloadV1,
  type GenerationRootKindV1,
  type JsonValue,
  type PreparedExactSpendActionV1,
  type RawObservationSuccessV1,
  type Sha256Digest,
  type UnwindIntentV1,
} from "../src/index.js";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (nibble: string) => `0x${nibble.repeat(40)}`;
const poolId = `0x${"a".repeat(64)}`;
const VERIFIER: BrowserSignatureVerifierV1 = { verify: () => true };
const FINALIZATION_VERIFIER: ExactSpendFinalizationVerifierV1 = {
  verifyFunding: () => true,
  verifyProfileState: () => true,
};
const CORE_BUILD: CoreBuildV1 = {
  packageVersion: "0.1.0",
  sourceCommit: "cd".repeat(20),
  schemaDigest: digest("f"),
};
const keccak = (byte: string) => `keccak256:${byte.repeat(64)}` as const;

function contract(
  role: ContractBindingV1["role"],
  contractAddress: string,
): ContractBindingV1 {
  return {
    role,
    address: contractAddress,
    deploymentKind: "direct",
    runtimeCodeHash: keccak("1"),
    abiArtifactDigest: digest("1"),
    sourceCommit: "ab".repeat(20),
    compiledArtifactDigest: digest("2"),
    relationships: [],
  };
}

function manifest(status: GenerationPayloadV1["status"] = "active") {
  const poolWithoutDigest = {
    poolId,
    collateralAsset: address("8"),
    referenceAsset: address("9"),
    expiryTimestamp: "1800",
    rateMin: "1",
    rateMax: "2",
    rateChangePerDayMax: "3",
    rateChangeCapacityMax: "4",
    rateOracle: address("a"),
    poolManager: address("6"),
    cptAddress: address("b"),
    cstAddress: address("c"),
    limitOrderProtocolAddress: address("d"),
    runtimeCodeHash: `0x${"2".repeat(64)}`,
    proxyIdentityDigest: digest("3"),
    criticalGettersDigest: digest("4"),
    cachedCollateralDecimals: "6",
    issuanceState: "issued" as const,
    pauseState: "unpaused" as const,
    whitelistState: "required" as const,
    adapterWhitelisted: true,
  };
  return createCorkDeploymentManifest({
    schemaVersion: "fixture-deployment-manifest/v1",
    deploymentId: "phoenix-mainnet",
    chainId: "1",
    network: "fixture",
    generation: "7",
    status,
    validFromBlock: "1",
    contracts: [
      contract("Bundler3", address("4")),
      contract("CorkAdapter", address("5")),
      contract("CorkPoolManager", address("6")),
      contract("Permit2", address("3")),
    ],
    proxies: [],
    pools: [
      {
        ...poolWithoutDigest,
        relationshipDigest: sha256CanonicalJson(
          poolWithoutDigest as unknown as JsonValue,
        ),
      },
    ],
  });
}

function generation(
  rootKind: GenerationRootKindV1,
  deploymentManifest = manifest(),
): GenerationEvidenceV1 {
  const generationId =
    rootKind === "deployment" ? "phoenix-mainnet" : "security-policy";
  const repository =
    rootKind === "deployment"
      ? "Cork-Technology/cork-deployments"
      : "Cork-Technology/cork-signing-gate";
  const directory =
    rootKind === "deployment" ? "generations" : "policy-generations";
  const releaseIdentity = `${generationId}-release-7`;
  const payload: GenerationPayloadV1 = {
    schemaVersion:
      rootKind === "deployment"
        ? "cork.deployment-generation/v1"
        : "cork.signing-policy-generation/v1",
    rootKind,
    generationId,
    generation: "7",
    status: deploymentManifest.status,
    releaseIdentity,
    contentDigest:
      rootKind === "deployment"
        ? deploymentManifest.manifestDigest
        : digest("5"),
    claims: [],
    ...(rootKind === "deployment" ? { manifest: deploymentManifest } : {}),
  };
  const payloadDigest = generationPayloadDigest(payload);
  const path = `${directory}/${generationId}/7/`;
  const key = rootKind === "deployment" ? "deployment" : "policy";
  return {
    schemaVersion: "cork.generation-evidence/v1",
    rootKind,
    repository,
    path,
    identity: { generationId, generation: "7" },
    repositoryCommit: "ab".repeat(20),
    release: {
      identity: releaseIdentity,
      tag: "v7",
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
    publisher: { identity: "bot", repository, path, publishedAt: "6" },
    transparency: {
      recordId: `${key}-record`,
      repository,
      path,
      payloadDigest,
    },
    continuity: {
      kind: "successor",
      predecessorGeneration: "6",
      predecessorPayloadDigest: digest("6"),
    },
    signatures: [0, 1].map((order) => ({
      order: String(order),
      keyId: `${key}-${order}`,
      algorithm: "ed25519" as const,
      rootKind,
      payloadDigest,
      signedAt: String(4 + order),
      signature: `${key}-${order}`,
    })),
  };
}

const EVIDENCE_ROOTS = {
  deployment: generation("deployment"),
  policy: generation("signing-policy"),
};

const UNWIND_INTENT: UnwindIntentV1 = {
  schemaVersion: "cork.operation/v1",
  action: "phoenix.unwind-mint",
  clientRequestId: "unwind-1",
  account: {
    kind: "externally-owned-account",
    address: address("1"),
  },
  chainId: "1",
  deploymentId: "phoenix-mainnet",
  poolId,
  requestedSharesIn: "1500000000000",
  receiver: address("2"),
  minCollateralAssetsOut: "100",
  deadline: "1200",
};

const UNWIND_BINDINGS = {
  evidenceRoots: EVIDENCE_ROOTS,
  liveCollateralDecimals: "6",
  preparedAt: "1000",
  adapterStartingBalancesDigest: digest("3"),
};

function context(
  amount: string,
  phase: "pre-expiry" | "post-expiry" = "pre-expiry",
  fundingCount = 1,
): ExactSpendContextInputV1 {
  const currentTime = phase === "pre-expiry" ? "1500" : "1900";
  return {
    evidenceRoots: EVIDENCE_ROOTS,
    poolId,
    account: {
      kind: "externally-owned-account",
      address: address("1"),
    },
    receiver: address("2"),
    deadline: "2000",
    currentTime,
    funding: Array.from({ length: fundingCount }, (_, index) => ({
      mode: "token-allowance" as const,
      token:
        fundingCount === 2
          ? index === 0
            ? address("b")
            : address("c")
          : phase === "post-expiry"
            ? address("b")
            : address("8"),
      amount,
      authorizationDigest: digest(index === 0 ? "5" : "6"),
    })),
    adapterStartingBalancesDigest: digest("7"),
  };
}

function preparedExactSpendActions(): readonly PreparedExactSpendActionV1[] {
  return [
    prepareMintCollateralIn(
      {
        context: context("100"),
        collateralAssetsIn: "100",
        minCptAndCstSharesOut: "90",
        currentFee: "0",
      },
      VERIFIER,
    ),
    prepareMintPairedSharesOut(
      {
        context: context("100"),
        cptAndCstSharesOut: "80",
        previewCollateralAssetsIn: "100",
        maxCollateralAssetsIn: "110",
        currentFee: "0",
      },
      VERIFIER,
    ),
    prepareRepurchaseCollateralInForSwap(
      {
        context: context("100"),
        collateralAssetsIn: "100",
        minReferenceAssetsOut: "10",
        minCstSharesOut: "11",
        liveRate: "2",
        currentFee: "1",
        requiredLockedPosition: "20",
        availableLockedPosition: "21",
      },
      VERIFIER,
    ),
    prepareUnwindCollateralOut(
      {
        context: context("1000000000000", "pre-expiry", 2),
        collateralAssetsOut: "90",
        previewCptAndCstSharesIn: "1000000000000",
        maxCptAndCstSharesIn: "1100000000000",
        shareQuantum: "1000000000000",
      },
      VERIFIER,
    ),
    prepareRedeemPrincipalTokenIn(
      {
        context: context("100", "post-expiry"),
        cptSharesIn: "100",
        minReferenceAssetsOut: "10",
        minCollateralAssetsOut: "11",
        liquidityState: "first-call",
      },
      VERIFIER,
    ),
  ];
}

function observation(
  providerId: string,
  administrationId: string,
  value: JsonValue,
): RawObservationSuccessV1 {
  return {
    schemaVersion: "cork.raw-observation/v1",
    kind: "success",
    providerId,
    administrationId,
    sourceId: "exact-spend-chain-reader",
    requestDigest: digest("8"),
    sourceCommit: "ef".repeat(20),
    sourceSchemaDigest: digest("9"),
    observedAt: "2001",
    block: {
      kind: "independently-pinned",
      blockNumber: "100",
      blockHash: `0x${"d".repeat(64)}`,
      parentBlockHash: `0x${"e".repeat(64)}`,
    },
    value,
  };
}

function finalizePrepared(
  prepared: PreparedExactSpendActionV1,
): FinalizedExactSpendActionV1 {
  const input = {
    prepared,
    evidenceRoots: EVIDENCE_ROOTS,
    finalizedAt: prepared.context.phase === "pre-expiry" ? "1550" : "1950",
  };
  switch (prepared.profile) {
    case "mint-collateral-in":
      return finalizeMintCollateralIn(input, FINALIZATION_VERIFIER, VERIFIER);
    case "mint-paired-shares-out":
      return finalizeMintPairedSharesOut(
        input,
        FINALIZATION_VERIFIER,
        VERIFIER,
      );
    case "repurchase-collateral-in-for-swap":
      return finalizeRepurchaseCollateralInForSwap(
        input,
        FINALIZATION_VERIFIER,
        VERIFIER,
      );
    case "unwind-collateral-out":
      return finalizeUnwindCollateralOut(
        input,
        FINALIZATION_VERIFIER,
        VERIFIER,
      );
    case "redeem-principal-token-in":
      return finalizeRedeemPrincipalTokenIn(
        input,
        FINALIZATION_VERIFIER,
        VERIFIER,
      );
  }
}

function simulateFinalized(finalized: FinalizedExactSpendActionV1) {
  const input = {
    finalized,
    producerBuild: CORE_BUILD,
    providerIds: ["simulator-a", "simulator-b"],
    block: {
      blockNumber: "100",
      blockHash: `0x${"d".repeat(64)}`,
    },
    simulatedAt: "2000",
    outcome: {
      status: "success" as const,
      traceDigest: digest("a"),
      gasUsed: "100000",
      callResultDigests: [digest("b")],
      deltasDigest: digest("c"),
      assertionDigests: [digest("d")],
    },
  };
  switch (finalized.profile) {
    case "mint-collateral-in":
      return simulateMintCollateralIn(input);
    case "mint-paired-shares-out":
      return simulateMintPairedSharesOut(input);
    case "repurchase-collateral-in-for-swap":
      return simulateRepurchaseCollateralInForSwap(input);
    case "unwind-collateral-out":
      return simulateUnwindCollateralOut(input);
    case "redeem-principal-token-in":
      return simulateRedeemPrincipalTokenIn(input);
  }
}

function chainEvidence(
  finalized: FinalizedExactSpendActionV1,
  residualDigest = finalized.prepared.context.adapterStartingBalancesDigest,
): JsonValue {
  return {
    schemaVersion: "cork.exact-spend-chain-evidence/v1",
    transactionHash: `0x${"f".repeat(64)}`,
    chainId: finalized.prepared.context.chainId,
    sender: finalized.execution.sender,
    target: finalized.execution.target,
    value: "0",
    payloadDigest: finalized.execution.payloadDigest,
    executionDigest: finalized.execution.executionDigest,
    receiptStatus: "success",
    canonical: true,
    finalized: true,
    adapterStartingBalancesDigest:
      finalized.prepared.context.adapterStartingBalancesDigest,
    adapterEndingBalancesDigest: residualDigest,
    actionCreatedAllowancesAtEnd: "0",
    assertions: finalized.reconciliationProjection.map((field) => ({
      field,
      satisfied: true,
    })),
  };
}

function reconcileFinalized(
  finalized: FinalizedExactSpendActionV1,
  value: JsonValue = chainEvidence(finalized),
) {
  const input = {
    finalized,
    evidenceRoots: EVIDENCE_ROOTS,
    observations: [
      observation("provider-a", "operator-a", value),
      observation("provider-b", "operator-b", value),
    ],
  };
  switch (finalized.profile) {
    case "mint-collateral-in":
      return reconcileMintCollateralIn(input, VERIFIER);
    case "mint-paired-shares-out":
      return reconcileMintPairedSharesOut(input, VERIFIER);
    case "repurchase-collateral-in-for-swap":
      return reconcileRepurchaseCollateralInForSwap(input, VERIFIER);
    case "unwind-collateral-out":
      return reconcileUnwindCollateralOut(input, VERIFIER);
    case "redeem-principal-token-in":
      return reconcileRedeemPrincipalTokenIn(input, VERIFIER);
  }
}

describe("paired-shares unwind and named exact-spend profiles", () => {
  it("derives adjacent role nonces and reconstructs exactly three frozen calls", () => {
    const prepared = preparePairedSharesUnwind(
      {
        intent: UNWIND_INTENT,
        bindings: UNWIND_BINDINGS,
      },
      VERIFIER,
    );
    const cptNonce = BigInt(prepared.authorizations[0].nonce);
    const cstNonce = BigInt(prepared.authorizations[1].nonce);
    expect(cptNonce & 1n).toBe(0n);
    expect(cstNonce).toBe(cptNonce + 1n);
    expect(prepared.constraints).toMatchObject({
      requestedSharesIn: "1500000000000",
      effectiveSharesIn: "1000000000000",
      shareQuantum: "1000000000000",
      callCount: "3",
    });
    expect(prepared.callTemplates.map((call) => call.functionName)).toEqual([
      "permit2TransferFromWithPermit",
      "permit2TransferFromWithPermit",
      "safeUnwindMint",
    ]);

    const finalized = finalizePairedSharesUnwind(
      {
        prepared,
        evidenceRoots: EVIDENCE_ROOTS,
        signatures: [
          { id: "permit-cpt", signature: "0x11" },
          { id: "permit-cst", signature: "0x22" },
        ],
        finalizedAt: "1100",
      },
      { verify: () => true },
      VERIFIER,
    );
    expect(finalized.calls).toHaveLength(3);
    expect(finalized.calls.every((call) => call.to === address("5"))).toBe(
      true,
    );
    expect(finalized.calls.every((call) => call.value === "0")).toBe(true);
    expect(finalized.execution.to).toBe(address("4"));

    const tampered = {
      ...prepared,
      callTemplates: [
        ...prepared.callTemplates.slice(0, 2),
        { ...prepared.callTemplates[2]!, to: address("9") },
      ],
    };
    expect(() =>
      finalizePairedSharesUnwind(
        {
          prepared: tampered as typeof prepared,
          evidenceRoots: EVIDENCE_ROOTS,
          signatures: [
            { id: "permit-cpt", signature: "0x11" },
            { id: "permit-cst", signature: "0x22" },
          ],
          finalizedAt: "1100",
        },
        { verify: () => true },
        VERIFIER,
      ),
    ).toThrow(/reconstruction/u);
  });

  it("exposes five independently named exact-spend constructors", () => {
    const [, mintShares, , unwind, redeem] = preparedExactSpendActions();

    expect(preparedExactSpendActions().map((action) => action.profile)).toEqual(
      [
        "mint-collateral-in",
        "mint-paired-shares-out",
        "repurchase-collateral-in-for-swap",
        "unwind-collateral-out",
        "redeem-principal-token-in",
      ],
    );
    expect(mintShares?.fundingCalls[0]?.arguments).toContain("100");
    expect(unwind?.protectedCall.arguments[2]).toBe(address("5"));
    expect(redeem?.context.phase).toBe("post-expiry");
    for (const action of preparedExactSpendActions()) {
      expect(action.residualPreservation).toEqual({
        adapterBalancesReturnToStart: true,
        actionCreatedAllowancesReturnToZero: true,
      });
      expect(Object.isFrozen(action)).toBe(true);
    }
  });

  it("finalizes, simulates, and reconciles every exact-spend profile without changing bytes", () => {
    for (const prepared of preparedExactSpendActions()) {
      const finalized = finalizePrepared(prepared);
      expect(finalized.profile).toBe(prepared.profile);
      expect(finalized.execution.calldata).toBe(prepared.bundlerData);
      expect(finalized.execution.payloadDigest).toBe(prepared.payloadDigest);
      expect(finalized.execution.target).toBe(address("4"));

      const simulation = simulateFinalized(finalized);
      expect(simulation.execution).toEqual(finalized.execution);
      expect(simulation.execution.payloadDigest).toBe(prepared.payloadDigest);
      expect(simulation.outcome.status).toBe("success");

      const reconciliation = reconcileFinalized(finalized);
      expect(reconciliation).toMatchObject({
        profile: prepared.profile,
        status: "executed-success",
        retryable: false,
        effectsVerified: true,
        residualsPreserved: true,
      });
      expect(reconciliation.canonicalBlock?.providerIds).toEqual([
        "provider-a",
        "provider-b",
      ]);
    }
  });

  it("rejects prepared substitution and normalizes residual conflicts", () => {
    const prepared = preparedExactSpendActions()[0]!;
    const tampered = {
      ...prepared,
      protectedCall: {
        ...prepared.protectedCall,
        to: address("9"),
      },
    };
    expect(() =>
      finalizeMintCollateralIn(
        {
          prepared: tampered,
          evidenceRoots: EVIDENCE_ROOTS,
          finalizedAt: "1550",
        },
        FINALIZATION_VERIFIER,
        VERIFIER,
      ),
    ).toThrow(/PREPARED_ARTIFACT_MISMATCH/u);

    const finalized = finalizePrepared(prepared);
    const conflict = reconcileFinalized(
      finalized,
      chainEvidence(finalized, digest("0")),
    );
    expect(conflict).toMatchObject({
      status: "conflict",
      retryable: false,
      effectsVerified: false,
      residualsPreserved: false,
    });

    expect(() =>
      finalizeMintCollateralIn(
        {
          prepared,
          evidenceRoots: EVIDENCE_ROOTS,
          finalizedAt: "1550",
        },
        {
          verifyFunding: () => true,
          verifyProfileState: () => false,
        },
        VERIFIER,
      ),
    ).toThrow(/profile state verification/u);
  });

  it("keeps all seven capped-input variants visible and material-free", () => {
    const unavailable = createCappedInputUnavailableActions();
    expect(unavailable).toHaveLength(7);
    for (const record of unavailable) {
      expect(record).toMatchObject({
        implemented: false,
        activated: false,
        healthy: false,
        callable: false,
        error: { code: "CAPPED_INPUT_PROTOCOL_UNAVAILABLE" },
      });
      const serialized = JSON.stringify(record).toLowerCase();
      for (const forbidden of [
        "approval",
        "signature",
        "typeddata",
        "calltemplate",
        "calldata",
        "executablebytes",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});
