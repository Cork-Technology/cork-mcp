import {
  createSafeCallProposal,
  finalizeMintCollateralIn,
  finalizeMintPairedSharesOut,
  finalizeRedeemPrincipalTokenIn,
  finalizeRepurchaseCollateralInForSwap,
  finalizeUnwindCollateralOut,
  prepareMintCollateralIn,
  prepareMintPairedSharesOut,
  prepareRedeemPrincipalTokenIn,
  prepareRepurchaseCollateralInForSwap,
  prepareUnwindCollateralOut,
  type ExactSpendContextInputV1,
  type FinalizedExactSpendActionV1,
  type FundingProofV1,
  type PreparedExactSpendActionV1,
} from "@corkprotocol/operations";
import { type LocalSafeToolDefinition } from "./dev-safe-fixture.js";
import {
  LOCAL_FIXTURE_MARKETS,
  createLocalSafeFixtureEnvironment,
  prepareLocalSafeUnwind,
  type LocalSafeFixtureEnvironment,
} from "./dev-safe-fixture.js";

const PRE_EXPIRY_TIME = "1800000000";
const PRE_EXPIRY_DEADLINE = "1800003600";
const POST_EXPIRY_TIME = "2000000100";
const POST_EXPIRY_DEADLINE = "2000001000";

export const LOCAL_SAFE_COVERAGE_TOOL = {
  name: "cork.local.safe.coverage.v1",
  description:
    "Construct non-broadcast Safe proposals for every locally supported Cork action profile using synthetic fixtures.",
  scope: "action:write",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      marketId: { type: "string" },
      baseSafeNonce: { type: "string" },
    },
    required: ["marketId", "baseSafeNonce"],
  },
} as const satisfies LocalSafeToolDefinition;

function funding(
  environment: LocalSafeFixtureEnvironment,
  token: string,
  amount: string,
  id: string,
): FundingProofV1 {
  return {
    mode: "token-allowance",
    token,
    amount,
    authorizationDigest: environment.digest(
      `${environment.market.id}:${id}:funding`,
    ),
  };
}

function context(
  environment: LocalSafeFixtureEnvironment,
  input: {
    readonly phase: "pre-expiry" | "post-expiry";
    readonly funding: readonly FundingProofV1[];
  },
): ExactSpendContextInputV1 {
  return {
    evidenceRoots: environment.roots,
    poolId: environment.market.poolId,
    account: { kind: "safe", address: environment.safeAddress },
    receiver: environment.safeAddress,
    deadline:
      input.phase === "pre-expiry" ? PRE_EXPIRY_DEADLINE : POST_EXPIRY_DEADLINE,
    currentTime:
      input.phase === "pre-expiry" ? PRE_EXPIRY_TIME : POST_EXPIRY_TIME,
    funding: input.funding,
    adapterStartingBalancesDigest: environment.digest(
      `${environment.market.id}:${input.phase}:adapter-balances`,
    ),
  };
}

function preparedActions(
  environment: LocalSafeFixtureEnvironment,
): readonly PreparedExactSpendActionV1[] {
  const market = environment.market;
  const verify = environment.evidenceVerifier;
  return [
    prepareMintCollateralIn(
      {
        context: context(environment, {
          phase: "pre-expiry",
          funding: [
            funding(
              environment,
              market.collateralAsset.address,
              "1000000",
              "mint-collateral-in",
            ),
          ],
        }),
        collateralAssetsIn: "1000000",
        minCptAndCstSharesOut: "900000",
        currentFee: "0",
      },
      verify,
    ),
    prepareMintPairedSharesOut(
      {
        context: context(environment, {
          phase: "pre-expiry",
          funding: [
            funding(
              environment,
              market.collateralAsset.address,
              "1000000",
              "mint-paired-shares-out",
            ),
          ],
        }),
        cptAndCstSharesOut: "800000",
        previewCollateralAssetsIn: "1000000",
        maxCollateralAssetsIn: "1100000",
        currentFee: "0",
      },
      verify,
    ),
    prepareRepurchaseCollateralInForSwap(
      {
        context: context(environment, {
          phase: "pre-expiry",
          funding: [
            funding(
              environment,
              market.collateralAsset.address,
              "1000000",
              "repurchase-collateral-in-for-swap",
            ),
          ],
        }),
        collateralAssetsIn: "1000000",
        minReferenceAssetsOut: "100000",
        minCstSharesOut: "110000",
        liveRate: "2",
        currentFee: "1",
        requiredLockedPosition: "200000",
        availableLockedPosition: "210000",
      },
      verify,
    ),
    prepareUnwindCollateralOut(
      {
        context: context(environment, {
          phase: "pre-expiry",
          funding: [
            funding(
              environment,
              market.cptAddress,
              market.shareQuantum,
              "unwind-collateral-out-cpt",
            ),
            funding(
              environment,
              market.cstAddress,
              market.shareQuantum,
              "unwind-collateral-out-cst",
            ),
          ],
        }),
        collateralAssetsOut: "900000",
        previewCptAndCstSharesIn: market.shareQuantum,
        maxCptAndCstSharesIn: market.shareQuantum,
        shareQuantum: market.shareQuantum,
      },
      verify,
    ),
    prepareRedeemPrincipalTokenIn(
      {
        context: context(environment, {
          phase: "post-expiry",
          funding: [
            funding(
              environment,
              market.cptAddress,
              market.shareQuantum,
              "redeem-principal-token-in",
            ),
          ],
        }),
        cptSharesIn: market.shareQuantum,
        minReferenceAssetsOut: "100000",
        minCollateralAssetsOut: "110000",
        liquidityState: "first-call",
      },
      verify,
    ),
  ];
}

function finalize(
  prepared: PreparedExactSpendActionV1,
  proposal: ReturnType<typeof createSafeCallProposal>,
  environment: LocalSafeFixtureEnvironment,
): FinalizedExactSpendActionV1 {
  const input = {
    prepared,
    evidenceRoots: environment.roots,
    finalizedAt:
      prepared.context.phase === "pre-expiry"
        ? (BigInt(PRE_EXPIRY_TIME) + 1n).toString()
        : (BigInt(POST_EXPIRY_TIME) + 1n).toString(),
    accountWrapper: {
      kind: "safe" as const,
      safeAddress: environment.safeAddress,
      nonce: proposal.nonce,
      safeTxHash: proposal.safeTxHash,
    },
  };
  const finalizationVerifier = {
    verifyFunding: () => true,
    verifyProfileState: () => true,
  };
  switch (prepared.profile) {
    case "mint-collateral-in":
      return finalizeMintCollateralIn(
        input,
        finalizationVerifier,
        environment.evidenceVerifier,
      );
    case "mint-paired-shares-out":
      return finalizeMintPairedSharesOut(
        input,
        finalizationVerifier,
        environment.evidenceVerifier,
      );
    case "repurchase-collateral-in-for-swap":
      return finalizeRepurchaseCollateralInForSwap(
        input,
        finalizationVerifier,
        environment.evidenceVerifier,
      );
    case "unwind-collateral-out":
      return finalizeUnwindCollateralOut(
        input,
        finalizationVerifier,
        environment.evidenceVerifier,
      );
    case "redeem-principal-token-in":
      return finalizeRedeemPrincipalTokenIn(
        input,
        finalizationVerifier,
        environment.evidenceVerifier,
      );
  }
}

function validateInput(value: unknown): {
  readonly marketId: string;
  readonly baseSafeNonce: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("local Safe coverage input must be an object");
  }
  const input = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(input);
  if (
    keys.length !== 2 ||
    !keys.includes("marketId") ||
    !keys.includes("baseSafeNonce")
  ) {
    throw new TypeError(
      "local Safe coverage input requires only marketId and baseSafeNonce",
    );
  }
  if (
    typeof input["marketId"] !== "string" ||
    !LOCAL_FIXTURE_MARKETS.some((market) => market.id === input["marketId"])
  ) {
    throw new TypeError("marketId is not a known local fixture market");
  }
  if (
    typeof input["baseSafeNonce"] !== "string" ||
    !/^(0|[1-9][0-9]*)$/u.test(input["baseSafeNonce"])
  ) {
    throw new TypeError("baseSafeNonce must be a canonical unsigned integer");
  }
  return {
    marketId: input["marketId"],
    baseSafeNonce: input["baseSafeNonce"],
  };
}

export function prepareLocalSafeCoverage(value: unknown) {
  const input = validateInput(value);
  const paired = prepareLocalSafeUnwind({
    marketId: input.marketId,
    requestedSharesIn: "2500000000000",
    minimumCollateralAssetsOut: "1000000",
    safeNonce: input.baseSafeNonce,
  });
  const exactSpend = preparedActions(
    createLocalSafeFixtureEnvironment(input.marketId, input.baseSafeNonce),
  ).map((prepared, index) => {
    const nonce = (BigInt(input.baseSafeNonce) + BigInt(index) + 1n).toString();
    const environment = createLocalSafeFixtureEnvironment(
      input.marketId,
      nonce,
    );
    const proposal = createSafeCallProposal({
      configuration: environment.configuration,
      policy: environment.policy,
      chainId: environment.market.chainId,
      to: prepared.context.bundler3,
      data: prepared.bundlerData,
    });
    const finalized = finalize(prepared, proposal, environment);
    return Object.freeze({
      profile: prepared.profile,
      coreFunction: prepared.protectedCall.functionName,
      prepared,
      finalized,
      safeProposal: proposal,
    });
  });

  return Object.freeze({
    schemaVersion: "cork.local-safe-coverage/v1" as const,
    fixtureOnly: true as const,
    broadcastReady: false as const,
    market: paired.market,
    actions: Object.freeze([
      Object.freeze({
        profile: "paired-shares-unwind" as const,
        coreFunction: "safeUnwindMint" as const,
        prepared: paired.prepared,
        finalized: paired.finalized,
        safeProposal: paired.safeTransaction,
      }),
      ...exactSpend,
    ]),
    safety: Object.freeze({
      source: "synthetic-local-fixture" as const,
      proposalsSubmitted: false as const,
      safeConfirmationsCollected: false as const,
      chainSimulationPerformed: false as const,
      executionClaimed: false as const,
    }),
  });
}
